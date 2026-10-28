import "server-only";
import { MongoServerError, ObjectId, type ClientSession, type Db } from "mongodb";
import { getDb, getMongoClient } from "../mongodb";
import { AppError } from "../errors";
import { safeTimeZone, startOfLocalDay } from "../time";
import { vehicleEntryFieldErrors, vehicleEntryFormSchema } from "../validations/parking-entry";
import { requirePermission, type AuthorizationSelection } from "./authorization";
import { sumCompletedPayments } from "./parking-checkout";
import type { VehicleType } from "../../types";

// Narrow repository for parking sessions (vehicle entry + dashboard reads).
// Every call re-derives the tenant/location context from the database via
// requirePermission; ids from the caller are only an untrusted selection.

export type VehicleEntryResult =
  | { readonly ok: true; readonly entry: { readonly plateNumber: string; readonly vehicleType: VehicleType; readonly entryAt: string; readonly timeZone: string; readonly locationName: string } }
  | { readonly ok: false; readonly reason: "validation"; readonly fieldErrors: Partial<Record<"plateNumber" | "vehicleType" | "notes", string>> }
  | { readonly ok: false; readonly reason: "duplicate_active" }
  | { readonly ok: false; readonly reason: "not_ready" };

// The documented guard against two active sessions (DATABASE_SCHEMA 9) is this
// unique partial index; a pre-insert findOne alone is not concurrency-safe.
export const activePlateIndex = { name: "parking_sessions_active_plate_unique", key: { tenantId: 1, locationId: 1, normalizedPlateSnapshot: 1 }, partialFilterExpression: { status: "active" } } as const;
let activePlateIndexVerified = false;
// Fail closed: without the unique index, entries are refused rather than risk duplicates.
async function hasActivePlateIndex(db: Db): Promise<boolean> {
  if (activePlateIndexVerified) return true;
  try {
    const indexes = await db.collection("parkingSessions").listIndexes().toArray();
    activePlateIndexVerified = indexes.some((index) => index.unique === true && !index.sparse && !index.collation
      && JSON.stringify(index.key) === JSON.stringify(activePlateIndex.key)
      && JSON.stringify(index.partialFilterExpression) === JSON.stringify(activePlateIndex.partialFilterExpression));
  } catch {
    activePlateIndexVerified = false; // e.g. NamespaceNotFound before the migration
  }
  return activePlateIndexVerified;
}
/** Test hook: forget the cached index verification. */
export function resetParkingIndexCacheForTests(): void { activePlateIndexVerified = false; }

class Duplicate extends Error {}
const transactionOptions = { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" } as const;

// Owner-only for this phase (Admin/Staff entry is out of scope).
// Throws AppError UNAUTHENTICATED / FORBIDDEN / SERVICE_UNAVAILABLE.
export async function recordVehicleEntry(selection: AuthorizationSelection, raw: unknown): Promise<VehicleEntryResult> {
  const context = await requirePermission("vehicle.create", selection);
  if (context.role !== "owner") throw new AppError("FORBIDDEN");
  const parsed = vehicleEntryFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "validation", fieldErrors: vehicleEntryFieldErrors(parsed.error) };
  const input = parsed.data;
  let session: ClientSession | undefined;
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
    }, transactionOptions);
    if (!result) throw new AppError("SERVICE_UNAVAILABLE");
    return { ok: true, entry: result };
  } catch (error) {
    if (error instanceof Duplicate) return { ok: false, reason: "duplicate_active" };
    // A concurrent entry that won the unique partial index.
    if (error instanceof MongoServerError && error.code === 11000) return { ok: false, reason: "duplicate_active" };
    if (error instanceof AppError) throw error;
    // Includes ambiguous commits: callers must not claim success.
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
  } catch {
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
  } catch {
    throw new AppError("SERVICE_UNAVAILABLE");
  }
}
function normalizeSearch(value: string): string {
  return value.trim().toUpperCase().replace(/\s/g, "");
}
