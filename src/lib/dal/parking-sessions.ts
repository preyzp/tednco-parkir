import "server-only";
import { MongoServerError, ObjectId, type ClientSession, type Db } from "mongodb";
import { getDb, getMongoClient } from "../mongodb";
import { AppError } from "../errors";
import { logOperationalError } from "../log";
import { safeTimeZone, startOfLocalDay } from "../time";
import { vehicleEntryFieldErrors, vehicleEntryFormSchema } from "../validations/parking-entry";
import { requirePermission, type AuthorizationSelection, type LocationContext } from "./authorization";
import { hasUniquePartialIndex } from "./index-verification";
import { transactionOptions } from "./transaction-options";
import { sumCompletedPayments } from "./parking-checkout";
import type { VehicleType } from "../../types";

// Narrow repository for parking sessions (vehicle entry + dashboard reads).
// Every call re-derives the tenant/location context from the database via
// requirePermission; ids from the caller are only an untrusted selection.

export type VehicleEntryResult =
  | { readonly ok: true; readonly entry: { readonly plateNumber: string; readonly vehicleType: VehicleType; readonly entryAt: string; readonly timeZone: string; readonly locationName: string } }
  | { readonly ok: false; readonly reason: "validation"; readonly fieldErrors: Partial<Record<"plateNumber" | "vehicleType" | "notes", string>> }
  | { readonly ok: false; readonly reason: "duplicate_active" }
  | { readonly ok: false; readonly reason: "not_ready" }
  // Definitely not recorded: the database failed before any commit was attempted.
  | { readonly ok: false; readonly reason: "unavailable" };

// The documented guard against two active sessions (DATABASE_SCHEMA 9) is this
// unique partial index; a pre-insert findOne alone is not concurrency-safe.
export const activePlateIndex = { name: "parking_sessions_active_plate_unique", key: { tenantId: 1, locationId: 1, normalizedPlateSnapshot: 1 }, partialFilterExpression: { status: "active" } } as const;
let activePlateIndexVerified = false;
// Fail closed: without the unique index, entries are refused rather than risk duplicates.
// Throws AppError SERVICE_UNAVAILABLE when the check itself fails (not cached).
async function hasActivePlateIndex(db: Db): Promise<boolean> {
  if (!activePlateIndexVerified) activePlateIndexVerified = await hasUniquePartialIndex(db, "parkingSessions", activePlateIndex);
  return activePlateIndexVerified;
}
/** Test hook: forget the cached index verification. */
export function resetParkingIndexCacheForTests(): void { activePlateIndexVerified = false; }

class Duplicate extends Error {}

// Owner-only for this phase (Admin/Staff entry is out of scope).
// Throws AppError UNAUTHENTICATED / FORBIDDEN, or SERVICE_UNAVAILABLE only when
// the outcome is unknown (the commit may have succeeded): callers must not claim
// the vehicle was not recorded. A failure before any commit is "unavailable".
export async function recordVehicleEntry(selection: AuthorizationSelection, raw: unknown): Promise<VehicleEntryResult> {
  let context: LocationContext;
  try {
    context = await requirePermission("vehicle.create", selection);
  } catch (error) {
    if (error instanceof AppError && error.code === "SERVICE_UNAVAILABLE") return { ok: false, reason: "unavailable" };
    throw error;
  }
  if (context.role !== "owner") throw new AppError("FORBIDDEN");
  const parsed = vehicleEntryFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "validation", fieldErrors: vehicleEntryFieldErrors(parsed.error) };
  const input = parsed.data;
  let session: ClientSession | undefined;
  // The driver commits only after the callback finishes, so until it has
  // finished once nothing can have been committed. Never reset on a retry.
  let commitAttempted = false;
  try {
    const db = await getDb();
    if (!await hasActivePlateIndex(db)) return { ok: false, reason: "not_ready" };
    const client = await getMongoClient();
    session = client.startSession();
    const active = session;
    let result: Extract<VehicleEntryResult, { ok: true }>["entry"] | undefined;
    await active.withTransaction(async () => {
      const options = { session: active };
      // Re-check inside the transaction: a suspension/deactivation that raced
      // the guard above must still block the write.
      const tenant = await db.collection("tenants").findOne({ _id: context.tenantId, status: "active" }, { ...options, projection: { _id: 1, timezone: 1 } });
      const location = await db.collection("locations").findOne({ _id: context.locationId, tenantId: context.tenantId, status: "active" }, { ...options, projection: { _id: 1, name: 1 } });
      if (!tenant || !location) throw new AppError("FORBIDDEN");
      // Friendly early answer only; the unique index is the real guarantee.
      if (await db.collection("parkingSessions").findOne({ tenantId: context.tenantId, locationId: context.locationId, normalizedPlateSnapshot: input.normalizedPlate, status: "active" }, { ...options, projection: { _id: 1 } })) throw new Duplicate();
      const now = new Date();
      const existingVehicle = await db.collection("vehicles").find({ tenantId: context.tenantId, normalizedPlate: input.normalizedPlate }, { ...options, projection: { _id: 1 } }).sort({ createdAt: 1 }).limit(1).toArray();
      let vehicleId = existingVehicle[0]?._id as ObjectId | undefined;
      if (!vehicleId) {
        vehicleId = new ObjectId();
        await db.collection("vehicles").insertOne({ _id: vehicleId, tenantId: context.tenantId, plateNumber: input.plateNumber, normalizedPlate: input.normalizedPlate, type: input.vehicleType, createdAt: now, updatedAt: now }, options);
      }
      await db.collection("parkingSessions").insertOne({
        _id: new ObjectId(), tenantId: context.tenantId, locationId: context.locationId, vehicleId,
        plateNumberSnapshot: input.plateNumber, normalizedPlateSnapshot: input.normalizedPlate, vehicleTypeSnapshot: input.vehicleType,
        ...(input.notes ? { notes: input.notes } : {}),
        entryAt: now, status: "active", enteredBy: context.userId, createdAt: now, updatedAt: now,
      }, options);
      result = { plateNumber: input.plateNumber, vehicleType: input.vehicleType, entryAt: now.toISOString(), timeZone: safeTimeZone(tenant.timezone), locationName: typeof location.name === "string" ? location.name : "" };
      commitAttempted = true;
    }, transactionOptions);
    if (!result) throw new AppError("SERVICE_UNAVAILABLE");
    return { ok: true, entry: result };
  } catch (error) {
    if (error instanceof Duplicate) return { ok: false, reason: "duplicate_active" };
    // A concurrent entry that won the unique partial index.
    if (error instanceof MongoServerError && error.code === 11000) return { ok: false, reason: "duplicate_active" };
    if (error instanceof AppError && error.code !== "SERVICE_UNAVAILABLE") throw error;
    // AppErrors were raised (and, for the index check, logged) by our own code.
    if (!(error instanceof AppError)) logOperationalError("vehicle.entry", error, { outcome: commitAttempted ? "unknown" : "unavailable", phase: "transaction" });
    if (!commitAttempted) return { ok: false, reason: "unavailable" };
    // Ambiguous commit (incl. a transaction timeout during commit): unknown,
    // neither success nor "not recorded". A retry is safe: the unique index
    // turns a committed entry into duplicate_active.
    throw new AppError("SERVICE_UNAVAILABLE");
  } finally {
    await session?.endSession().catch(() => {});
  }
}

export interface LocationParkingOverview {
  readonly activeCount: number;
  readonly entriesToday: number;
  // Completed sessions with exitAt today.
  readonly exitsToday: number;
  // Completed cash payments with paymentAt today (Rupiah); never from active sessions.
  readonly revenueToday: number;
  readonly timeZone: string;
  readonly recent: readonly { readonly plateNumber: string; readonly vehicleType: VehicleType; readonly entryAt: string; readonly status: "active" | "completed" | "canceled" }[];
}
const recentLimit = 5;

// Dashboard reads for the authorized location only. Canceled sessions are not
// counted as entries (the vehicle did not actually park).
export async function getLocationParkingOverview(selection: AuthorizationSelection, now: Date = new Date()): Promise<LocationParkingOverview> {
  const context = await requirePermission("vehicle.read", selection);
  try {
    const db = await getDb();
    const tenant = await db.collection("tenants").findOne({ _id: context.tenantId }, { projection: { timezone: 1 } });
    const timeZone = safeTimeZone(tenant?.timezone);
    const scope = { tenantId: context.tenantId, locationId: context.locationId };
    const sessions = db.collection("parkingSessions");
    const activeCount = await sessions.countDocuments({ ...scope, status: "active" });
    const dayStart = startOfLocalDay(now, timeZone);
    const entriesToday = await sessions.countDocuments({ ...scope, status: { $ne: "canceled" }, entryAt: { $gte: dayStart } });
    const exitsToday = await sessions.countDocuments({ ...scope, status: "completed", exitAt: { $gte: dayStart } });
    const revenueToday = await sumCompletedPayments(db, scope, dayStart);
    const rows = await sessions.find(scope, { projection: { plateNumberSnapshot: 1, vehicleTypeSnapshot: 1, entryAt: 1, status: 1 } }).sort({ entryAt: -1 }).limit(recentLimit).toArray();
    const recent = rows.flatMap((row) => (row.entryAt instanceof Date && typeof row.plateNumberSnapshot === "string" && (row.vehicleTypeSnapshot === "motor" || row.vehicleTypeSnapshot === "mobil") && ["active", "completed", "canceled"].includes(row.status)
      ? [Object.freeze({ plateNumber: row.plateNumberSnapshot, vehicleType: row.vehicleTypeSnapshot as VehicleType, entryAt: row.entryAt.toISOString(), status: row.status as "active" | "completed" | "canceled" })] : []));
    return Object.freeze({ activeCount, entriesToday, exitsToday, revenueToday, timeZone, recent: Object.freeze(recent) });
  } catch (error) {
    logOperationalError("dashboard.read", error, { outcome: "unavailable", phase: "read" });
    throw new AppError("SERVICE_UNAVAILABLE");
  }
}

// ---- Vehicle list (read-only) ----
export type VehicleListStatus = "active" | "completed" | "all";
export type VehicleListType = "all" | VehicleType;
export interface VehicleListQuery { readonly q?: string; readonly status: VehicleListStatus; readonly type: VehicleListType; readonly page: number }
export interface VehicleListRow {
  readonly id: string; // React key + checkout link selection; never used as authority (re-scoped server-side)
  readonly plateNumber: string;
  readonly vehicleType: VehicleType;
  readonly entryAt: string;
  readonly exitAt: string | null;
  readonly status: "active" | "completed" | "canceled";
  readonly notes?: string;
}
export interface VehicleListResult {
  readonly rows: readonly VehicleListRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
  readonly timeZone: string;
  // false = the P4.3 parking index/collection is not set up yet (nothing can be recorded).
  readonly ready: boolean;
}
export const vehicleListPageSize = 20;
const maxListPage = 10_000;
const searchMax = 15;

// Untrusted URL input → safe defaults. Only filters are read; tenantId,
// locationId and any other parameter are ignored (scope comes from the guard).
export function parseVehicleListQuery(params: Record<string, string | string[] | undefined>): VehicleListQuery {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const q = first(params.q)?.trim().slice(0, searchMax) || undefined;
  const rawStatus = first(params.status);
  const status: VehicleListStatus = rawStatus === "completed" || rawStatus === "all" ? rawStatus : "active";
  const rawType = first(params.type);
  const type: VehicleListType = rawType === "motor" || rawType === "mobil" ? rawType : "all";
  const parsedPage = Number(first(params.page));
  const page = Number.isInteger(parsedPage) && parsedPage >= 1 ? Math.min(parsedPage, maxListPage) : 1;
  return { ...(q ? { q } : {}), status, type, page };
}
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Owner-only in this phase. Throws AppError UNAUTHENTICATED / FORBIDDEN / SERVICE_UNAVAILABLE.
export async function listLocationVehicles(selection: AuthorizationSelection, query: VehicleListQuery): Promise<VehicleListResult> {
  const context = await requirePermission("vehicle.read", selection);
  if (context.role !== "owner") throw new AppError("FORBIDDEN");
  try {
    const db = await getDb();
    const tenant = await db.collection("tenants").findOne({ _id: context.tenantId }, { projection: { timezone: 1 } });
    const timeZone = safeTimeZone(tenant?.timezone);
    const ready = await hasActivePlateIndex(db);
    // Partial plate search on the matching form (no spaces, uppercase), literal.
    const needle = query.q ? normalizeSearch(query.q) : "";
    const filter = {
      tenantId: context.tenantId, locationId: context.locationId,
      ...(query.status === "all" ? {} : { status: query.status }),
      ...(query.type === "all" ? {} : { vehicleTypeSnapshot: query.type }),
      ...(needle ? { normalizedPlateSnapshot: { $regex: escapeRegex(needle) } } : {}),
    };
    const sessions = db.collection("parkingSessions");
    const total = await sessions.countDocuments(filter);
    const pageCount = Math.max(Math.ceil(total / vehicleListPageSize), 1);
    const page = Math.min(query.page, pageCount);
    const docs = await sessions.find(filter, { projection: { plateNumberSnapshot: 1, vehicleTypeSnapshot: 1, entryAt: 1, exitAt: 1, status: 1, notes: 1 } })
      .sort({ entryAt: -1, _id: -1 }).skip((page - 1) * vehicleListPageSize).limit(vehicleListPageSize).toArray();
    const rows = docs.flatMap((row) => (row._id instanceof ObjectId && row.entryAt instanceof Date && typeof row.plateNumberSnapshot === "string"
      && (row.vehicleTypeSnapshot === "motor" || row.vehicleTypeSnapshot === "mobil") && ["active", "completed", "canceled"].includes(row.status)
      ? [Object.freeze({
        id: row._id.toHexString(), plateNumber: row.plateNumberSnapshot, vehicleType: row.vehicleTypeSnapshot as VehicleType,
        entryAt: row.entryAt.toISOString(), exitAt: row.exitAt instanceof Date ? row.exitAt.toISOString() : null,
        status: row.status as VehicleListRow["status"], ...(typeof row.notes === "string" && row.notes ? { notes: row.notes } : {}),
      })] : []));
    return Object.freeze({ rows: Object.freeze(rows), total, page, pageSize: vehicleListPageSize, pageCount, timeZone, ready });
  } catch (error) {
    // A failed index check was already logged by index-verification.
    if (!(error instanceof AppError)) logOperationalError("vehicles.read", error, { outcome: "unavailable", phase: "read" });
    throw new AppError("SERVICE_UNAVAILABLE");
  }
}
function normalizeSearch(value: string): string {
  return value.trim().toUpperCase().replace(/\s/g, "");
}
