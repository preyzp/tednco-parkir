import "server-only";
import { ObjectId, type ClientSession, type Db } from "mongodb";
import { getDb, getMongoClient } from "../mongodb";
import { AppError } from "../errors";
import { changeLocationStatusSchema, createLocationSchema, renameOwnerSchema, updateLocationSchema } from "../validations/platform-tenant";
import { requirePlatformActor } from "./authorization";

// Platform mutations on a tenant's Owner profile and locations. Every write is
// scoped by tenantId, conditional on the state just read, and committed together
// with its audit record. Owner email and password are intentionally not editable.
export type TenantResourceResult =
  | { readonly ok: true; readonly tenantId: string }
  | { readonly ok: false; readonly reason: "validation"; readonly message: string }
  | { readonly ok: false; readonly reason: "not_found" | "unchanged" | "stale" | "duplicate_name" | "protected_account" };
type Outcome = Exclude<TenantResourceResult, { ok: true } | { reason: "validation" }>;
class Stop extends Error {
  constructor(readonly outcome: Outcome) { super(outcome.reason); }
}
const stop = (reason: Outcome["reason"]): never => { throw new Stop({ ok: false, reason } as Outcome); };
type Options = { session: ClientSession };
const transactionOptions = { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" } as const;
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function run(tenantId: string, work: (db: Db, options: Options, now: Date) => Promise<void>): Promise<TenantResourceResult> {
  let session: ClientSession | undefined;
  try {
    const client = await getMongoClient();
    const db = await getDb();
    session = client.startSession();
    const active = session;
    await active.withTransaction(() => work(db, { session: active }, new Date()), transactionOptions);
    return { ok: true, tenantId };
  } catch (error) {
    if (error instanceof Stop) return error.outcome;
    throw new AppError("SERVICE_UNAVAILABLE");
  } finally {
    await session?.endSession().catch(() => {});
  }
}
// Writing the tenant document serializes concurrent location transactions of the
// same tenant (write conflict → driver retry → checks rerun), so the
// case-insensitive name check holds without a new unique index.
async function lockTenant(db: Db, tenantId: ObjectId, options: Options, now: Date) {
  const tenant = await db.collection("tenants").findOne({ _id: tenantId }, { ...options, projection: { _id: 1, timezone: 1 } });
  if (!tenant) stop("not_found");
  await db.collection("tenants").updateOne({ _id: tenantId }, { $set: { updatedAt: now } }, options);
  return tenant as { _id: ObjectId; timezone?: unknown };
}
async function audit(db: Db, options: Options, entry: { tenantId: ObjectId; actorId: ObjectId; action: string; entityType: string; entityId: ObjectId; locationId?: ObjectId; before?: Record<string, unknown>; after: Record<string, unknown>; now: Date }) {
  const { now, ...rest } = entry;
  await db.collection("auditLogs").insertOne({ _id: new ObjectId(), ...rest, createdAt: now }, options);
}
const invalid = (issues: { message: string }[]): TenantResourceResult => ({ ok: false, reason: "validation", message: issues[0]?.message ?? "Data tidak valid." });

// Throws AppError UNAUTHENTICATED / FORBIDDEN / SERVICE_UNAVAILABLE for all four.
export async function renameTenantOwner(raw: unknown): Promise<TenantResourceResult> {
  const actor = await requirePlatformActor();
  const parsed = renameOwnerSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  const tenantId = new ObjectId(parsed.data.tenantId); const userId = new ObjectId(parsed.data.userId); const { name } = parsed.data;
  return run(parsed.data.tenantId, async (db, options, now) => {
    // Only a user who is an Owner of THIS tenant can be targeted.
    if (!await db.collection("memberships").findOne({ tenantId, userId, role: "owner" }, { ...options, projection: { _id: 1 } })) stop("not_found");
    const user = await db.collection("users").findOne({ _id: userId }, { ...options, projection: { _id: 1, name: 1, platformRole: 1 } });
    if (!user) stop("not_found");
    if (user!.platformRole !== undefined) stop("protected_account");
    if (user!.name === name) stop("unchanged");
    const updated = await db.collection("users").updateOne({ _id: userId, name: user!.name, platformRole: { $exists: false } }, { $set: { name, updatedAt: now } }, options);
    if (updated.matchedCount !== 1) stop("stale");
    await audit(db, options, { tenantId, actorId: actor.userId, action: "platform.owner.rename", entityType: "user", entityId: userId, before: { name: user!.name }, after: { name }, now });
  });
}

export async function createTenantLocation(raw: unknown): Promise<TenantResourceResult> {
  const actor = await requirePlatformActor();
  const parsed = createLocationSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  const tenantId = new ObjectId(parsed.data.tenantId); const { name, address } = parsed.data;
  return run(parsed.data.tenantId, async (db, options, now) => {
    const tenant = await lockTenant(db, tenantId, options, now);
    if (await db.collection("locations").findOne({ tenantId, name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } }, { ...options, projection: { _id: 1 } })) stop("duplicate_name");
    const locationId = new ObjectId();
    const timezone = typeof tenant.timezone === "string" && tenant.timezone ? tenant.timezone : "Asia/Jakarta";
    await db.collection("locations").insertOne({ _id: locationId, tenantId, name, ...(address ? { address } : {}), timezone, status: "active", createdAt: now, updatedAt: now }, options);
    await audit(db, options, { tenantId, locationId, actorId: actor.userId, action: "platform.location.create", entityType: "location", entityId: locationId, after: { name, address: address ?? null, status: "active", timezone }, now });
  });
}

export async function updateTenantLocation(raw: unknown): Promise<TenantResourceResult> {
  const actor = await requirePlatformActor();
  const parsed = updateLocationSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  const tenantId = new ObjectId(parsed.data.tenantId); const locationId = new ObjectId(parsed.data.locationId); const { name, address } = parsed.data;
  return run(parsed.data.tenantId, async (db, options, now) => {
    await lockTenant(db, tenantId, options, now);
    // tenantId in every filter: a location of another tenant is simply "not found".
    const current = await db.collection("locations").findOne({ _id: locationId, tenantId }, { ...options, projection: { _id: 1, name: 1, address: 1, updatedAt: 1 } });
    if (!current) stop("not_found");
    const before = { name: current!.name, address: typeof current!.address === "string" ? current!.address : null };
    if (before.name === name && before.address === (address ?? null)) stop("unchanged");
    if (await db.collection("locations").findOne({ tenantId, _id: { $ne: locationId }, name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } }, { ...options, projection: { _id: 1 } })) stop("duplicate_name");
    const updated = await db.collection("locations").updateOne(
      { _id: locationId, tenantId, name: current!.name, updatedAt: current!.updatedAt ?? null },
      address ? { $set: { name, address, updatedAt: now } } : { $set: { name, updatedAt: now }, $unset: { address: "" } },
      options,
    );
    if (updated.matchedCount !== 1) stop("stale");
    await audit(db, options, { tenantId, locationId, actorId: actor.userId, action: "platform.location.update", entityType: "location", entityId: locationId, before, after: { name, address: address ?? null }, now });
  });
}

// Deactivation takes effect on the next request: tenant guards only accept
// locations with status "active" and re-read them without caching.
export async function changeTenantLocationStatus(raw: unknown): Promise<TenantResourceResult> {
  const actor = await requirePlatformActor();
  const parsed = changeLocationStatusSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  const tenantId = new ObjectId(parsed.data.tenantId); const locationId = new ObjectId(parsed.data.locationId); const { toStatus, expectedStatus } = parsed.data;
  return run(parsed.data.tenantId, async (db, options, now) => {
    await lockTenant(db, tenantId, options, now);
    const current = await db.collection("locations").findOne({ _id: locationId, tenantId }, { ...options, projection: { _id: 1, status: 1 } });
    if (!current) stop("not_found");
    if (current!.status === toStatus) stop("unchanged");
    if (current!.status !== expectedStatus) stop("stale");
    const updated = await db.collection("locations").updateOne({ _id: locationId, tenantId, status: current!.status }, { $set: { status: toStatus, updatedAt: now } }, options);
    if (updated.matchedCount !== 1) stop("stale");
    await audit(db, options, { tenantId, locationId, actorId: actor.userId, action: "platform.location.status_change", entityType: "location", entityId: locationId, before: { status: current!.status }, after: { status: toStatus }, now });
  });
}
