import "server-only";
import { MongoServerError, ObjectId, type ClientSession, type Db } from "mongodb";
import { getDb, getMongoClient } from "../mongodb";
import { AppError } from "../errors";
import { safeTimeZone } from "../time";
import { calculateCharge, countNights, defaultParkingPolicy, suggestTariff, type ParkingRates } from "../parking-tariff";
import { checkoutConfirmSchema, type CheckoutConfirmInput } from "../validations/parking-checkout";
import { requirePermission, type AuthorizationSelection, type LocationContext } from "./authorization";
import type { TariffType, VehicleType } from "../../types";

// Vehicle checkout (P4.5): Owner-only, cash-only. The total is always computed
// here from the location's active tariffs (or the agreed default policy) at the
// server's confirmation time; the session id from the browser is only an
// untrusted selection re-scoped to the guarded tenant/location.

export interface CheckoutQuote {
  readonly sessionId: string;
  readonly plateNumber: string;
  readonly vehicleType: VehicleType;
  readonly locationName: string;
  readonly entryAt: string;
  readonly quotedAt: string;
  readonly timeZone: string;
  readonly nights: number;
  readonly suggestion: { readonly tariffType: TariffType; readonly nightCount: number };
  readonly rates: ParkingRates;
  readonly policy: { readonly openTime: string; readonly closeTime: string };
}
export interface CheckoutReceipt {
  readonly plateNumber: string;
  readonly vehicleType: VehicleType;
  readonly locationName: string;
  readonly entryAt: string;
  readonly exitAt: string;
  readonly timeZone: string;
  readonly tariffType: TariffType;
  readonly nightCount?: number;
  readonly amountPerUnit: number;
  readonly totalAmount: number;
  readonly paymentMethod: "cash";
}
export type CheckoutView =
  | { readonly kind: "active"; readonly quote: CheckoutQuote }
  | { readonly kind: "completed"; readonly receipt: CheckoutReceipt | null }
  | { readonly kind: "canceled"; readonly plateNumber: string }
  | { readonly kind: "not_found" }
  | { readonly kind: "not_ready" }
  | { readonly kind: "tariff_unavailable" };
export type CheckoutResult =
  | { readonly ok: true; readonly receipt: CheckoutReceipt; readonly replayed: boolean }
  | { readonly ok: false; readonly reason: "validation" | "not_found" | "already_completed" | "not_active" | "not_ready" | "tariff_unavailable" }
  | { readonly ok: false; readonly reason: "price_changed"; readonly totalAmount: number };

// The documented guard against two completed payments for one session
// (DATABASE_SCHEMA 11). Fail closed until it exists, like the P4.3 entry index.
export const completedTransactionIndex = { name: "parking_transactions_completed_session_unique", key: { tenantId: 1, parkingSessionId: 1 }, partialFilterExpression: { status: "completed" } } as const;
let completedTransactionIndexVerified = false;
async function hasCompletedTransactionIndex(db: Db): Promise<boolean> {
  if (completedTransactionIndexVerified) return true;
  try {
    const indexes = await db.collection("parkingTransactions").listIndexes().toArray();
    completedTransactionIndexVerified = indexes.some((index) => index.unique === true && !index.sparse && !index.collation
      && JSON.stringify(index.key) === JSON.stringify(completedTransactionIndex.key)
      && JSON.stringify(index.partialFilterExpression) === JSON.stringify(completedTransactionIndex.partialFilterExpression));
  } catch {
    completedTransactionIndexVerified = false; // e.g. NamespaceNotFound before the migration
  }
  return completedTransactionIndexVerified;
}
/** Test hook: forget the cached index verification. */
export function resetCheckoutIndexCacheForTests(): void { completedTransactionIndexVerified = false; }

type Options = { session?: ClientSession };
const transactionOptions = { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" } as const;
const isVehicleType = (value: unknown): value is VehicleType => value === "motor" || value === "mobil";
const isTariffType = (value: unknown): value is TariffType => value === "regular" || value === "overnight";
class Conflict extends Error {}

async function ownerCheckoutContext(selection: AuthorizationSelection): Promise<LocationContext> {
  const context = await requirePermission("parking.checkout", selection);
  if (context.role !== "owner") throw new AppError("FORBIDDEN"); // Admin/Staff checkout is out of scope.
  return context;
}

// Active tariffs for this location and vehicle type; each tariff type falls
// back to the agreed default when none is configured. Ambiguous (more than one
// active) or invalid amounts block checkout instead of guessing (null).
async function resolveRates(db: Db, context: LocationContext, vehicleType: VehicleType, options: Options): Promise<ParkingRates | null> {
  const rows = await db.collection("tariffs").find({ tenantId: context.tenantId, locationId: context.locationId, vehicleType, status: "active" }, { ...options, projection: { tariffType: 1, amount: 1 } }).limit(10).toArray();
  const pick = (tariffType: TariffType, fallback: number) => {
    const matching = rows.filter((row) => row.tariffType === tariffType);
    if (matching.length === 0) return { amount: fallback, source: "default" as const };
    if (matching.length > 1 || !Number.isSafeInteger(matching[0].amount) || matching[0].amount <= 0) return null;
    return { amount: matching[0].amount as number, source: "location" as const };
  };
  const regular = pick("regular", defaultParkingPolicy.regularAmount);
  const overnight = pick("overnight", defaultParkingPolicy.overnightAmountPerNight);
  return regular && overnight ? { regular, overnight } : null;
}

async function loadScope(db: Db, context: LocationContext, options: Options) {
  const tenant = await db.collection("tenants").findOne({ _id: context.tenantId, status: "active" }, { ...options, projection: { timezone: 1 } });
  const location = await db.collection("locations").findOne({ _id: context.locationId, tenantId: context.tenantId, status: "active" }, { ...options, projection: { name: 1, timezone: 1 } });
  if (!tenant || !location) throw new AppError("FORBIDDEN");
  // Location time zone first (BUSINESS_RULE: location business time), then tenant.
  const timeZone = safeTimeZone(typeof location.timezone === "string" && location.timezone ? location.timezone : tenant.timezone);
  return { timeZone, locationName: typeof location.name === "string" ? location.name : "" };
}

type SessionRow = { _id: ObjectId; plateNumberSnapshot?: unknown; vehicleTypeSnapshot?: unknown; entryAt?: unknown; exitAt?: unknown; status?: unknown };
type TransactionRow = { idempotencyKey?: unknown; processedBy?: unknown; amountPaid?: unknown; paymentAt?: unknown; tariffSnapshot?: { tariffType?: unknown; amountPerUnit?: unknown; nightCount?: unknown; totalAmount?: unknown } };
const sessionProjection = { plateNumberSnapshot: 1, vehicleTypeSnapshot: 1, entryAt: 1, exitAt: 1, status: 1 } as const;
const transactionProjection = { idempotencyKey: 1, processedBy: 1, amountPaid: 1, paymentAt: 1, tariffSnapshot: 1 } as const;

function receiptOf(session: SessionRow, transaction: TransactionRow, scope: { timeZone: string; locationName: string }): CheckoutReceipt | null {
  const snapshot = transaction.tariffSnapshot;
  const exitAt = session.exitAt instanceof Date ? session.exitAt : transaction.paymentAt;
  if (!(session.entryAt instanceof Date) || !(exitAt instanceof Date) || typeof session.plateNumberSnapshot !== "string" || !isVehicleType(session.vehicleTypeSnapshot)
    || !snapshot || !isTariffType(snapshot.tariffType) || typeof snapshot.amountPerUnit !== "number" || typeof snapshot.totalAmount !== "number") return null;
  return Object.freeze({
    plateNumber: session.plateNumberSnapshot, vehicleType: session.vehicleTypeSnapshot, locationName: scope.locationName,
    entryAt: session.entryAt.toISOString(), exitAt: exitAt.toISOString(), timeZone: scope.timeZone,
    tariffType: snapshot.tariffType, ...(typeof snapshot.nightCount === "number" ? { nightCount: snapshot.nightCount } : {}),
    amountPerUnit: snapshot.amountPerUnit, totalAmount: snapshot.totalAmount, paymentMethod: "cash" as const,
  });
}
const parseSessionId = (raw: string): ObjectId | null => (/^[a-f\d]{24}$/i.test(raw) ? new ObjectId(raw.toLowerCase()) : null);

// Read model for the checkout screen. Throws AppError UNAUTHENTICATED /
// FORBIDDEN (incl. suspended tenant, inactive location) / SERVICE_UNAVAILABLE.
export async function getParkingCheckout(selection: AuthorizationSelection, rawSessionId: string, now: Date = new Date()): Promise<CheckoutView> {
  const context = await ownerCheckoutContext(selection);
  const sessionId = parseSessionId(rawSessionId);
  if (!sessionId) return { kind: "not_found" };
  try {
    const db = await getDb();
    const scope = await loadScope(db, context, {});
    const session = await db.collection("parkingSessions").findOne({ _id: sessionId, tenantId: context.tenantId, locationId: context.locationId }, { projection: sessionProjection }) as SessionRow | null;
    if (!session || typeof session.plateNumberSnapshot !== "string" || !isVehicleType(session.vehicleTypeSnapshot) || !(session.entryAt instanceof Date)) return { kind: "not_found" };
    if (session.status === "completed") {
      const transaction = await db.collection("parkingTransactions").findOne({ tenantId: context.tenantId, parkingSessionId: sessionId, status: "completed" }, { projection: transactionProjection }) as TransactionRow | null;
      return { kind: "completed", receipt: transaction ? receiptOf(session, transaction, scope) : null };
    }
    if (session.status !== "active") return { kind: "canceled", plateNumber: session.plateNumberSnapshot };
    if (!await hasCompletedTransactionIndex(db)) return { kind: "not_ready" };
    const rates = await resolveRates(db, context, session.vehicleTypeSnapshot, {});
    if (!rates) return { kind: "tariff_unavailable" };
    const nights = countNights(session.entryAt, now, scope.timeZone, defaultParkingPolicy.closeTime);
    return { kind: "active", quote: Object.freeze({
      sessionId: sessionId.toHexString(), plateNumber: session.plateNumberSnapshot, vehicleType: session.vehicleTypeSnapshot, locationName: scope.locationName,
      entryAt: session.entryAt.toISOString(), quotedAt: now.toISOString(), timeZone: scope.timeZone, nights, suggestion: suggestTariff(nights), rates,
      policy: { openTime: defaultParkingPolicy.openTime, closeTime: defaultParkingPolicy.closeTime },
    }) };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("SERVICE_UNAVAILABLE");
  }
}

// A retry with the same idempotency key by the same Owner and the same tariff
// choice returns the committed result instead of a conflict.
function sameRequest(transaction: TransactionRow, input: CheckoutConfirmInput, actor: ObjectId): boolean {
  return transaction.idempotencyKey === input.idempotencyKey && transaction.processedBy instanceof ObjectId && transaction.processedBy.equals(actor)
    && transaction.tariffSnapshot?.tariffType === input.tariffType && (transaction.tariffSnapshot?.nightCount ?? undefined) === input.nightCount;
}

// Atomic checkout: payment transaction + session completion + audit in one
// MongoDB transaction. The conditional update (status: "active") and the unique
// partial index make a second completion impossible; double-clicks, retries and
// concurrent requests either replay the same result or get already_completed.
// Throws AppError UNAUTHENTICATED / FORBIDDEN / SERVICE_UNAVAILABLE (outcome unknown).
export async function completeParkingCheckout(selection: AuthorizationSelection, raw: unknown): Promise<CheckoutResult> {
  const context = await ownerCheckoutContext(selection);
  const parsed = checkoutConfirmSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "validation" };
  const input = parsed.data;
  const sessionId = new ObjectId(input.sessionId);
  let db: Db | undefined;
  let session: ClientSession | undefined;
  // Committed-result lookup after a conflict or an ambiguous failure.
  const lookup = async (): Promise<CheckoutResult | null> => {
    if (!db) return null;
    const scope = await loadScope(db, context, {});
    const row = await db.collection("parkingSessions").findOne({ _id: sessionId, tenantId: context.tenantId, locationId: context.locationId }, { projection: sessionProjection }) as SessionRow | null;
    const transaction = row ? await db.collection("parkingTransactions").findOne({ tenantId: context.tenantId, parkingSessionId: sessionId, status: "completed" }, { projection: transactionProjection }) as TransactionRow | null : null;
    if (row?.status === "canceled") return { ok: false, reason: "not_active" };
    if (!row || !transaction) return null;
    if (!sameRequest(transaction, input, context.userId)) return { ok: false, reason: "already_completed" };
    const receipt = receiptOf(row, transaction, scope);
    return receipt ? { ok: true, receipt, replayed: true } : null;
  };
  try {
    db = await getDb();
    const database = db;
    if (!await hasCompletedTransactionIndex(database)) return { ok: false, reason: "not_ready" };
    const client = await getMongoClient();
    session = client.startSession();
    const active = session;
    let outcome: CheckoutResult | undefined;
    await active.withTransaction(async () => {
      outcome = undefined; // withTransaction may retry the whole callback
      const options = { session: active };
      // Re-check inside the transaction: a suspension/deactivation that raced
      // the guard must still block the write.
      const scope = await loadScope(database, context, options);
      const row = await database.collection("parkingSessions").findOne({ _id: sessionId, tenantId: context.tenantId, locationId: context.locationId }, { ...options, projection: sessionProjection }) as SessionRow | null;
      if (!row || typeof row.plateNumberSnapshot !== "string" || !isVehicleType(row.vehicleTypeSnapshot) || !(row.entryAt instanceof Date)) { outcome = { ok: false, reason: "not_found" }; return; }
      if (row.status === "completed") {
        const transaction = await database.collection("parkingTransactions").findOne({ tenantId: context.tenantId, parkingSessionId: sessionId, status: "completed" }, { ...options, projection: transactionProjection }) as TransactionRow | null;
        const receipt = transaction && sameRequest(transaction, input, context.userId) ? receiptOf(row, transaction, scope) : null;
        outcome = receipt ? { ok: true, receipt, replayed: true } : { ok: false, reason: "already_completed" };
        return;
      }
      if (row.status !== "active") { outcome = { ok: false, reason: "not_active" }; return; }
      const rates = await resolveRates(database, context, row.vehicleTypeSnapshot, options);
      if (!rates) { outcome = { ok: false, reason: "tariff_unavailable" }; return; }
      const charge = calculateCharge(rates, input.tariffType, input.nightCount);
      if (!charge.ok) { outcome = { ok: false, reason: "validation" }; return; }
      // The Owner collected the amount shown; never charge a different one.
      if (charge.totalAmount !== input.expectedTotal) { outcome = { ok: false, reason: "price_changed", totalAmount: charge.totalAmount }; return; }
      const now = new Date();
      const transactionId = new ObjectId();
      const tariffSnapshot = { tariffType: charge.tariffType, amountPerUnit: charge.amountPerUnit, ...(charge.nightCount !== undefined ? { nightCount: charge.nightCount } : {}), totalAmount: charge.totalAmount, currency: "IDR", source: charge.source };
      await database.collection("parkingTransactions").insertOne({
        _id: transactionId, tenantId: context.tenantId, locationId: context.locationId, parkingSessionId: sessionId,
        plateNumberSnapshot: row.plateNumberSnapshot, vehicleTypeSnapshot: row.vehicleTypeSnapshot, tariffSnapshot,
        paymentMethod: "cash", amountDue: charge.totalAmount, amountPaid: charge.totalAmount, status: "completed",
        processedBy: context.userId, paymentAt: now, idempotencyKey: input.idempotencyKey, createdAt: now, updatedAt: now,
      }, options);
      const updated = await database.collection("parkingSessions").updateOne(
        { _id: sessionId, tenantId: context.tenantId, locationId: context.locationId, status: "active" },
        { $set: { status: "completed", exitAt: now, completedBy: context.userId, transactionId, updatedAt: now } }, options);
      if (updated.modifiedCount !== 1) throw new Conflict();
      await database.collection("auditLogs").insertOne({
        _id: new ObjectId(), tenantId: context.tenantId, locationId: context.locationId, actorId: context.userId,
        action: "parking.checkout", entityType: "parkingSession", entityId: sessionId,
        before: { status: "active" },
        after: { status: "completed", transactionId, tariffType: charge.tariffType, nightCount: charge.nightCount ?? null, totalAmount: charge.totalAmount, paymentMethod: "cash", exitAt: now },
        createdAt: now,
      }, options);
      const receipt = receiptOf({ ...row, exitAt: now }, { tariffSnapshot, paymentAt: now }, scope);
      if (!receipt) throw new AppError("SERVICE_UNAVAILABLE");
      outcome = { ok: true, receipt, replayed: false };
    }, transactionOptions);
    if (!outcome) throw new AppError("SERVICE_UNAVAILABLE");
    return outcome;
  } catch (error) {
    if (error instanceof AppError && error.code !== "SERVICE_UNAVAILABLE") throw error;
    // Lost race (conditional update/unique index) or ambiguous failure: report
    // only what is actually committed; otherwise the outcome stays unknown.
    if (error instanceof Conflict || (error instanceof MongoServerError && error.code === 11000)) {
      const committed = await lookup().catch(() => null);
      return committed ?? { ok: false, reason: "already_completed" };
    }
    const committed = await lookup().catch(() => null);
    if (committed) return committed;
    throw new AppError("SERVICE_UNAVAILABLE");
  } finally {
    await session?.endSession().catch(() => {});
  }
}

// Revenue for the dashboard: completed payments by paymentAt only (never
// active sessions, deposits or canceled sessions).
export async function sumCompletedPayments(db: Db, scope: { tenantId: ObjectId; locationId: ObjectId }, since: Date): Promise<number> {
  const rows = await db.collection("parkingTransactions").aggregate<{ total: number }>([
    { $match: { tenantId: scope.tenantId, locationId: scope.locationId, status: "completed", paymentAt: { $gte: since } } },
    { $group: { _id: null, total: { $sum: "$amountPaid" } } },
  ]).toArray();
  return typeof rows[0]?.total === "number" ? rows[0].total : 0;
}
