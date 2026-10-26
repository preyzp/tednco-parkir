// @ts-check
import { MongoClient } from "mongodb";
import { validatePlatformAdminBootstrap, bootstrapPlatformAdmin } from "./platform-admin-core.mjs";

// Explicit CLI entry only. No .env.local loading, application import or signup endpoint.
async function main() {
  if (process.argv.slice(2).length === 1 && process.argv[2] === "--help") {
    console.log("Development-only first platform_admin bootstrap. Default: offline --dry-run. --apply requires explicit runtime opt-in and TEDNCO_DEV_WRITE_CONFIRMATION=BOOTSTRAP_PLATFORM_ADMIN. See HANDOFF.md. Never pass credentials as arguments.");
    return;
  }
  const input = validatePlatformAdminBootstrap(process.env, process.argv.slice(2));
  if (!input.apply) {
    console.log("DRY RUN (offline): plan one platform_admin user, one credential account and one one-time marker. No tenant or membership. No connection, hashing or writes. Existing records/indexes have NOT been checked.");
    return;
  }
  const client = new MongoClient(process.env.MONGODB_URI ?? "", { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    await bootstrapPlatformAdmin(client, input);
    console.log("Platform admin bootstrap committed. Three records created; no login session was issued.");
  } finally { await client.close(); }
}
main().catch(() => {
  console.error("Platform admin bootstrap was not confirmed. Check opt-in, inputs, unique indexes and the dedicated database marker securely. No automatic retry or cleanup. Connection and credential details are suppressed.");
  process.exitCode = 1;
});
