// @ts-check
import { ObjectId } from "mongodb";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { developmentDatabase } from "./dev-provisioning-core.mjs";

// Distinct from the Owner marker (…001). Unique _id serializes concurrent runs
// and makes the first platform_admin bootstrap one-time.
const markerId = new ObjectId("000000000000000000000002");
export const platformAdminConfirmation = "BOOTSTRAP_PLATFORM_ADMIN";
const inputSchema = z.object({ email: z.email().transform((email) => email.toLowerCase()), password: z.string().min(12).max(128), name: z.string().trim().min(1).max(100) });

/** @param {Record<string, string | undefined>} env @param {string[]} args */
export function validatePlatformAdminBootstrap(env, args) {
  if (env.NODE_ENV !== "development" || env.TEDNCO_ENABLE_DEV_PROVISIONING !== "1") throw new Error("Development provisioning is not enabled.");
  if (args.some((arg) => arg !== "--apply" && arg !== "--dry-run") || new Set(args).size !== args.length || (args.includes("--apply") && args.includes("--dry-run"))) throw new Error("Use --dry-run (default) or --apply only. Never put credentials in arguments.");
  if (env.MONGODB_DB_NAME !== developmentDatabase) throw new Error("Only the dedicated provisioning development database is allowed.");
  const parsed = inputSchema.safeParse({ email: env.TEDNCO_DEV_PLATFORM_ADMIN_EMAIL?.trim(), password: env.TEDNCO_DEV_PLATFORM_ADMIN_PASSWORD, name: env.TEDNCO_DEV_PLATFORM_ADMIN_NAME ?? "Platform Admin Pengembangan" });
  if (!parsed.success) throw new Error("Provide a valid email and a password of 12-128 characters through runtime environment variables.");
  const apply = args.includes("--apply");
  // A separate confirmation value so the Owner workflow's variable can never trigger this write.
  if (apply && env.TEDNCO_DEV_WRITE_CONFIRMATION !== platformAdminConfirmation) throw new Error("Explicit platform admin write confirmation is required.");
  if (apply && (!env.MONGODB_URI || !/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI))) throw new Error("A MongoDB connection is required for apply mode.");
  return { ...parsed.data, apply, database: developmentDatabase };
}

/** Check existing unique constraints; never create indexes as a side effect.
 * @param {import('mongodb').Db} db */
export async function verifyPlatformAdminIndexes(db) {
  const required = [
    { collection: "users", key: { email: 1 } },
    { collection: "authAccounts", key: { providerId: 1, accountId: 1 } },
  ];
  for (const spec of required) {
    const indexes = await db.collection(spec.collection).listIndexes().toArray();
    if (!indexes.some((index) => index.unique === true && !index.sparse && !index.partialFilterExpression && !index.collation && JSON.stringify(index.key) === JSON.stringify(spec.key))) throw new Error("Required unique indexes are missing or incompatible. Review approved index setup first.");
  }
}

/** Creates exactly one platform_admin identity + credential + marker. Never
 * promotes, updates or adopts an existing user; no tenant or membership.
 * @param {import('mongodb').MongoClient} client
 * @param {ReturnType<typeof validatePlatformAdminBootstrap>} input */
export async function bootstrapPlatformAdmin(client, input) {
  if (!input.apply || input.database !== developmentDatabase) throw new Error("Apply mode and dedicated database are required.");
  const db = client.db(developmentDatabase);
  const session = client.startSession();
  try {
    await verifyPlatformAdminIndexes(db);
    // Official Better Auth 1.7.13 scrypt, same format as the Owner provisioning and login.
    const password = await hashPassword(input.password);
    const ids = { userId: new ObjectId(), accountId: new ObjectId() };
    await session.withTransaction(async () => {
      const options = { session };
      // MongoDB transactions do not support parallel operations on one session.
      const existingUser = await db.collection("users").findOne({ email: { $regex: `^${input.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }, options);
      const existingAdmin = await db.collection("users").findOne({ platformRole: "platform_admin" }, options);
      const existingMarker = await db.collection("developmentProvisioning").findOne({ _id: markerId }, options);
      const existingCredential = await db.collection("authAccounts").findOne({ $or: [{ providerId: "credential", accountId: ids.userId.toHexString() }, { userId: ids.userId }] }, options);
      if (existingUser || existingAdmin || existingMarker || existingCredential) throw new Error("Platform admin bootstrap target already exists. No existing account will be promoted or modified.");
      const now = new Date();
      await db.collection("developmentProvisioning").insertOne({ _id: markerId, kind: "platform_admin", ...ids, version: 1, createdAt: now }, options);
      await db.collection("users").insertOne({ _id: ids.userId, name: input.name, email: input.email, emailVerified: false, status: "active", platformRole: "platform_admin", createdAt: now, updatedAt: now }, options);
      await db.collection("authAccounts").insertOne({ _id: ids.accountId, userId: ids.userId, accountId: ids.userId.toHexString(), providerId: "credential", password, createdAt: now, updatedAt: now }, options);
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
    return { ok: true, created: 3 };
  } catch {
    // Includes duplicate keys, write conflicts from a concurrent run,
    // unsupported transactions and ambiguous commits. Never compensate/delete.
    throw new Error("Platform admin bootstrap was not confirmed. Review the dedicated database marker securely before retrying; no automatic cleanup was attempted.");
  } finally { await session.endSession().catch(() => {}); }
}
