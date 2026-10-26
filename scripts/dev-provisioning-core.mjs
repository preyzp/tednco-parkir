// @ts-check
import { ObjectId } from "mongodb";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";

export const developmentDatabase = "tednco_parkir_provision_dev";
const markerId = new ObjectId("000000000000000000000001");
const slug = "tednco-dev-provision";
const inputSchema = z.object({ email: z.email().transform((email) => email.toLowerCase()), password: z.string().min(12).max(128), name: z.string().trim().min(1).max(100) });
/** @param {Record<string, string | undefined>} env @param {string[]} args */
export function validateProvisioning(env, args) {
  if (env.NODE_ENV !== "development" || env.TEDNCO_ENABLE_DEV_PROVISIONING !== "1") throw new Error("Development provisioning is not enabled.");
  if (args.some((arg) => arg !== "--apply" && arg !== "--dry-run") || new Set(args).size !== args.length || (args.includes("--apply") && args.includes("--dry-run"))) throw new Error("Use --dry-run (default) or --apply only. Never put credentials in arguments.");
  if (env.MONGODB_DB_NAME !== developmentDatabase) throw new Error("Only the dedicated provisioning development database is allowed.");
  const parsed = inputSchema.safeParse({ email: env.TEDNCO_DEV_OWNER_EMAIL?.trim(), password: env.TEDNCO_DEV_OWNER_PASSWORD, name: env.TEDNCO_DEV_OWNER_NAME ?? "Owner Pengembangan" });
  if (!parsed.success) throw new Error("Provide a valid email and a password of 12-128 characters through runtime environment variables.");
  const apply = args.includes("--apply");
  if (apply && env.TEDNCO_DEV_WRITE_CONFIRMATION !== "PROVISION_DEVELOPMENT_DATABASE") throw new Error("Explicit development write confirmation is required.");
  if (apply && (!env.MONGODB_URI || !/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI))) throw new Error("A MongoDB connection is required for apply mode.");
  return { ...parsed.data, apply, database: developmentDatabase };
}

/** Check existing unique constraints; never create indexes as a side effect.
 * @param {import('mongodb').Db} db */
export async function verifyProvisioningIndexes(db) {
  const required = [
    { collection: "users", key: { email: 1 } },
    { collection: "tenants", key: { slug: 1 } },
    { collection: "memberships", key: { tenantId: 1, userId: 1 } },
    { collection: "authAccounts", key: { providerId: 1, accountId: 1 } },
  ];
  for (const spec of required) {
    const indexes = await db.collection(spec.collection).listIndexes().toArray();
    if (!indexes.some((index) => index.unique === true && !index.sparse && !index.partialFilterExpression && !index.collation && JSON.stringify(index.key) === JSON.stringify(spec.key))) throw new Error("Required unique indexes are missing or incompatible. Review approved index setup first.");
  }
}

/** Privileged offline maintenance only, not imported by the application.
 * @param {import('mongodb').MongoClient} client
 * @param {ReturnType<typeof validateProvisioning>} input */
export async function provisionDevelopmentOwner(client, input) {
  if (!input.apply || input.database !== developmentDatabase) throw new Error("Apply mode and dedicated database are required.");
  const db = client.db(developmentDatabase);
  const session = client.startSession();
  try {
    await verifyProvisioningIndexes(db);
    // Official Better Auth 1.7.13 scrypt, same hash format as email/password login.
    // Hash is stored ONLY in authAccounts.password, never users or marker metadata.
    const password = await hashPassword(input.password);
    const ids = { userId: new ObjectId(), accountId: new ObjectId(), tenantId: new ObjectId(), locationId: new ObjectId(), membershipId: new ObjectId() };
    await session.withTransaction(async () => {
      const options = { session };
      // MongoDB transactions do not support parallel operations on one session.
      const existingUser = await db.collection("users").findOne({ email: { $regex: `^${input.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }, options);
      const existingTenant = await db.collection("tenants").findOne({ slug }, options);
      const existingMarker = await db.collection("developmentProvisioning").findOne({ _id: markerId }, options);
      // Better Auth credential accounts are keyed by providerId + accountId=userId
      // hex (the unique index), never by email; email identity is the users check.
      const existingCredential = await db.collection("authAccounts").findOne({ $or: [{ providerId: "credential", accountId: ids.userId.toHexString() }, { userId: ids.userId }] }, options);
      if (existingUser || existingTenant || existingMarker || existingCredential) throw new Error("Provisioning target already exists. No existing account or tenant will be adopted or modified.");
      const now = new Date();
      // Unique _id serializes concurrent runs; retries recheck all conflicts.
      await db.collection("developmentProvisioning").insertOne({ _id: markerId, ...ids, version: 1, createdAt: now }, options);
      await db.collection("users").insertOne({ _id: ids.userId, name: input.name, email: input.email, emailVerified: false, status: "active", createdAt: now, updatedAt: now }, options);
      await db.collection("authAccounts").insertOne({ _id: ids.accountId, userId: ids.userId, accountId: ids.userId.toHexString(), providerId: "credential", password, createdAt: now, updatedAt: now }, options);
      await db.collection("tenants").insertOne({ _id: ids.tenantId, slug, name: "Tenant Pengembangan", status: "active", timezone: "Asia/Jakarta", createdAt: now, updatedAt: now }, options);
      await db.collection("locations").insertOne({ _id: ids.locationId, tenantId: ids.tenantId, name: "Lokasi Pengembangan", status: "active", timezone: "Asia/Jakarta", createdAt: now, updatedAt: now }, options);
      await db.collection("memberships").insertOne({ _id: ids.membershipId, userId: ids.userId, tenantId: ids.tenantId, role: "owner", status: "active", locationIds: [ids.locationId], createdAt: now, updatedAt: now }, options);
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
    return { ok: true, created: 6 };
  } catch {
    // Includes duplicate keys, unsupported transactions and ambiguous commits.
    // Never compensate/delete: rerun checks the marker if commit actually won.
    throw new Error("Provisioning was not confirmed. Review the dedicated database marker securely before retrying; no automatic cleanup was attempted.");
  } finally { await session.endSession().catch(() => {}); }
}
