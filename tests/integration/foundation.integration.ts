import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { ObjectId, MongoServerError, type Db, type MongoClient } from "mongodb";
import type { ParkingSession, ParkingTransaction, PrepaidAccount, PrepaidLedgerEntry } from "../../src/types";
import { integrationTarget } from "./target";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

vi.mock("server-only", () => ({}));

let db: Db;
let client: MongoClient | undefined;
let setupIndexes: () => Promise<void>;

// Fixed diagnostics keep driver errors/connection configuration out of reports.
function safeCheck(work: () => Promise<void>): () => Promise<void> {
  return async () => {
    try { await work(); }
    catch { throw new Error("MongoDB integration verification failed. Inspect the isolated test database securely."); }
  };
}

function setupFailure(error: unknown, stage: string): Error {
  // Fixed categories only: never copy driver messages, stack, URI or key values.
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  const category = code === 13 ? "ACCESS_DENIED" : code === 18 ? "AUTHENTICATION_FAILED"
    : code === 11000 ? "DUPLICATE_KEY" : code === 85 || code === 86 ? "INDEX_CONFLICT"
    : "UNEXPECTED_FAILURE";
  const diagnostic = typeof code === "number" && Number.isSafeInteger(code) ? `; server code ${code}` : "";
  return new Error(`MongoDB integration setup failed: ${stage}; ${category}${diagnostic}.`);
}

beforeAll(async () => {
  // All guards run before importing the connection helper or opening a client.
  let atlasFile: Record<string, string | undefined> | undefined;
  if (process.env.RUN_MONGODB_INTEGRATION === "I_APPROVE_ATLAS_TEST_WRITES") {
    try { atlasFile = parseEnv(readFileSync(".env.local", "utf8")); }
    catch { throw new Error("Approved Atlas test configuration could not be loaded."); }
  }
  const target = integrationTarget(process.env, atlasFile);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("MONGODB_URI", target.uri);
  vi.stubEnv("MONGODB_DB_NAME", target.dbName);
  let stage = "CONNECT";
  try {
    const connection = await import("../../src/lib/mongodb");
    const clients = await Promise.all([connection.getMongoClient(), connection.getMongoClient()]);
    client = clients[0];
    expect(clients[0]).toBe(clients[1]);
    db = await connection.getDb();
    expect(db.databaseName).toBe(target.dbName);
    stage = "EMPTY_NAMESPACE_CHECK";
    // A fresh random name must not contain any existing collection.
    expect(await db.listCollections({}, { nameOnly: true }).hasNext()).toBe(false);
    console.info(`ISOLATED_TEST_DATABASE: ${target.dbName}`);
    setupIndexes = (await import("../../src/lib/database-indexes")).setupDatabaseIndexes;
    stage = "INDEX_INITIALIZATION";
    await setupIndexes();
  } catch (error) {
    throw setupFailure(error, stage);
  }
});

afterAll(async () => {
  try { await client?.close(); }
  catch { throw new Error("Integration connection cleanup failed."); }
  finally { vi.unstubAllEnvs(); }
  // Deliberately no dropDatabase, dropCollection, deleteMany, or index teardown.
});

test("index initialization reruns without altering the server index catalog", safeCheck(async () => {
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name).sort();
  const before = await Promise.all(names.map((name) => db.collection(name).listIndexes().toArray()));
  await setupIndexes();
  const after = await Promise.all(names.map((name) => db.collection(name).listIndexes().toArray()));
  expect(after).toEqual(before);
  expect(names).toHaveLength(12);
  expect(after.flat().filter(({ name }) => name !== "_id_")).toHaveLength(31);
  const active = after.flat().find(({ name }) => name === "parking_sessions_active_plate_unique");
  expect(active).toMatchObject({
    key: { tenantId: 1, locationId: 1, normalizedPlateSnapshot: 1 },
    unique: true, partialFilterExpression: { status: "active" },
  });
}));

async function competingInserts(write: () => Promise<unknown>): Promise<void> {
  const results = await Promise.allSettled([write(), write()]);
  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  const failures = results.filter((result) => result.status === "rejected");
  expect(failures).toHaveLength(1);
  expect(failures[0].reason instanceof MongoServerError && failures[0].reason.code === 11000).toBe(true);
}

test("concurrent active plates conflict only within the same tenant/location", safeCheck(async () => {
  const tenantId = new ObjectId();
  const locationId = new ObjectId();
  const now = new Date();
  const base: Omit<ParkingSession, "_id"> = {
    tenantId, locationId, vehicleId: new ObjectId(), plateNumberSnapshot: "TEST 1",
    normalizedPlateSnapshot: "TEST1", vehicleTypeSnapshot: "motor", entryAt: now,
    status: "active", enteredBy: new ObjectId(), createdAt: now, updatedAt: now,
  };
  const sessions = db.collection<ParkingSession>("parkingSessions");
  await competingInserts(() => sessions.insertOne({ ...base, _id: new ObjectId() }));
  expect(await sessions.countDocuments({ tenantId, locationId, status: "active" })).toBe(1);
  await sessions.insertMany([
    { ...base, _id: new ObjectId(), tenantId: new ObjectId() },
    { ...base, _id: new ObjectId(), locationId: new ObjectId() },
    { ...base, _id: new ObjectId(), status: "canceled", canceledAt: now, canceledBy: base.enteredBy, cancellationReason: "Gangguan operasional" },
    { ...base, _id: new ObjectId(), status: "completed", exitAt: now, completedBy: base.enteredBy, transactionId: new ObjectId() },
  ]);
}));

test("completed payments and posted debit references reject concurrent duplicates", safeCheck(async () => {
  const tenantId = new ObjectId();
  const locationId = new ObjectId();
  const actor = new ObjectId();
  const now = new Date();
  const transaction: Omit<ParkingTransaction, "_id"> = {
    tenantId, locationId, parkingSessionId: new ObjectId(), plateNumberSnapshot: "TEST 2",
    vehicleTypeSnapshot: "mobil", tariffSnapshot: { tariffType: "regular", amountPerUnit: 1, totalAmount: 1, currency: "IDR" },
    paymentMethod: "prepaid", amountDue: 1, amountPaid: 1, status: "completed",
    processedBy: actor, paymentAt: now, createdAt: now, updatedAt: now,
  };
  const transactions = db.collection<ParkingTransaction>("parkingTransactions");
  await competingInserts(() => transactions.insertOne({ ...transaction, _id: new ObjectId() }));
  await transactions.insertOne({ ...transaction, _id: new ObjectId(), status: "pending" });
  const ledger: Omit<PrepaidLedgerEntry, "_id"> = {
    tenantId, locationId, prepaidAccountId: new ObjectId(), type: "parking_debit",
    amount: 1, balanceBefore: 2, balanceAfter: 1, status: "posted", paymentMethod: "prepaid",
    referenceType: "parking_transaction", referenceId: new ObjectId(), performedBy: actor, createdAt: now, postedAt: now,
  };
  const entries = db.collection<PrepaidLedgerEntry>("prepaidLedger");
  await competingInserts(() => entries.insertOne({ ...ledger, _id: new ObjectId() }));
  await entries.insertOne({ ...ledger, _id: new ObjectId(), status: "pending" });
}));

test("prepaid account and idempotency scope uniqueness survive concurrent writes", safeCheck(async () => {
  const tenantId = new ObjectId();
  const locationId = new ObjectId();
  const actor = new ObjectId();
  const now = new Date();
  const account: Omit<PrepaidAccount, "_id"> = {
    tenantId, locationId, vehicleId: new ObjectId(), normalizedPlate: "TEST3", plateNumberSnapshot: "TEST 3",
    balance: 1, status: "active", createdAt: now, updatedAt: now, createdBy: actor, updatedBy: actor,
  };
  const accounts = db.collection<PrepaidAccount>("prepaidAccounts");
  await competingInserts(() => accounts.insertOne({ ...account, _id: new ObjectId() }));
  await accounts.insertOne({ ...account, _id: new ObjectId(), locationId: new ObjectId() });
  const key = { tenantId, actorId: actor, operation: "integration_index_probe", key: "synthetic-key", requestHash: "synthetic-hash", status: "processing", createdAt: now };
  const keys = db.collection("idempotencyKeys");
  await competingInserts(() => keys.insertOne({ ...key, _id: new ObjectId() }));
  await keys.insertOne({ ...key, _id: new ObjectId(), actorId: new ObjectId() });
}));
