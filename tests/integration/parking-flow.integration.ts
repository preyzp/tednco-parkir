import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { ObjectId, type Db, type MongoClient } from "mongodb";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { integrationTarget } from "./target";

// Live parking flow (opt-in, Tahap 2B): the real repositories run against the
// real MongoDB driver, transactions and unique indexes in a fresh random test
// database. Only requirePermission is mocked (an Owner context for synthetic
// tenants/locations seeded here); no Better Auth, no development data. No fake
// timers: entry/exit use real time and nights are proven through `now`.
// Same guards as foundation.integration.ts; the database is retained.

const mocks = vi.hoisted(() => ({ guard: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/dal/authorization", () => ({ requirePermission: mocks.guard }));

type Sessions = typeof import("../../src/lib/dal/parking-sessions");
type Checkout = typeof import("../../src/lib/dal/parking-checkout");
type Settings = typeof import("../../src/lib/dal/location-settings");
let db: Db;
let client: MongoClient | undefined;
let sessions: Sessions;
let checkout: Checkout;
let settings: Settings;
let logSpy: ReturnType<typeof vi.spyOn> | undefined;

// Assertion failures (synthetic data only) stay readable; anything else (driver,
// connection) is replaced by a fixed message without causes, URI or values.
function live(work: () => Promise<void>): () => Promise<void> {
  return async () => {
    try { await work(); }
    catch (error) {
      if (error instanceof Error && error.name === "AssertionError") throw error;
      const name = error instanceof Error && /^(Mongo[A-Za-z]*Error|AppError)$/.test(error.name) ? error.name : "UnexpectedError";
      throw new Error(`MongoDB parking-flow verification failed (${name}). Inspect the isolated test database securely.`);
    }
  };
}
function setupFailure(error: unknown, stage: string): Error {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  const category = code === 13 ? "ACCESS_DENIED" : code === 18 ? "AUTHENTICATION_FAILED"
    : code === 11000 ? "DUPLICATE_KEY" : code === 85 || code === 86 ? "INDEX_CONFLICT"
    : "UNEXPECTED_FAILURE";
  const diagnostic = typeof code === "number" && Number.isSafeInteger(code) ? `; server code ${code}` : "";
  return new Error(`MongoDB parking-flow setup failed: ${stage}; ${category}${diagnostic}.`);
}

const userId = new ObjectId();
const t1 = new ObjectId(); const t2 = new ObjectId(); const l1 = new ObjectId(); const l2 = new ObjectId(); const l3 = new ObjectId();
const sel = (tenantId: ObjectId, locationId: ObjectId) => ({ tenantId: tenantId.toHexString(), locationId: locationId.toHexString() });
const north = sel(t1, l1); const west = sel(t1, l2); const foreign = sel(t2, l3);
// Scenario rates (test fixtures only, not production tariffs).
const firstSettings = { tariffs: { motor: { regular: 3_000, overnight: 7_000 }, mobil: { regular: 6_000, overnight: 12_000 } }, operatingHours: { openTime: "06:00", closeTime: "22:00" } };
const laterSettings = { tariffs: { motor: { regular: 4_000, overnight: 9_000 }, mobil: { regular: 8_000, overnight: 50_000 } }, operatingHours: { openTime: "05:00", closeTime: "00:00" } };
const keys = { a: "6f1c1d7e-2b3a-4c5d-8e9f-0a1b2c3d4e5f", b: "7a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d", c: "8b3c4d5e-6f7a-4b2c-8d3e-4f5a6b7c8d9e", d: "9c4d5e6f-7a8b-4c3d-9e4f-5a6b7c8d9e0f", e: "0d5e6f7a-8b9c-4d4e-8f5a-6b7c8d9e0f1a" };
const day = 24 * 60 * 60 * 1000;
const state: { a?: string; b?: string; c?: string; paidA?: Awaited<ReturnType<Checkout["completeParkingCheckout"]>>; firstPaymentAt?: Date } = {};
const activeAt = (locationId: ObjectId, plate?: string) => db.collection("parkingSessions").countDocuments({ tenantId: t1, locationId, status: "active", ...(plate ? { normalizedPlateSnapshot: plate } : {}) });
const completedFor = (sessionId: string) => db.collection("parkingTransactions").countDocuments({ tenantId: t1, parkingSessionId: new ObjectId(sessionId), status: "completed" });
const idOf = async (selection: { tenantId: string; locationId: string }, plate: string) => {
  const { rows } = await sessions.listLocationVehicles(selection, sessions.parseVehicleListQuery({ q: plate }));
  expect(rows).toHaveLength(1);
  return rows[0].id;
};

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
    client = await connection.getMongoClient();
    db = await connection.getDb();
    expect(db.databaseName).toBe(target.dbName);
    stage = "EMPTY_NAMESPACE_CHECK";
    expect(await db.listCollections({}, { nameOnly: true }).hasNext()).toBe(false);
    console.info(`ISOLATED_TEST_DATABASE: ${target.dbName}`);
    stage = "INDEX_INITIALIZATION";
    await (await import("../../src/lib/database-indexes")).setupDatabaseIndexes();
    stage = "SYNTHETIC_FIXTURES";
    const suffix = target.dbName.slice(-12);
    await db.collection("tenants").insertMany([
      { _id: t1, name: "Tenant Uji Alur", slug: `tpk-flow-a-${suffix}`, status: "active", timezone: "Asia/Jakarta", createdAt: new Date(), updatedAt: new Date() },
      { _id: t2, name: "Tenant Uji Lain", slug: `tpk-flow-b-${suffix}`, status: "active", timezone: "Asia/Jakarta", createdAt: new Date(), updatedAt: new Date() },
    ]);
    await db.collection("locations").insertMany([
      { _id: l1, tenantId: t1, name: "Lokasi Uji Utara", status: "active", timezone: "Asia/Jakarta", createdAt: new Date(), updatedAt: new Date() },
      { _id: l2, tenantId: t1, name: "Lokasi Uji Barat", status: "active", timezone: "Asia/Jakarta", createdAt: new Date(), updatedAt: new Date() },
      { _id: l3, tenantId: t2, name: "Lokasi Uji Lain", status: "active", timezone: "Asia/Jakarta", createdAt: new Date(), updatedAt: new Date() },
    ]);
    stage = "REPOSITORIES";
    sessions = await import("../../src/lib/dal/parking-sessions");
    checkout = await import("../../src/lib/dal/parking-checkout");
    settings = await import("../../src/lib/dal/location-settings");
  } catch (error) {
    throw setupFailure(error, stage);
  }
  // The guard returns an Owner context derived from the selection (synthetic ids only).
  mocks.guard.mockImplementation(async (_permission: string, selection: { tenantId: string; locationId: string }) => Object.freeze({
    userId, tenantId: new ObjectId(selection.tenantId), locationId: new ObjectId(selection.locationId), role: "owner",
    permissions: ["vehicle.create", "vehicle.read", "parking.checkout", "tariff.manage", "locations.manage"],
  }));
  logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(async () => {
  logSpy?.mockRestore();
  try { await client?.close(); }
  catch { throw new Error("Integration connection cleanup failed."); }
  finally { vi.unstubAllEnvs(); }
  // Deliberately no dropDatabase, dropCollection, deleteMany, or index teardown.
});

describe("live parking flow (shared state, in order)", () => {
  test("location settings are saved once; a retry on the old revision conflicts", live(async () => {
    expect(await settings.updateLocationSettings(north, { ...firstSettings, expectedRevision: 0 })).toMatchObject({ ok: true, settings: { revision: 1 } });
    expect(await settings.updateLocationSettings(north, { ...firstSettings, expectedRevision: 0 })).toEqual({ ok: false, reason: "conflict" });
    expect(await db.collection("tariffs").countDocuments({ tenantId: t1, locationId: l1, status: "active" })).toBe(4);
  }));

  test("entry: one active plate per tenant/location, also under concurrency; retry after commit is a duplicate", live(async () => {
    expect(await sessions.recordVehicleEntry(north, { plateNumber: " b  1234   xyz ", vehicleType: "mobil" })).toMatchObject({ ok: true, entry: { plateNumber: "B 1234 XYZ" } });
    expect(await sessions.recordVehicleEntry(west, { plateNumber: "B 1234 XYZ", vehicleType: "mobil" })).toMatchObject({ ok: true });
    expect(await sessions.recordVehicleEntry(foreign, { plateNumber: "B 1234 XYZ", vehicleType: "mobil" })).toMatchObject({ ok: true });
    expect(await sessions.recordVehicleEntry(north, { plateNumber: "B1234XYZ", vehicleType: "mobil" })).toEqual({ ok: false, reason: "duplicate_active" });
    const concurrent = await Promise.all([1, 2].map(() => sessions.recordVehicleEntry(north, { plateNumber: "B 5678 CON", vehicleType: "mobil" })));
    expect(concurrent.filter((result) => result.ok)).toHaveLength(1);
    expect(concurrent.filter((result) => !result.ok && result.reason === "duplicate_active")).toHaveLength(1);
    expect(await activeAt(l1, "B5678CON")).toBe(1);
    expect(await activeAt(l1, "B1234XYZ")).toBe(1);
  }), 60_000);

  test("active list is scoped to the location; another location cannot open the session", live(async () => {
    const list = await sessions.listLocationVehicles(north, sessions.parseVehicleListQuery({}));
    expect(list).toMatchObject({ total: 2, ready: true });
    expect(list.rows.map((row) => row.plateNumber).sort()).toEqual(["B 1234 XYZ", "B 5678 CON"]);
    state.a = await idOf(north, "B 1234 XYZ");
    state.b = await idOf(north, "B 5678 CON");
    expect((await sessions.listLocationVehicles(west, sessions.parseVehicleListQuery({}))).total).toBe(1);
    expect(await checkout.getParkingCheckout(west, state.a)).toEqual({ kind: "not_found" });
  }));

  test("Menginap checkout at the location's tariff and hours; price_changed; idempotent replay; retry after commit", live(async () => {
    const id = state.a!;
    const session = await db.collection("parkingSessions").findOne({ _id: new ObjectId(id) });
    const quoteAt = new Date((session!.entryAt as Date).getTime() + 2 * day); // exactly two 22:00 closings in between
    expect(await checkout.getParkingCheckout(north, id, quoteAt)).toMatchObject({ kind: "active", quote: {
      nights: 2, suggestion: { tariffType: "overnight", nightCount: 2 },
      rates: { regular: { amount: 6_000, source: "location" }, overnight: { amount: 12_000, source: "location" } },
      policy: { openTime: "06:00", closeTime: "22:00", source: "location" },
    } });
    const input = { sessionId: id, tariffType: "overnight", nightCount: 2, paymentMethod: "cash", idempotencyKey: keys.a };
    expect(await checkout.completeParkingCheckout(north, { ...input, expectedTotal: 20_000 })).toEqual({ ok: false, reason: "price_changed", totalAmount: 24_000 });
    expect(await completedFor(id)).toBe(0);
    const paid = await checkout.completeParkingCheckout(north, { ...input, expectedTotal: 24_000 });
    expect(paid).toMatchObject({ ok: true, replayed: false, receipt: { tariffType: "overnight", nightCount: 2, amountPerUnit: 12_000, totalAmount: 24_000, paymentMethod: "cash" } });
    state.paidA = paid;
    // Retry after a successful commit (what a lost reply leads to): replay, never a second payment.
    expect(await checkout.completeParkingCheckout(north, { ...input, expectedTotal: 24_000 })).toEqual(paid.ok ? { ...paid, replayed: true } : paid);
    expect(await checkout.completeParkingCheckout(north, { sessionId: id, tariffType: "regular", paymentMethod: "cash", expectedTotal: 6_000, idempotencyKey: keys.b })).toEqual({ ok: false, reason: "already_completed" });
    expect(await completedFor(id)).toBe(1);
    const transaction = await db.collection("parkingTransactions").findOne({ tenantId: t1, parkingSessionId: new ObjectId(id), status: "completed" });
    expect(transaction).toMatchObject({
      locationId: l1, paymentMethod: "cash", amountDue: 24_000, amountPaid: 24_000, idempotencyKey: keys.a,
      tariffSnapshot: { tariffType: "overnight", amountPerUnit: 12_000, nightCount: 2, totalAmount: 24_000, currency: "IDR" },
      policySnapshot: { openTime: "06:00", closeTime: "22:00", source: "location" },
    });
    const closed = await db.collection("parkingSessions").findOne({ _id: new ObjectId(id) });
    expect(closed).toMatchObject({ status: "completed" });
    expect(closed!.exitAt).toBeInstanceOf(Date);
    expect((closed!.transactionId as ObjectId).equals(transaction!._id as ObjectId)).toBe(true);
  }), 60_000);

  test("concurrent checkouts: same key → one payment, both report it; different keys → one wins", live(async () => {
    const same = { sessionId: state.b!, tariffType: "regular", paymentMethod: "cash", expectedTotal: 6_000, idempotencyKey: keys.c };
    const twins = await Promise.all([checkout.completeParkingCheckout(north, same), checkout.completeParkingCheckout(north, same)]);
    expect(twins.every((result) => result.ok)).toBe(true);
    expect(twins.filter((result) => result.ok && !result.replayed)).toHaveLength(1);
    expect(await completedFor(state.b!)).toBe(1);

    expect(await sessions.recordVehicleEntry(north, { plateNumber: "B 9999 PAR", vehicleType: "mobil" })).toMatchObject({ ok: true });
    state.c = await idOf(north, "B 9999 PAR");
    const rivals = await Promise.all([keys.d, keys.e].map((idempotencyKey) => checkout.completeParkingCheckout(north, { sessionId: state.c!, tariffType: "regular", paymentMethod: "cash", expectedTotal: 6_000, idempotencyKey })));
    expect(rivals.filter((result) => result.ok)).toHaveLength(1);
    expect(rivals.filter((result) => !result.ok && result.reason === "already_completed")).toHaveLength(1);
    expect(await completedFor(state.c!)).toBe(1);
  }), 90_000);

  test("after checkout: no active session left, history kept, dashboard revenue equals the payments", live(async () => {
    expect(await sessions.listLocationVehicles(north, sessions.parseVehicleListQuery({}))).toMatchObject({ total: 0, rows: [] });
    expect(await activeAt(l1)).toBe(0);
    expect((await sessions.listLocationVehicles(north, sessions.parseVehicleListQuery({ status: "completed" }))).total).toBe(3);
    const payments = await db.collection("parkingTransactions").find({ tenantId: t1, locationId: l1, status: "completed" }).toArray();
    expect(payments).toHaveLength(3);
    const total = payments.reduce((sum, row) => sum + (row.amountPaid as number), 0);
    expect(total).toBe(24_000 + 6_000 + 6_000);
    // "Today" counts exitAt/paymentAt >= start of the local day of `now` (lower bound only).
    // Anchor `now` on the stored payments instead of the wall clock, so the result does not
    // depend on the run crossing 00:00 WIB: the day of the first payment includes all three.
    for (const payment of payments) {
      const closed = await db.collection("parkingSessions").findOne({ _id: payment.parkingSessionId as ObjectId });
      expect((closed!.exitAt as Date).getTime()).toBe((payment.paymentAt as Date).getTime());
    }
    const firstPaymentAt = new Date(Math.min(...payments.map((row) => (row.paymentAt as Date).getTime())));
    state.firstPaymentAt = firstPaymentAt;
    expect(await sessions.getLocationParkingOverview(north, firstPaymentAt)).toMatchObject({ activeCount: 0, exitsToday: 3, revenueToday: total });
    // The day window excludes earlier days: two local days later nothing counts as today.
    expect(await sessions.getLocationParkingOverview(north, new Date(firstPaymentAt.getTime() + 2 * day))).toMatchObject({ exitsToday: 0, revenueToday: 0 });
    expect(await sessions.getLocationParkingOverview(west, firstPaymentAt)).toMatchObject({ activeCount: 1, exitsToday: 0, revenueToday: 0 });
    expect(await db.collection("auditLogs").countDocuments({ tenantId: t1, action: "parking.checkout" })).toBe(3);
  }));

  test("tariffs and hours change after checkout; completed transactions and their snapshots stay identical", live(async () => {
    const before = await db.collection("parkingTransactions").find({ tenantId: t1 }).sort({ _id: 1 }).toArray();
    expect(await settings.updateLocationSettings(north, { ...laterSettings, expectedRevision: 1 })).toMatchObject({ ok: true, settings: { revision: 2, operatingHours: { closeTime: "00:00", source: "location" } } });
    expect(await settings.updateLocationSettings(north, { ...laterSettings, expectedRevision: 1 })).toEqual({ ok: false, reason: "conflict" });
    expect(await db.collection("parkingTransactions").find({ tenantId: t1 }).sort({ _id: 1 }).toArray()).toEqual(before);
    expect(await checkout.getParkingCheckout(north, state.a!)).toEqual({ kind: "completed", receipt: state.paidA?.ok ? state.paidA.receipt : null });
    expect(await sessions.getLocationParkingOverview(north, state.firstPaymentAt!)).toMatchObject({ exitsToday: 3, revenueToday: 36_000 });
    // A vehicle entering now is quoted at the new tariff and hours.
    expect(await sessions.recordVehicleEntry(north, { plateNumber: "B 2468 NEW", vehicleType: "mobil" })).toMatchObject({ ok: true });
    expect(await checkout.getParkingCheckout(north, await idOf(north, "B 2468 NEW"))).toMatchObject({ kind: "active", quote: { rates: { overnight: { amount: 50_000, source: "location" } }, policy: { closeTime: "00:00", source: "location" } } });
    expect(await db.collection("auditLogs").countDocuments({ tenantId: t1, action: "location.settings.update" })).toBe(2);
  }), 60_000);

  test("no operational failure was logged during the flow", () => {
    expect(logSpy).not.toHaveBeenCalled();
  });
});
