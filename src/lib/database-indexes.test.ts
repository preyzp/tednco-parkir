import { beforeEach, expect, test, vi } from "vitest";
import type { IndexDescription } from "mongodb";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), collection: vi.fn(), createIndexes: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./mongodb", () => ({ getDb: mocks.getDb }));
import { setupDatabaseIndexes } from "./database-indexes";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getDb.mockResolvedValue({ collection: mocks.collection });
  mocks.collection.mockReturnValue({ createIndexes: mocks.createIndexes });
  mocks.createIndexes.mockResolvedValue([]);
});

function definitionsFor(collection: string): IndexDescription[] {
  const position = mocks.collection.mock.calls.findIndex(([name]) => name === collection);
  expect(position).toBeGreaterThanOrEqual(0);
  return mocks.createIndexes.mock.calls[position][0];
}

test("import does not connect or create indexes", async () => {
  vi.resetModules();
  await import("./database-indexes");
  expect(mocks.getDb).not.toHaveBeenCalled();
  expect(mocks.createIndexes).not.toHaveBeenCalled();
});

test("explicit setup covers only the documented core and idempotency collections", async () => {
  await setupDatabaseIndexes();
  expect(mocks.collection.mock.calls.map(([name]) => name)).toEqual([
    "tenants", "locations", "users", "memberships", "vehicles", "parkingSessions",
    "tariffs", "parkingTransactions", "prepaidAccounts", "prepaidLedger", "auditLogs", "idempotencyKeys",
  ]);
  expect(mocks.getDb).toHaveBeenCalledOnce();
  expect(mocks.createIndexes).toHaveBeenCalledTimes(12);
  const all: IndexDescription[] = mocks.createIndexes.mock.calls.flatMap(([definitions]) => definitions);
  expect(all).toHaveLength(31);
  expect(new Set(all.map(({ name }) => name)).size).toBe(all.length);
  for (const definition of all) {
    expect(definition.name).toMatch(/^[a-z][a-z_]+$/);
    expect(definition.expireAfterSeconds).toBeUndefined();
    expect(definition.sparse).toBeUndefined();
  }
});

test.each([
  ["tenants", "tenants_slug_unique", { slug: 1 }],
  ["users", "users_email_unique", { email: 1 }],
  ["memberships", "memberships_tenant_user_unique", { tenantId: 1, userId: 1 }],
  ["prepaidAccounts", "prepaid_accounts_tenant_location_vehicle_unique", { tenantId: 1, locationId: 1, vehicleId: 1 }],
  ["idempotencyKeys", "idempotency_keys_tenant_actor_operation_key_unique", { tenantId: 1, actorId: 1, operation: 1, key: 1 }],
])("enforces documented uniqueness for %s", async (collection, name, key) => {
  await setupDatabaseIndexes();
  expect(definitionsFor(collection as string)).toContainEqual({ name, key, unique: true });
});

test("one active tariff per location, vehicle type and tariff type; inactive history is excluded", async () => {
  await setupDatabaseIndexes();
  expect(definitionsFor("tariffs")).toEqual([{ name: "tariffs_location_vehicle_tariff_active_unique", key: { tenantId: 1, locationId: 1, vehicleType: 1, tariffType: 1 }, unique: true, partialFilterExpression: { status: "active" } }]);
});
test("active uniqueness matches normalized snapshot and excludes completed/canceled history", async () => {
  await setupDatabaseIndexes();
  expect(definitionsFor("parkingSessions")).toContainEqual({
    name: "parking_sessions_active_plate_unique",
    key: { tenantId: 1, locationId: 1, normalizedPlateSnapshot: 1 },
    unique: true, partialFilterExpression: { status: "active" },
  });
  expect(definitionsFor("vehicles").every(({ unique }) => !unique)).toBe(true);
});

test("only successful session payments and posted parking debit references are unique", async () => {
  await setupDatabaseIndexes();
  expect(definitionsFor("parkingTransactions")).toContainEqual({
    name: "parking_transactions_completed_session_unique",
    key: { tenantId: 1, parkingSessionId: 1 }, unique: true,
    partialFilterExpression: { status: "completed" },
  });
  expect(definitionsFor("prepaidLedger")).toContainEqual({
    name: "prepaid_ledger_posted_parking_debit_unique", key: { tenantId: 1, referenceId: 1 }, unique: true,
    partialFilterExpression: { type: "parking_debit", status: "posted", referenceType: "parking_transaction" },
  });
});

test.each([
  ["locations", { tenantId: 1, status: 1 }],
  ["locations", { tenantId: 1, name: 1 }],
  ["memberships", { userId: 1, status: 1 }],
  ["memberships", { tenantId: 1, role: 1, status: 1 }],
  ["vehicles", { tenantId: 1, normalizedPlate: 1 }],
  ["vehicles", { tenantId: 1, type: 1 }],
  ["parkingSessions", { tenantId: 1, locationId: 1, status: 1, entryAt: -1 }],
  ["parkingSessions", { tenantId: 1, locationId: 1, normalizedPlateSnapshot: 1, entryAt: -1 }],
  ["parkingSessions", { tenantId: 1, transactionId: 1 }],
  ["parkingTransactions", { tenantId: 1, locationId: 1, paymentAt: -1 }],
  ["parkingTransactions", { tenantId: 1, status: 1, createdAt: -1 }],
  ["parkingTransactions", { tenantId: 1, plateNumberSnapshot: 1, paymentAt: -1 }],
  ["prepaidAccounts", { tenantId: 1, locationId: 1, normalizedPlate: 1 }],
  ["prepaidAccounts", { tenantId: 1, locationId: 1, status: 1, balance: 1 }],
  ["prepaidLedger", { tenantId: 1, prepaidAccountId: 1, createdAt: -1 }],
  ["prepaidLedger", { tenantId: 1, locationId: 1, type: 1, createdAt: -1 }],
  ["prepaidLedger", { tenantId: 1, referenceType: 1, referenceId: 1 }],
  ["auditLogs", { tenantId: 1, createdAt: -1 }],
  ["auditLogs", { tenantId: 1, entityType: 1, entityId: 1, createdAt: -1 }],
  ["auditLogs", { actorId: 1, createdAt: -1 }],
])("retains documented lookup key order for %s: %j", async (collection, key) => {
  await setupDatabaseIndexes();
  const definition = definitionsFor(collection as string).find((entry) =>
    JSON.stringify(entry.key) === JSON.stringify(key));
  expect(definition).toBeDefined();
  expect(definition?.unique).toBeUndefined();
});

test("reruns send identical specifications without destructive driver methods", async () => {
  await setupDatabaseIndexes();
  const first = structuredClone(mocks.createIndexes.mock.calls);
  await setupDatabaseIndexes();
  expect(mocks.createIndexes.mock.calls.slice(12)).toEqual(first);
  // The mock exposes only createIndexes; drop/sync/alter would fail the test.
  expect(mocks.collection).toHaveBeenCalledTimes(24);
});

test.each([11000, 85, 86])("failure %s stops setup, sanitizes errors and permits explicit rerun", async (code) => {
  const error = Object.assign(new Error("secret mongodb URI; duplicate private@example.test"), { code });
  mocks.createIndexes.mockRejectedValueOnce(error);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(setupDatabaseIndexes()).rejects.toEqual(new Error(
      "Database index setup failed for tenants. Check existing duplicates and index definitions through a secure maintenance session before retrying.",
    ));
    expect(mocks.collection).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
    await setupDatabaseIndexes();
    expect(mocks.createIndexes).toHaveBeenCalledTimes(13);
  } finally {
    vi.restoreAllMocks();
  }
});

test("mid-setup conflict preserves earlier progress and reruns the identical manifest", async () => {
  mocks.createIndexes.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    .mockRejectedValueOnce(Object.assign(new Error("private index conflict"), { code: 85 }));
  await expect(setupDatabaseIndexes()).rejects.toThrow("failed for users");
  expect(mocks.collection.mock.calls.map(([name]) => name)).toEqual(["tenants", "locations", "users"]);
  const attempted = structuredClone(mocks.createIndexes.mock.calls);
  await setupDatabaseIndexes();
  expect(mocks.createIndexes.mock.calls.slice(3, 6)).toEqual(attempted);
  expect(mocks.createIndexes).toHaveBeenCalledTimes(15);
});

test("database acquisition failure never starts index work", async () => {
  mocks.getDb.mockRejectedValueOnce(new Error("Unavailable"));
  await expect(setupDatabaseIndexes()).rejects.toThrow("Unavailable");
  expect(mocks.collection).not.toHaveBeenCalled();
});
