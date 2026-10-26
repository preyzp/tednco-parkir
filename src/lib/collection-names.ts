import "server-only";

// Shared by the DAL and controlled index maintenance, not a collection accessor.
export const collectionNames = Object.freeze({
  tenants: "tenants",
  locations: "locations",
  users: "users",
  memberships: "memberships",
  vehicles: "vehicles",
  parkingSessions: "parkingSessions",
  tariffs: "tariffs",
  parkingTransactions: "parkingTransactions",
  prepaidAccounts: "prepaidAccounts",
  prepaidLedger: "prepaidLedger",
  auditLogs: "auditLogs",
  idempotencyKeys: "idempotencyKeys",
} as const);
