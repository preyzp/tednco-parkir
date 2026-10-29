import { MongoServerError, ObjectId } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), db: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./authorization", () => ({ requirePermission: mocks.guard }));
vi.mock("../mongodb", () => ({ getDb: mocks.db, getMongoClient: mocks.client }));
import { activePlateIndex, getLocationParkingOverview, listLocationVehicles, parseVehicleListQuery, recordVehicleEntry, resetParkingIndexCacheForTests } from "./parking-sessions";
import { completeParkingCheckout, completedTransactionIndex, getParkingCheckout, resetCheckoutIndexCacheForTests } from "./parking-checkout";
import { activeTariffIndex, resetTariffIndexCacheForTests, updateLocationSettings } from "./location-settings";

// Chained operational flow (Tahap 2A): entry → active list → Menginap checkout
// → completed → settings change, on ONE shared in-memory MongoDB fixture used
// by all three repositories. The fake supports the queries they issue
// (equality incl. ObjectId/Date, $in with null = missing, $ne, $gte, $regex,
// projection, sort/skip/limit, the revenue $match/$group), enforces the three
// unique partial indexes on insert and rolls back each transaction on failure.

type Row = Record<string, unknown>;
const equal = (a: unknown, b: unknown) => (a instanceof ObjectId && b instanceof ObjectId ? a.equals(b) : a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);
function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (expected && typeof expected === "object" && !(expected instanceof ObjectId) && !(expected instanceof Date)) {
      const condition = expected as Row;
      if ("$in" in condition) return (condition.$in as unknown[]).some((value) => (value === null ? row[key] === undefined || row[key] === null : equal(row[key], value)));
      if ("$ne" in condition) return !equal(row[key], condition.$ne);
      if ("$gte" in condition) return row[key] instanceof Date && (row[key] as Date) >= (condition.$gte as Date);
      if ("$regex" in condition) return typeof row[key] === "string" && new RegExp(String(condition.$regex)).test(row[key] as string);
      throw new Error(`unsupported filter on ${key}`);
    }
    return equal(row[key], expected);
  });
}
const project = (row: Row, projection?: Row) => (projection ? Object.fromEntries([...new Set(["_id", ...Object.keys(projection)])].filter((key) => key in row && projection[key] !== 0).map((key) => [key, row[key]])) : { ...row });
const sortValue = (value: unknown) => (value instanceof Date ? value.getTime() : value instanceof ObjectId ? value.toHexString() : (value as number | string));
type Write = { kind: "insert"; name: string; doc: Row } | { kind: "update"; row: Row; before: Row };
type FakeSession = { writes: Write[]; withTransaction: (work: () => Promise<void>, options?: unknown) => Promise<void>; endSession: () => Promise<void> };

let data: Record<string, Row[]>;
// The three unique partial indexes: [partial status, key fields].
const uniqueRules: Record<string, [string, string[]]> = {
  parkingSessions: ["active", ["tenantId", "locationId", "normalizedPlateSnapshot"]],
  parkingTransactions: ["completed", ["tenantId", "parkingSessionId"]],
  tariffs: ["active", ["tenantId", "locationId", "vehicleType", "tariffType"]],
};
const uniqueViolation = (name: string, doc: Row) => {
  const rule = uniqueRules[name];
  if (!rule || doc.status !== rule[0]) return false;
  return (data[name] ??= []).some((row) => row.status === rule[0] && rule[1].every((key) => equal(row[key], doc[key])));
};
const indexes: Record<string, Row[]> = {
  parkingSessions: [{ name: activePlateIndex.name, key: activePlateIndex.key, unique: true, partialFilterExpression: activePlateIndex.partialFilterExpression }],
  parkingTransactions: [{ name: completedTransactionIndex.name, key: completedTransactionIndex.key, unique: true, partialFilterExpression: completedTransactionIndex.partialFilterExpression }],
  tariffs: [{ name: activeTariffIndex.name, key: activeTariffIndex.key, unique: true, partialFilterExpression: activeTariffIndex.partialFilterExpression }],
};
const fakeDb = { collection: (name: string) => ({
  findOne: async (filter: Row, options: { projection?: Row } = {}) => {
    const row = (data[name] ??= []).find((item) => matches(item, filter));
    return row ? project(row, options.projection) : null;
  },
  find: (filter: Row, options: { projection?: Row } = {}) => {
    let sortSpec: [string, number][] = []; let skip = 0; let limit = Infinity;
    const cursor = {
      sort: (spec: Row) => { sortSpec = Object.entries(spec) as [string, number][]; return cursor; },
      skip: (count: number) => { skip = count; return cursor; },
      limit: (count: number) => { limit = count; return cursor; },
      toArray: async () => {
        const rows = (data[name] ??= []).filter((item) => matches(item, filter));
        rows.sort((a, b) => { for (const [key, dir] of sortSpec) { const x = sortValue(a[key]), y = sortValue(b[key]); if (x !== y) return (x < y ? -1 : 1) * dir; } return 0; });
        return rows.slice(skip, skip + limit).map((row) => project(row, options.projection));
      },
    };
    return cursor;
  },
  countDocuments: async (filter: Row) => (data[name] ??= []).filter((item) => matches(item, filter)).length,
  aggregate: (pipeline: Row[]) => ({ toArray: async () => {
    const rows = (data[name] ??= []).filter((item) => matches(item, pipeline[0].$match as Row));
    const field = String(((pipeline[1].$group as Row).total as Row).$sum).slice(1);
    return rows.length ? [{ _id: null, total: rows.reduce((sum, row) => sum + (row[field] as number), 0) }] : [];
  } }),
  listIndexes: () => ({ toArray: async () => { if (!indexes[name]) throw new MongoServerError({ message: "ns not found", code: 26 }); return indexes[name]; } }),
  insertOne: async (doc: Row, options: { session: FakeSession }) => {
    if (uniqueViolation(name, doc)) throw new MongoServerError({ message: "E11000 duplicate key", code: 11000 });
    (data[name] ??= []).push(doc); options.session.writes.push({ kind: "insert", name, doc });
  },
  updateOne: async (filter: Row, update: { $set: Row }, options: { session: FakeSession }) => {
    const row = (data[name] ??= []).find((item) => matches(item, filter));
    if (!row) return { matchedCount: 0, modifiedCount: 0 };
    options.session.writes.push({ kind: "update", row, before: { ...row } });
    Object.assign(row, update.$set);
    return { matchedCount: 1, modifiedCount: 1 };
  },
}) };
function newSession(): FakeSession {
  const session: FakeSession = {
    writes: [],
    withTransaction: async (work) => {
      try { await work(); } catch (error) {
        for (const write of session.writes.reverse()) {
          if (write.kind === "insert") data[write.name] = data[write.name].filter((row) => row !== write.doc);
          else { for (const key of Object.keys(write.row)) delete write.row[key]; Object.assign(write.row, write.before); }
        }
        session.writes = [];
        throw error;
      }
    },
    endSession: async () => {},
  };
  return session;
}

const userId = new ObjectId();
const t1 = new ObjectId(); const t2 = new ObjectId(); const l1 = new ObjectId(); const l2 = new ObjectId(); const l3 = new ObjectId();
const sel = (tenantId: ObjectId, locationId: ObjectId) => ({ tenantId: tenantId.toHexString(), locationId: locationId.toHexString() });
const north = sel(t1, l1); const west = sel(t1, l2); const foreign = sel(t2, l3);
const keyA = "6f1c1d7e-2b3a-4c5d-8e9f-0a1b2c3d4e5f"; const keyB = "7a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d";
// Scenario rates (test fixtures only, not production tariffs).
const firstSettings = { tariffs: { motor: { regular: 3_000, overnight: 7_000 }, mobil: { regular: 6_000, overnight: 12_000 } }, operatingHours: { openTime: "06:00", closeTime: "22:00" } };
const laterSettings = { tariffs: { motor: { regular: 4_000, overnight: 9_000 }, mobil: { regular: 8_000, overnight: 50_000 } }, operatingHours: { openTime: "05:00", closeTime: "00:00" } };
const at = (iso: string) => vi.setSystemTime(new Date(iso));
const sessionsOf = (filter: Row) => data.parkingSessions.filter((row) => matches(row, filter));
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  resetParkingIndexCacheForTests(); resetCheckoutIndexCacheForTests(); resetTariffIndexCacheForTests();
  vi.useFakeTimers({ toFake: ["Date"] });
  // The guard derives the context from the (validated) selection, like the real one for an Owner.
  mocks.guard.mockImplementation(async (_permission: string, selection: { tenantId: string; locationId: string }) => Object.freeze({
    userId, tenantId: new ObjectId(selection.tenantId), locationId: new ObjectId(selection.locationId), role: "owner",
    permissions: ["vehicle.create", "vehicle.read", "parking.checkout", "tariff.manage", "locations.manage"],
  }));
  mocks.db.mockResolvedValue(fakeDb);
  mocks.client.mockResolvedValue({ startSession: newSession });
  data = {
    tenants: [{ _id: t1, status: "active", timezone: "Asia/Jakarta" }, { _id: t2, status: "active", timezone: "Asia/Jakarta" }],
    locations: [
      { _id: l1, tenantId: t1, name: "Lokasi Utara", status: "active", timezone: "Asia/Jakarta" },
      { _id: l2, tenantId: t1, name: "Lokasi Barat", status: "active", timezone: "Asia/Jakarta" },
      { _id: l3, tenantId: t2, name: "Lokasi Lain", status: "active", timezone: "Asia/Jakarta" },
    ],
    vehicles: [], parkingSessions: [], parkingTransactions: [], tariffs: [], auditLogs: [],
  };
  logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); logSpy.mockRestore(); });

describe("chained parking flow on one shared fixture", () => {
  it("entry → active list → Menginap checkout at the location's tariff and hours → completed → settings change leaves the transaction intact", async () => {
    // 0. The Owner configures the north location (revision 0 → 1).
    at("2026-10-26T01:00:00Z");
    expect(await updateLocationSettings(north, { ...firstSettings, expectedRevision: 0 })).toMatchObject({ ok: true, settings: { revision: 1 } });

    // 1. Entry at 27 Oct 10:00 WIB. The same plate may be active at another location/tenant; not twice here.
    at("2026-10-27T03:00:00Z");
    expect(await recordVehicleEntry(north, { plateNumber: " b  1234   xyz ", vehicleType: "mobil" })).toMatchObject({ ok: true, entry: { plateNumber: "B 1234 XYZ", vehicleType: "mobil", locationName: "Lokasi Utara" } });
    expect(await recordVehicleEntry(west, { plateNumber: "B 1234 XYZ", vehicleType: "mobil" })).toMatchObject({ ok: true });
    expect(await recordVehicleEntry(foreign, { plateNumber: "B 1234 XYZ", vehicleType: "mobil" })).toMatchObject({ ok: true });
    expect(await recordVehicleEntry(north, { plateNumber: "B1234XYZ", vehicleType: "mobil" })).toEqual({ ok: false, reason: "duplicate_active" });
    expect(sessionsOf({ status: "active" })).toHaveLength(3);

    // 2. It appears in the north active list, once, and only there.
    const activeNorth = await listLocationVehicles(north, parseVehicleListQuery({}));
    expect(activeNorth).toMatchObject({ total: 1, ready: true, timeZone: "Asia/Jakarta" });
    expect(activeNorth.rows).toEqual([expect.objectContaining({ plateNumber: "B 1234 XYZ", vehicleType: "mobil", status: "active", exitAt: null })]);
    const sessionId = activeNorth.rows[0].id;
    expect(data.parkingSessions.find((row) => equal(row._id, new ObjectId(sessionId)))).toMatchObject({ tenantId: t1, locationId: l1 });
    // Isolation: another location of the same tenant cannot quote or pay this session.
    expect(await getParkingCheckout(west, sessionId)).toEqual({ kind: "not_found" });

    // 3. Quote at 29 Oct 08:00 WIB: the 22:00 closings of 27 and 28 Oct were passed → 2 nights, location rates/hours.
    const exitTime = new Date("2026-10-29T01:00:00Z");
    at(exitTime.toISOString());
    const view = await getParkingCheckout(north, sessionId, exitTime);
    expect(view).toMatchObject({ kind: "active", quote: {
      nights: 2, suggestion: { tariffType: "overnight", nightCount: 2 },
      rates: { regular: { amount: 6_000, source: "location" }, overnight: { amount: 12_000, source: "location" } },
      policy: { openTime: "06:00", closeTime: "22:00", source: "location" },
    } });

    // 4. The Owner explicitly confirms Menginap 2 malam; the server recomputes 2 × 12.000.
    expect(await completeParkingCheckout(north, { sessionId, tariffType: "overnight", nightCount: 2, paymentMethod: "cash", expectedTotal: 20_000, idempotencyKey: keyA })).toEqual({ ok: false, reason: "price_changed", totalAmount: 24_000 });
    expect(data.parkingTransactions).toHaveLength(0);
    const paid = await completeParkingCheckout(north, { sessionId, tariffType: "overnight", nightCount: 2, paymentMethod: "cash", expectedTotal: 24_000, idempotencyKey: keyA });
    expect(paid).toMatchObject({ ok: true, replayed: false, receipt: { plateNumber: "B 1234 XYZ", tariffType: "overnight", nightCount: 2, amountPerUnit: 12_000, totalAmount: 24_000, paymentMethod: "cash", exitAt: exitTime.toISOString() } });

    // 5. Completed: one transaction, session closed with a link to it, one audit.
    expect(data.parkingTransactions).toHaveLength(1);
    const transaction = data.parkingTransactions[0];
    expect(transaction).toMatchObject({
      tenantId: t1, locationId: l1, status: "completed", paymentMethod: "cash", amountDue: 24_000, amountPaid: 24_000, idempotencyKey: keyA,
      tariffSnapshot: { tariffType: "overnight", amountPerUnit: 12_000, nightCount: 2, totalAmount: 24_000, currency: "IDR" },
      policySnapshot: { openTime: "06:00", closeTime: "22:00", source: "location" },
    });
    expect(equal(transaction.parkingSessionId, new ObjectId(sessionId))).toBe(true);
    const session = data.parkingSessions.find((row) => equal(row._id, new ObjectId(sessionId)))!;
    expect(session).toMatchObject({ status: "completed", exitAt: exitTime });
    expect(equal(session.transactionId, transaction._id)).toBe(true);
    expect(data.auditLogs.filter((row) => row.action === "parking.checkout")).toHaveLength(1);
    const frozen = structuredClone({ ...transaction, _id: String(transaction._id), tenantId: String(transaction.tenantId), locationId: String(transaction.locationId), parkingSessionId: String(transaction.parkingSessionId), processedBy: String(transaction.processedBy) });

    // 6. No double payment: a replay returns the same result; another key/tariff cannot pay again.
    expect(await completeParkingCheckout(north, { sessionId, tariffType: "overnight", nightCount: 2, paymentMethod: "cash", expectedTotal: 24_000, idempotencyKey: keyA })).toEqual({ ...paid, replayed: true });
    expect(await completeParkingCheckout(north, { sessionId, tariffType: "regular", paymentMethod: "cash", expectedTotal: 6_000, idempotencyKey: keyB })).toEqual({ ok: false, reason: "already_completed" });
    expect(data.parkingTransactions).toHaveLength(1);

    // 7. No active session left at north; history kept; the other locations are untouched.
    expect(await listLocationVehicles(north, parseVehicleListQuery({}))).toMatchObject({ total: 0, rows: [] });
    expect((await listLocationVehicles(north, parseVehicleListQuery({ status: "completed" }))).rows).toEqual([expect.objectContaining({ id: sessionId, status: "completed", exitAt: exitTime.toISOString() })]);
    expect(sessionsOf({ tenantId: t1, locationId: l1, status: "active" })).toHaveLength(0);
    expect((await listLocationVehicles(west, parseVehicleListQuery({}))).rows).toEqual([expect.objectContaining({ plateNumber: "B 1234 XYZ", status: "active" })]);
    expect((await listLocationVehicles(foreign, parseVehicleListQuery({}))).total).toBe(1);
    // Server-computed revenue on the dashboard equals the transaction total.
    expect(await getLocationParkingOverview(north, exitTime)).toMatchObject({ activeCount: 0, exitsToday: 1, revenueToday: 24_000 });
    expect(await getLocationParkingOverview(west, exitTime)).toMatchObject({ activeCount: 1, revenueToday: 0 });

    // 8. Settings change after completion (revision 1 → 2): tariffs and hours differ now.
    at("2026-10-29T02:00:00Z");
    expect(await updateLocationSettings(north, { ...laterSettings, expectedRevision: 1 })).toMatchObject({ ok: true, settings: { revision: 2, operatingHours: { closeTime: "00:00", source: "location" } } });
    expect(data.tariffs.filter((row) => equal(row.locationId, l1) && row.status === "active")).toHaveLength(4);

    // 9. The completed transaction, its snapshots, the session and the revenue are unchanged.
    const after = data.parkingTransactions[0];
    expect({ ...after, _id: String(after._id), tenantId: String(after.tenantId), locationId: String(after.locationId), parkingSessionId: String(after.parkingSessionId), processedBy: String(after.processedBy) }).toEqual(frozen);
    expect(await getParkingCheckout(north, sessionId)).toEqual({ kind: "completed", receipt: paid.ok ? paid.receipt : null });
    expect(data.parkingSessions.find((row) => equal(row._id, new ObjectId(sessionId)))).toMatchObject({ status: "completed", exitAt: exitTime });
    expect(await getLocationParkingOverview(north, new Date("2026-10-29T02:00:00Z"))).toMatchObject({ revenueToday: 24_000 });

    // The still-active vehicle elsewhere is unaffected (west has no own settings: default policy).
    expect(await getParkingCheckout(west, (await listLocationVehicles(west, parseVehicleListQuery({}))).rows[0].id, new Date("2026-10-29T02:00:00Z"))).toMatchObject({ kind: "active", quote: { policy: { source: "default" }, rates: { overnight: { source: "default" } } } });
    expect(logSpy).not.toHaveBeenCalled(); // no operational failure anywhere in the flow
  });

  it("a vehicle that enters after the change is charged at the new tariff and hours; the earlier transaction keeps its own", async () => {
    at("2026-10-26T01:00:00Z");
    await updateLocationSettings(north, { ...firstSettings, expectedRevision: 0 });
    at("2026-10-27T03:00:00Z");
    await recordVehicleEntry(north, { plateNumber: "D 1 AA", vehicleType: "mobil" });
    const first = (await listLocationVehicles(north, parseVehicleListQuery({}))).rows[0].id;
    at("2026-10-28T01:00:00Z"); // 1 closing (27 Oct 22:00) passed
    expect(await completeParkingCheckout(north, { sessionId: first, tariffType: "overnight", nightCount: 1, paymentMethod: "cash", expectedTotal: 12_000, idempotencyKey: keyA })).toMatchObject({ ok: true, receipt: { totalAmount: 12_000 } });

    at("2026-10-28T02:00:00Z");
    await updateLocationSettings(north, { ...laterSettings, expectedRevision: 1 });
    // Same plate may enter again after checkout (history kept).
    expect(await recordVehicleEntry(north, { plateNumber: "D 1 AA", vehicleType: "mobil" })).toMatchObject({ ok: true });
    const second = (await listLocationVehicles(north, parseVehicleListQuery({}))).rows[0].id;
    expect(second).not.toBe(first);
    const exitTime = new Date("2026-10-29T18:00:00Z"); // 30 Oct 01:00 WIB: the 00:00 closings of 29 and 30 Oct passed
    at(exitTime.toISOString());
    expect(await getParkingCheckout(north, second, exitTime)).toMatchObject({ kind: "active", quote: { nights: 2, rates: { overnight: { amount: 50_000 } }, policy: { closeTime: "00:00" } } });
    expect(await completeParkingCheckout(north, { sessionId: second, tariffType: "overnight", nightCount: 2, paymentMethod: "cash", expectedTotal: 100_000, idempotencyKey: keyB })).toMatchObject({ ok: true, receipt: { totalAmount: 100_000 } });

    expect(data.parkingTransactions.map((row) => [(row.tariffSnapshot as Row).totalAmount, (row.policySnapshot as Row).closeTime])).toEqual([[12_000, "22:00"], [100_000, "00:00"]]);
    expect(sessionsOf({ tenantId: t1, locationId: l1, status: "active" })).toHaveLength(0);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
