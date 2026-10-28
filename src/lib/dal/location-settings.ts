import "server-only";
import { MongoServerError, ObjectId, type ClientSession, type Db } from "mongodb";
import { getDb, getMongoClient } from "../mongodb";
import { AppError } from "../errors";
import { logOperationalError } from "../log";
import { defaultParkingPolicy, isTariffAmount, resolveOperatingPolicy, type OperatingPolicy, type RateSource } from "../parking-tariff";
import { locationSettingsSchema } from "../validations/location-settings";
import { requirePermission, type AuthorizationSelection, type LocationContext } from "./authorization";
import { hasUniquePartialIndex } from "./index-verification";
import { transactionOptions } from "./transaction-options";
import type { TariffType, VehicleType } from "../../types";

// Owner location settings (P4.6): four tariffs (Motor/Mobil × Reguler/Menginap)
// in `tariffs` (one active document per combination, updated in place; history
// lives in the audit log) and one daily open/close time on the location. Tenant
// and location always come from the guard; completed transactions keep their
// own snapshots and are never touched here.

const vehicleTypes = ["motor", "mobil"] as const satisfies readonly VehicleType[];
const tariffTypes = ["regular", "overnight"] as const satisfies readonly TariffType[];
export interface LocationSettingsView {
  readonly locationName: string;
  readonly revision: number;
  readonly tariffs: Record<VehicleType, Record<TariffType, { readonly amount: number; readonly source: RateSource }>>;
  readonly operatingHours: OperatingPolicy;
  // false: more than one active or an invalid stored tariff — saving fixes it.
  readonly tariffsConsistent: boolean;
  readonly activeVehicleCount: number;
}
export type LocationSettingsResult =
  | { readonly ok: true; readonly settings: LocationSettingsView }
  | { readonly ok: false; readonly reason: "validation"; readonly fieldErrors: Record<string, string> }
  | { readonly ok: false; readonly reason: "conflict" | "not_ready" };

// Guard for the four tariff combinations (DATABASE_SCHEMA 10). Saving fails
// closed until it exists, like the parking indexes.
export const activeTariffIndex = { name: "tariffs_location_vehicle_tariff_active_unique", key: { tenantId: 1, locationId: 1, vehicleType: 1, tariffType: 1 }, partialFilterExpression: { status: "active" } } as const;
let activeTariffIndexVerified = false;
// Throws AppError SERVICE_UNAVAILABLE when the check itself fails (not cached).
async function hasActiveTariffIndex(db: Db): Promise<boolean> {
  if (!activeTariffIndexVerified) activeTariffIndexVerified = await hasUniquePartialIndex(db, "tariffs", activeTariffIndex);
  return activeTariffIndexVerified;
}
/** Test hook: forget the cached index verification. */
export function resetTariffIndexCacheForTests(): void { activeTariffIndexVerified = false; }

type Options = { session?: ClientSession };
class Conflict extends Error {}

// Owner-only (Admin/Staff settings are out of scope); needs both grants.
async function ownerSettingsContext(selection: AuthorizationSelection): Promise<LocationContext> {
  const context = await requirePermission("tariff.manage", selection);
  if (context.role !== "owner" || !context.permissions.includes("locations.manage")) throw new AppError("FORBIDDEN");
  return context;
}

async function loadLocation(db: Db, context: LocationContext, options: Options) {
  const tenant = await db.collection("tenants").findOne({ _id: context.tenantId, status: "active" }, { ...options, projection: { _id: 1 } });
  const location = await db.collection("locations").findOne({ _id: context.locationId, tenantId: context.tenantId, status: "active" }, { ...options, projection: { name: 1, operatingHours: 1, settingsRevision: 1 } });
  if (!tenant || !location) throw new AppError("FORBIDDEN");
  const revision = Number.isSafeInteger(location.settingsRevision) && location.settingsRevision >= 0 ? location.settingsRevision as number : 0;
  return { name: typeof location.name === "string" ? location.name : "", operatingHours: location.operatingHours, revision };
}

type TariffRow = { _id: ObjectId; vehicleType?: unknown; tariffType?: unknown; amount?: unknown };
async function activeTariffs(db: Db, context: LocationContext, options: Options): Promise<TariffRow[]> {
  return db.collection("tariffs").find({ tenantId: context.tenantId, locationId: context.locationId, status: "active" }, { ...options, projection: { vehicleType: 1, tariffType: 1, amount: 1 } }).limit(50).toArray() as Promise<TariffRow[]>;
}
// Same resolution as checkout: the single valid active tariff, else the default.
function resolveTariffs(rows: readonly TariffRow[]) {
  let consistent = true;
  const pick = (vehicleType: VehicleType, tariffType: TariffType) => {
    const matching = rows.filter((row) => row.vehicleType === vehicleType && row.tariffType === tariffType);
    if (matching.length === 1 && isTariffAmount(matching[0].amount)) return { amount: matching[0].amount as number, source: "location" as const };
    if (matching.length > 0) consistent = false;
    return { amount: tariffType === "regular" ? defaultParkingPolicy.regularAmount : defaultParkingPolicy.overnightAmountPerNight, source: "default" as const };
  };
  const tariffs = Object.fromEntries(vehicleTypes.map((vehicleType) => [vehicleType, Object.fromEntries(tariffTypes.map((tariffType) => [tariffType, pick(vehicleType, tariffType)]))])) as LocationSettingsView["tariffs"];
  return { tariffs, consistent };
}
const auditTariffs = (tariffs: LocationSettingsView["tariffs"]) => Object.fromEntries(vehicleTypes.map((vehicleType) => [vehicleType, Object.fromEntries(tariffTypes.map((tariffType) => [tariffType, tariffs[vehicleType][tariffType].source === "location" ? tariffs[vehicleType][tariffType].amount : null]))]));

// Throws AppError UNAUTHENTICATED / FORBIDDEN (incl. suspended tenant, inactive
// location) / SERVICE_UNAVAILABLE.
export async function getLocationSettings(selection: AuthorizationSelection): Promise<LocationSettingsView> {
  const context = await ownerSettingsContext(selection);
  try {
    const db = await getDb();
    const location = await loadLocation(db, context, {});
    const { tariffs, consistent } = resolveTariffs(await activeTariffs(db, context, {}));
    const activeVehicleCount = await db.collection("parkingSessions").countDocuments({ tenantId: context.tenantId, locationId: context.locationId, status: "active" });
    return Object.freeze({ locationName: location.name, revision: location.revision, tariffs, operatingHours: resolveOperatingPolicy(location), tariffsConsistent: consistent, activeVehicleCount });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logOperationalError("settings.read", error, { outcome: "unavailable", phase: "read" });
    throw new AppError("SERVICE_UNAVAILABLE");
  }
}

// Atomic save: conditional location update (revision guard, also the per-location
// write lock), four tariff upserts and one audit entry in one MongoDB
// transaction. A concurrent save on the same revision either write-conflicts
// (retried, then sees the new revision) or fails the conditional update: one
// wins, the other gets "conflict" with nothing written. Checkout reads settings
// from its own snapshot and keeps its expectedTotal check, so it charges either
// the old amount it showed or reports price_changed — never a mix.
// Throws AppError UNAUTHENTICATED / FORBIDDEN / SERVICE_UNAVAILABLE.
export async function updateLocationSettings(selection: AuthorizationSelection, raw: unknown): Promise<LocationSettingsResult> {
  const context = await ownerSettingsContext(selection);
  const parsed = locationSettingsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "validation", fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])) };
  const input = parsed.data;
  let session: ClientSession | undefined;
  try {
    const db = await getDb();
    if (!await hasActiveTariffIndex(db)) return { ok: false, reason: "not_ready" };
    const client = await getMongoClient();
    session = client.startSession();
    const active = session;
    let result: LocationSettingsView | undefined;
    await active.withTransaction(async () => {
      result = undefined; // withTransaction may retry the whole callback
      const options = { session: active };
      const location = await loadLocation(db, context, options);
      const now = new Date();
      const revision = input.expectedRevision === 0 ? { $in: [0, null] } : input.expectedRevision;
      const hours = { mode: "daily" as const, openTime: input.operatingHours.openTime, closeTime: input.operatingHours.closeTime };
      const updated = await db.collection("locations").updateOne(
        { _id: context.locationId, tenantId: context.tenantId, status: "active", settingsRevision: revision },
        { $set: { operatingHours: hours, settingsRevision: input.expectedRevision + 1, updatedAt: now } }, options);
      if (updated.matchedCount !== 1) throw new Conflict();
      const rows = await activeTariffs(db, context, options);
      const before = resolveTariffs(rows);
      for (const vehicleType of vehicleTypes) {
        for (const tariffType of tariffTypes) {
          const amount = input.tariffs[vehicleType][tariffType];
          const matching = rows.filter((row) => row.vehicleType === vehicleType && row.tariffType === tariffType);
          const [keep, ...extra] = matching;
          if (keep) {
            const kept = await db.collection("tariffs").updateOne({ _id: keep._id, tenantId: context.tenantId, locationId: context.locationId, status: "active" }, { $set: { amount, currency: "IDR", updatedAt: now, updatedBy: context.userId } }, options);
            if (kept.matchedCount !== 1) throw new Conflict();
          } else await db.collection("tariffs").insertOne({ _id: new ObjectId(), tenantId: context.tenantId, locationId: context.locationId, vehicleType, tariffType, amount, currency: "IDR", status: "active", createdAt: now, updatedAt: now, updatedBy: context.userId }, options);
          // Legacy duplicates (impossible once the unique index exists) are retired, not deleted.
          for (const row of extra) {
            const retired = await db.collection("tariffs").updateOne({ _id: row._id, tenantId: context.tenantId, locationId: context.locationId, status: "active" }, { $set: { status: "inactive", updatedAt: now, updatedBy: context.userId } }, options);
            if (retired.matchedCount !== 1) throw new Conflict();
          }
        }
      }
      const afterTariffs = Object.fromEntries(vehicleTypes.map((vehicleType) => [vehicleType, Object.fromEntries(tariffTypes.map((tariffType) => [tariffType, { amount: input.tariffs[vehicleType][tariffType], source: "location" as const }]))])) as LocationSettingsView["tariffs"];
      const beforeHours = resolveOperatingPolicy(location);
      await db.collection("auditLogs").insertOne({
        _id: new ObjectId(), tenantId: context.tenantId, locationId: context.locationId, actorId: context.userId,
        action: "location.settings.update", entityType: "location", entityId: context.locationId,
        before: { revision: location.revision, operatingHours: beforeHours.source === "location" ? { openTime: beforeHours.openTime, closeTime: beforeHours.closeTime } : null, tariffs: auditTariffs(before.tariffs) },
        after: { revision: input.expectedRevision + 1, operatingHours: { openTime: hours.openTime, closeTime: hours.closeTime }, tariffs: auditTariffs(afterTariffs) },
        createdAt: now,
      }, options);
      const activeVehicleCount = await db.collection("parkingSessions").countDocuments({ tenantId: context.tenantId, locationId: context.locationId, status: "active" }, options);
      result = Object.freeze({ locationName: location.name, revision: input.expectedRevision + 1, tariffs: afterTariffs, operatingHours: resolveOperatingPolicy({ operatingHours: hours }), tariffsConsistent: true, activeVehicleCount });
    }, transactionOptions);
    if (!result) throw new AppError("SERVICE_UNAVAILABLE");
    return { ok: true, settings: result };
  } catch (error) {
    if (error instanceof Conflict) return { ok: false, reason: "conflict" };
    // A concurrent save that won the unique tariff index.
    if (error instanceof MongoServerError && error.code === 11000) return { ok: false, reason: "conflict" };
    if (error instanceof AppError) throw error;
    // Includes ambiguous commits and transaction timeouts: callers must reload
    // before retrying (a retry on the old revision can only conflict).
    logOperationalError("location.settings.update", error, { outcome: "unknown", phase: "transaction" });
    throw new AppError("SERVICE_UNAVAILABLE");
  } finally {
    await session?.endSession().catch(() => {});
  }
}
