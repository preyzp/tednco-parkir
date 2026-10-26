import "server-only";

import type { IndexDescription } from "mongodb";
import { collectionNames } from "./collection-names";
import { getDb } from "./mongodb";

// Stable deployment contracts: changes require a separately reviewed migration.
function indexDefinitions(): Record<keyof typeof collectionNames, IndexDescription[]> {
  return {
    tenants: [
      { name: "tenants_slug_unique", key: { slug: 1 }, unique: true },
      { name: "tenants_status", key: { status: 1 } },
    ],
    locations: [
      { name: "locations_tenant_status", key: { tenantId: 1, status: 1 } },
      { name: "locations_tenant_name", key: { tenantId: 1, name: 1 } },
    ],
    users: [
      { name: "users_email_unique", key: { email: 1 }, unique: true },
      { name: "users_status", key: { status: 1 } },
    ],
    memberships: [
      { name: "memberships_tenant_user_unique", key: { tenantId: 1, userId: 1 }, unique: true },
      { name: "memberships_user_status", key: { userId: 1, status: 1 } },
      { name: "memberships_tenant_role_status", key: { tenantId: 1, role: 1, status: 1 } },
    ],
    vehicles: [
      { name: "vehicles_tenant_plate", key: { tenantId: 1, normalizedPlate: 1 } },
      { name: "vehicles_tenant_type", key: { tenantId: 1, type: 1 } },
    ],
    parkingSessions: [
      { name: "parking_sessions_tenant_location_status_entry", key: { tenantId: 1, locationId: 1, status: 1, entryAt: -1 } },
      { name: "parking_sessions_tenant_location_plate_entry", key: { tenantId: 1, locationId: 1, normalizedPlateSnapshot: 1, entryAt: -1 } },
      { name: "parking_sessions_tenant_transaction", key: { tenantId: 1, transactionId: 1 } },
      { name: "parking_sessions_active_plate_unique", key: { tenantId: 1, locationId: 1, normalizedPlateSnapshot: 1 }, unique: true, partialFilterExpression: { status: "active" } },
    ],
    tariffs: [
      { name: "tariffs_tenant_location_vehicle_tariff_status", key: { tenantId: 1, locationId: 1, vehicleType: 1, tariffType: 1, status: 1 } },
    ],
    parkingTransactions: [
      { name: "parking_transactions_completed_session_unique", key: { tenantId: 1, parkingSessionId: 1 }, unique: true, partialFilterExpression: { status: "completed" } },
      { name: "parking_transactions_tenant_location_payment", key: { tenantId: 1, locationId: 1, paymentAt: -1 } },
      { name: "parking_transactions_tenant_status_created", key: { tenantId: 1, status: 1, createdAt: -1 } },
      { name: "parking_transactions_tenant_plate_payment", key: { tenantId: 1, plateNumberSnapshot: 1, paymentAt: -1 } },
    ],
    prepaidAccounts: [
      { name: "prepaid_accounts_tenant_location_vehicle_unique", key: { tenantId: 1, locationId: 1, vehicleId: 1 }, unique: true },
      { name: "prepaid_accounts_tenant_location_plate", key: { tenantId: 1, locationId: 1, normalizedPlate: 1 } },
      { name: "prepaid_accounts_tenant_location_status_balance", key: { tenantId: 1, locationId: 1, status: 1, balance: 1 } },
    ],
    prepaidLedger: [
      { name: "prepaid_ledger_tenant_account_created", key: { tenantId: 1, prepaidAccountId: 1, createdAt: -1 } },
      { name: "prepaid_ledger_tenant_location_type_created", key: { tenantId: 1, locationId: 1, type: 1, createdAt: -1 } },
      { name: "prepaid_ledger_tenant_reference", key: { tenantId: 1, referenceType: 1, referenceId: 1 } },
      { name: "prepaid_ledger_posted_parking_debit_unique", key: { tenantId: 1, referenceId: 1 }, unique: true, partialFilterExpression: { type: "parking_debit", status: "posted", referenceType: "parking_transaction" } },
    ],
    auditLogs: [
      { name: "audit_logs_tenant_created", key: { tenantId: 1, createdAt: -1 } },
      { name: "audit_logs_tenant_entity_created", key: { tenantId: 1, entityType: 1, entityId: 1, createdAt: -1 } },
      { name: "audit_logs_actor_created", key: { actorId: 1, createdAt: -1 } },
    ],
    idempotencyKeys: [
      { name: "idempotency_keys_tenant_actor_operation_key_unique", key: { tenantId: 1, actorId: 1, operation: 1, key: 1 }, unique: true },
    ],
  };
}

/** Privileged deployment maintenance ONLY. Never call from requests/startup.
 * No connection or index setup occurs on import; no DAL auth bypass is added. */
export async function setupDatabaseIndexes(): Promise<void> {
  const db = await getDb();
  const definitions = indexDefinitions();
  for (const name of Object.keys(definitions) as (keyof typeof definitions)[]) {
    try {
      await db.collection(collectionNames[name]).createIndexes(definitions[name]);
    } catch {
      // Raw duplicate-key errors may contain indexed values. No cause or log.
      throw new Error(`Database index setup failed for ${name}. Check existing duplicates and index definitions through a secure maintenance session before retrying.`);
    }
  }
}
