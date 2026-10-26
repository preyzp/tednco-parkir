import "server-only";
import { ObjectId, type ClientSession } from "mongodb";
import { getDb, getMongoClient } from "../mongodb";
import { AppError } from "../errors";
import { canTransitionTenant } from "../platform-labels";
import { changeTenantStatusSchema, renameTenantSchema } from "../validations/platform-tenant";
import { requirePlatformActor } from "./authorization";

export type UpdateTenantResult =
  | { readonly ok: true; readonly tenantId: string }
  | { readonly ok: false; readonly reason: "validation"; readonly message: string }
  | { readonly ok: false; readonly reason: "not_found" }
  | { readonly ok: false; readonly reason: "unchanged" }
  | { readonly ok: false; readonly reason: "stale" }
  | { readonly ok: false; readonly reason: "invalid_transition" };

type Outcome = Exclude<UpdateTenantResult, { ok: true } | { reason: "validation" }>;
class Stop extends Error {
  constructor(readonly outcome: Outcome) { super(outcome.reason); }
}
const transactionOptions = { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" } as const;

// Shared atomic shape: read current state, conditional update, audit insert —
// all in one transaction. Only the named field + updatedAt are ever $set;
// slug, timezone, memberships and Owner accounts are never touched.
async function mutateTenant(
  tenantId: string,
  build: (current: { name: unknown; status: unknown }) => { set: Record<string, unknown>; action: string; before: Record<string, unknown>; after: Record<string, unknown> },
  actorId: ObjectId,
): Promise<UpdateTenantResult> {
  let session: ClientSession | undefined;
  try {
    const client = await getMongoClient();
    const db = await getDb();
    const _id = new ObjectId(tenantId);
    session = client.startSession();
    const activeSession = session;
    await activeSession.withTransaction(async () => {
      const options = { session: activeSession };
      const current = await db.collection("tenants").findOne({ _id }, { ...options, projection: { _id: 1, name: 1, status: 1 } });
      if (!current) throw new Stop({ ok: false, reason: "not_found" });
      const change = build({ name: current.name, status: current.status });
      const now = new Date();
      // Conditional on the values just read: a concurrent change makes this a no-op → stale.
      const updated = await db.collection("tenants").updateOne({ _id, name: current.name, status: current.status }, { $set: { ...change.set, updatedAt: now } }, options);
      if (updated.matchedCount !== 1) throw new Stop({ ok: false, reason: "stale" });
      await db.collection("auditLogs").insertOne({ _id: new ObjectId(), tenantId: _id, actorId, action: change.action, entityType: "tenant", entityId: _id, before: change.before, after: change.after, createdAt: now }, options);
    }, transactionOptions);
    return { ok: true, tenantId: tenantId.toLowerCase() };
  } catch (error) {
    if (error instanceof Stop) return error.outcome;
    // Includes ambiguous commits: the caller must reload before retrying.
    throw new AppError("SERVICE_UNAVAILABLE");
  } finally {
    await session?.endSession().catch(() => {});
  }
}

// Throws AppError UNAUTHENTICATED / FORBIDDEN / SERVICE_UNAVAILABLE.
export async function renameTenant(raw: unknown): Promise<UpdateTenantResult> {
  const actor = await requirePlatformActor();
  const parsed = renameTenantSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "validation", message: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const { tenantId, name } = parsed.data;
  return mutateTenant(tenantId, (current) => {
    if (current.name === name) throw new Stop({ ok: false, reason: "unchanged" });
    return { set: { name }, action: "platform.tenant.rename", before: { name: current.name }, after: { name } };
  }, actor.userId);
}

// Suspended/archived take effect on the next request of every tenant user:
// all tenant guards re-read tenants.status === "active" without caching.
export async function changeTenantStatus(raw: unknown): Promise<UpdateTenantResult> {
  const actor = await requirePlatformActor();
  const parsed = changeTenantStatusSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "validation", message: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const { tenantId, toStatus, expectedStatus } = parsed.data;
  return mutateTenant(tenantId, (current) => {
    if (current.status === toStatus) throw new Stop({ ok: false, reason: "unchanged" });
    if (current.status !== expectedStatus) throw new Stop({ ok: false, reason: "stale" });
    if (!canTransitionTenant(String(current.status), toStatus)) throw new Stop({ ok: false, reason: "invalid_transition" });
    return { set: { status: toStatus }, action: "platform.tenant.status_change", before: { status: current.status }, after: { status: toStatus } };
  }, actor.userId);
}
