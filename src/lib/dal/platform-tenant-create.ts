import "server-only";
import { MongoServerError, ObjectId, type ClientSession } from "mongodb";
import { hashPassword } from "better-auth/crypto";
import { getDb, getMongoClient } from "../mongodb";
import { AppError } from "../errors";
import { createTenantFieldErrors, createTenantSchema, type CreateTenantField } from "../validations/platform-tenant";
import { requirePlatformActor } from "./authorization";

export type CreateTenantResult =
  | { readonly ok: true; readonly tenantId: string }
  | { readonly ok: false; readonly reason: "validation"; readonly fieldErrors: Partial<Record<CreateTenantField, string>> }
  | { readonly ok: false; readonly reason: "conflict"; readonly field: "slug" | "email" };

class Conflict extends Error {
  constructor(readonly field: "slug" | "email") { super("conflict"); }
}
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Platform mutation: creates tenant + first location + Owner identity +
// Better Auth credential + Owner membership + audit record in ONE transaction.
// Never adopts, promotes or modifies an existing user or tenant. The password
// exists only in this request: hashed with the official Better Auth scrypt and
// stored solely in authAccounts.password; it is never returned or logged.
// Throws AppError UNAUTHENTICATED / FORBIDDEN / SERVICE_UNAVAILABLE.
export async function createTenantWithOwner(raw: unknown): Promise<CreateTenantResult> {
  const actor = await requirePlatformActor();
  const parsed = createTenantSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "validation", fieldErrors: createTenantFieldErrors(parsed.error) };
  const input = parsed.data;
  let session: ClientSession | undefined;
  try {
    const password = await hashPassword(input.ownerPassword);
    const client = await getMongoClient();
    const db = await getDb();
    const ids = { tenantId: new ObjectId(), locationId: new ObjectId(), userId: new ObjectId(), accountId: new ObjectId(), membershipId: new ObjectId(), auditId: new ObjectId() };
    session = client.startSession();
    const activeSession = session;
    await activeSession.withTransaction(async () => {
      const options = { session: activeSession };
      // Sequential: a session does not support parallel operations. Retried
      // transactions rerun every check, so a concurrent duplicate is caught.
      if (await db.collection("tenants").findOne({ slug: input.slug }, { ...options, projection: { _id: 1 } })) throw new Conflict("slug");
      if (await db.collection("users").findOne({ email: { $regex: `^${escapeRegex(input.ownerEmail)}$`, $options: "i" } }, { ...options, projection: { _id: 1 } })) throw new Conflict("email");
      const now = new Date();
      await db.collection("tenants").insertOne({ _id: ids.tenantId, name: input.tenantName, slug: input.slug, status: "active", timezone: input.timezone, createdAt: now, updatedAt: now }, options);
      await db.collection("locations").insertOne({ _id: ids.locationId, tenantId: ids.tenantId, name: input.locationName, ...(input.locationAddress ? { address: input.locationAddress } : {}), status: "active", timezone: input.timezone, createdAt: now, updatedAt: now }, options);
      await db.collection("users").insertOne({ _id: ids.userId, name: input.ownerName, email: input.ownerEmail, emailVerified: false, status: "active", createdAt: now, updatedAt: now }, options);
      await db.collection("authAccounts").insertOne({ _id: ids.accountId, userId: ids.userId, accountId: ids.userId.toHexString(), providerId: "credential", password, createdAt: now, updatedAt: now }, options);
      await db.collection("memberships").insertOne({ _id: ids.membershipId, tenantId: ids.tenantId, userId: ids.userId, role: "owner", status: "active", locationIds: [ids.locationId], createdAt: now, updatedAt: now }, options);
      // No email, password or hash in the audit trail.
      await db.collection("auditLogs").insertOne({ _id: ids.auditId, tenantId: ids.tenantId, actorId: actor.userId, action: "platform.tenant.create", entityType: "tenant", entityId: ids.tenantId, after: { name: input.tenantName, slug: input.slug, status: "active", locationId: ids.locationId, ownerUserId: ids.userId, ownerMembershipId: ids.membershipId }, createdAt: now }, options);
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
    return { ok: true, tenantId: ids.tenantId.toHexString() };
  } catch (error) {
    if (error instanceof Conflict) return { ok: false, reason: "conflict", field: error.field };
    // A concurrent request that won the unique index race.
    if (error instanceof MongoServerError && error.code === 11000) {
      const keys = Object.keys((error as MongoServerError & { keyPattern?: Record<string, unknown> }).keyPattern ?? {});
      if (keys.includes("slug")) return { ok: false, reason: "conflict", field: "slug" };
      if (keys.includes("email")) return { ok: false, reason: "conflict", field: "email" };
    }
    // Includes ambiguous commits: the caller must not claim failure OR success.
    throw new AppError("SERVICE_UNAVAILABLE");
  } finally {
    await session?.endSession().catch(() => {});
  }
}
