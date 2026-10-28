// @ts-check
import { developmentDatabase } from "./dev-provisioning-core.mjs";

// Must equal the parkingSessions/vehicles/parkingTransactions entries of
// src/lib/database-indexes.ts (enforced by scripts/parking-indexes.test.ts).
// The unique partial indexes are the documented guards against two active
// sessions for one plate per location (P4.3) and two completed payments for one
// session (P4.5 checkout). Re-running skips indexes that already exist identically.
/** @typedef {{ name: string, key: Record<string, 1 | -1>, unique?: boolean, partialFilterExpression?: Record<string, unknown> }} PlannedIndex */
export const parkingIndexPlan = Object.freeze(/** @type {Record<"parkingSessions" | "vehicles" | "parkingTransactions", PlannedIndex[]>} */ ({
  parkingSessions: [
    { name: "parking_sessions_tenant_location_status_entry", key: { tenantId: 1, locationId: 1, status: 1, entryAt: -1 } },
    { name: "parking_sessions_tenant_location_plate_entry", key: { tenantId: 1, locationId: 1, normalizedPlateSnapshot: 1, entryAt: -1 } },
    { name: "parking_sessions_tenant_transaction", key: { tenantId: 1, transactionId: 1 } },
    { name: "parking_sessions_active_plate_unique", key: { tenantId: 1, locationId: 1, normalizedPlateSnapshot: 1 }, unique: true, partialFilterExpression: { status: "active" } },
  ],
  vehicles: [
    { name: "vehicles_tenant_plate", key: { tenantId: 1, normalizedPlate: 1 } },
    { name: "vehicles_tenant_type", key: { tenantId: 1, type: 1 } },
  ],
  parkingTransactions: [
    { name: "parking_transactions_completed_session_unique", key: { tenantId: 1, parkingSessionId: 1 }, unique: true, partialFilterExpression: { status: "completed" } },
    { name: "parking_transactions_tenant_location_payment", key: { tenantId: 1, locationId: 1, paymentAt: -1 } },
    { name: "parking_transactions_tenant_status_created", key: { tenantId: 1, status: 1, createdAt: -1 } },
    { name: "parking_transactions_tenant_plate_payment", key: { tenantId: 1, plateNumberSnapshot: 1, paymentAt: -1 } },
  ],
}));
export const parkingIndexConfirmation = "CREATE_PARKING_INDEXES";

/** @param {Record<string, string | undefined>} env @param {string[]} args */
export function validateParkingIndexSetup(env, args) {
  if (env.NODE_ENV !== "development" || env.TEDNCO_ENABLE_DEV_PROVISIONING !== "1") throw new Error("Development maintenance is not enabled.");
  if (args.some((arg) => arg !== "--apply" && arg !== "--dry-run") || new Set(args).size !== args.length || (args.includes("--apply") && args.includes("--dry-run"))) throw new Error("Use --dry-run (default) or --apply only.");
  if (env.MONGODB_DB_NAME !== developmentDatabase) throw new Error("Only the dedicated provisioning development database is allowed.");
  const apply = args.includes("--apply");
  if (apply && env.TEDNCO_DEV_WRITE_CONFIRMATION !== parkingIndexConfirmation) throw new Error("Explicit parking index confirmation is required.");
  if (apply && (!env.MONGODB_URI || !/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI))) throw new Error("A MongoDB connection is required for apply mode.");
  return { apply, database: developmentDatabase };
}

/** @param {any} index @param {any} planned */
function identical(index, planned) {
  return JSON.stringify(index.key) === JSON.stringify(planned.key) && Boolean(index.unique) === Boolean(planned.unique)
    && JSON.stringify(index.partialFilterExpression ?? null) === JSON.stringify(planned.partialFilterExpression ?? null)
    && !index.sparse && !index.collation;
}

/** Create-only: pre-check everything, then create missing indexes one by one,
 * then verify. Never drops, modifies or writes documents. Stops on conflicts.
 * @param {import('mongodb').MongoClient} client @param {{ apply: boolean, database: string }} input */
export async function applyParkingIndexes(client, input) {
  if (!input.apply || input.database !== developmentDatabase) throw new Error("Apply mode and dedicated database are required.");
  const db = client.db(developmentDatabase);
  /** @type {string[]} */ const log = [];
  /** @param {string} name */
  const current = async (name) => { try { return await db.collection(name).listIndexes().toArray(); } catch { return []; } };
  for (const [collection, plan] of Object.entries(parkingIndexPlan)) {
    const existing = await current(collection);
    for (const planned of plan) {
      const byName = existing.find((index) => index.name === planned.name);
      const byKey = existing.find((index) => index.name !== planned.name && JSON.stringify(index.key) === JSON.stringify(planned.key));
      if (byName && !identical(byName, planned)) throw new Error(`Conflict: ${collection}.${planned.name} exists with different options.`);
      if (byKey) throw new Error(`Conflict: ${collection} already has another index on the same key.`);
    }
  }
  for (const [collection, plan] of Object.entries(parkingIndexPlan)) {
    for (const planned of plan) {
      const existing = (await current(collection)).find((index) => index.name === planned.name);
      if (existing && identical(existing, planned)) { log.push(`SKIP identical ${collection}.${planned.name}`); continue; }
      const { name, key, ...options } = planned;
      await db.collection(collection).createIndex(key, { name, ...options });
      log.push(`CREATED ${collection}.${planned.name}`);
    }
  }
  for (const [collection, plan] of Object.entries(parkingIndexPlan)) {
    const existing = await current(collection);
    for (const planned of plan) {
      const index = existing.find((row) => row.name === planned.name);
      if (!index || !identical(index, planned)) throw new Error(`Verification failed for ${collection}.${planned.name}.`);
      log.push(`PASS ${collection}.${planned.name}`);
    }
  }
  return log;
}
