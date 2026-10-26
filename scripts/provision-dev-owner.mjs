// @ts-check
import { MongoClient } from "mongodb";
import { validateProvisioning, provisionDevelopmentOwner } from "./dev-provisioning-core.mjs";

// Explicit CLI entry only. No .env.local loading, application import or signup endpoint.
async function main() {
  if (process.argv.slice(2).length === 1 && process.argv[2] === "--help") {
    console.log("Development-only provisioning. Default: offline --dry-run. --apply requires explicit runtime opt-in and write confirmation. See HANDOFF.md. Never pass credentials as arguments.");
    return;
  }
  const input = validateProvisioning(process.env, process.argv.slice(2));
  if (!input.apply) {
    console.log("DRY RUN (offline): plan one Owner user, one credential account, one test tenant, one test location, one Owner membership and one one-time marker. No connection, hashing or writes. Existing records/indexes have NOT been checked.");
    return;
  }
  const client = new MongoClient(process.env.MONGODB_URI ?? "", { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    await provisionDevelopmentOwner(client, input);
    console.log("Development provisioning committed. Six records created; no login session was issued.");
  } finally { await client.close(); }
}
main().catch(() => {
  console.error("Development provisioning was not confirmed. Check opt-in, inputs, unique indexes and the dedicated database marker securely. No automatic retry or cleanup. Connection and credential details are suppressed.");
  process.exitCode = 1;
});
