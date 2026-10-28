import { MongoServerError, ObjectId } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../errors";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), db: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./authorization", () => ({ requirePermission: mocks.guard }));
vi.mock("../mongodb", () => ({ getDb: mocks.db, getMongoClient: mocks.client }));
import { activePlateIndex, getLocationParkingOverview, listLocationVehicles, parseVehicleListQuery, recordVehicleEntry, resetParkingIndexCacheForTests, vehicleListPageSize } from "./parking-sessions";

// Filter-aware fake: equality, ObjectId/Date equality, $ne, $gte. The
// parkingSessions collection enforces the unique partial index on insert, and
// each transaction tracks its own writes so concurrent transactions roll back
// independently — like MongoDB.
type Row = Record<string, unknown>;
const equal = (a: unknown, b: unknown) => (a instanceof ObjectId && b instanceof ObjectId ? a.equals(b) : a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);
function matches(row: Row, filter: Row) {
  return Object.entries(filter).every(([key, expected]) => {
    if (expected && typeof expected === "object" && !(expected instanceof ObjectId) && !(expected instanceof Date)) {
      const condition = expected as Row;
      if ("$ne" in condition) return !equal(row[key], condition.$ne);
      if ("$gte" in condition) return row[key] instanceof Date && (row[key] as Date) >= (condition.$gte as Date);
      if ("$regex" in condition) return typeof row[key] === "string" && new RegExp(String(condition.$regex)).test(row[key] as string);
    }
    return equal(row[key], expected);
  });
}
let data: Record<string, Row[]>;
let indexes: Row[] | "missing";
let barrier: { waiting: number; release?: () => void; gate?: Promise<void> } | undefined;
let failInsert: string | undefined;
type FakeSession = { writes: { name: string; doc: Row }[]; withTransaction: (work: () => Promise<void>) => Promise<void>; endSession: () => Promise<void> };
// Like MongoDB, an inclusion projection always returns _id unless excluded.
const project = (row: Row, projection?: Row) => (projection ? Object.fromEntries([...new Set(["_id", ...Object.keys(projection)])].filter((key) => key in row && projection[key] !== 0).map((key) => [key, row[key]])) : row);
const fakeDb = { collection: (name: string) => ({
  findOne: async (filter: Row, options: { projection?: Row } = {}) => {
    if (name === "parkingSessions" && barrier) { barrier.waiting++; if (barrier.waiting >= 2) barrier.release?.(); await barrier.gate; }
    const row = (data[name] ??= []).find((item) => matches(item, filter));
    return row ? project(row, options.projection) : null;
  },
  find: (filter: Row, options: { projection?: Row } = {}) => {
    let sortKey: [string, number] | undefined; let limit = Infinity; let skip = 0;
    const cursor = {
      sort: (spec: Row) => { sortKey = Object.entries(spec)[0] as [string, number]; return cursor; },
      limit: (count: number) => { limit = count; return cursor; },
      skip: (count: number) => { skip = count; return cursor; },
      toArray: async () => {
        const rows = (data[name] ??= []).filter((item) => matches(item, filter));
        if (sortKey) { const [key, dir] = sortKey; rows.sort((a, b) => ((a[key] as Date).getTime() - (b[key] as Date).getTime()) * dir); }
        return rows.slice(skip, skip + limit).map((row) => project(row, options.projection));
      },
    };
    return cursor;
  },
  countDocuments: async (filter: Row) => (data[name] ??= []).filter((item) => matches(item, filter)).length,
  // Only the revenue pipeline: [$match, $group { total: { $sum: "$field" } }].
  aggregate: (pipeline: Row[]) => ({ toArray: async () => {
    const rows = (data[name] ??= []).filter((item) => matches(item, pipeline[0].$match as Row));
    const field = String(((pipeline[1].$group as Row).total as Row).$sum).slice(1);
    return rows.length ? [{ _id: null, total: rows.reduce((sum, row) => sum + (row[field] as number), 0) }] : [];
  } }),
  listIndexes: () => ({ toArray: async () => { if (indexes === "missing") throw new MongoServerError({ message: "ns not found", code: 26 }); return indexes; } }),
  insertOne: async (doc: Row, options: { session: FakeSession }) => {
    if (failInsert === name) throw new Error("synthetic secret storage failure");
    if (name === "parkingSessions" && doc.status === "active" && data.parkingSessions.some((row) => row.status === "active" && equal(row.tenantId, doc.tenantId) && equal(row.locationId, doc.locationId) && row.normalizedPlateSnapshot === doc.normalizedPlateSnapshot)) {
      throw new MongoServerError({ message: "E11000 duplicate key", code: 11000, keyPattern: activePlateIndex.key });
    }
    (data[name] ??= []).push(doc); options.session.writes.push({ name, doc });
  },
}) };
function newSession(): FakeSession {
  const session: FakeSession = {
    writes: [],
    withTransaction: async (work) => { try { await work(); } catch (error) { for (const { name, doc } of session.writes) data[name] = data[name].filter((row) => row !== doc); session.writes = []; throw error; } },
    endSession: async () => {},
  };
  return session;
}

const userId = new ObjectId(); const t1 = new ObjectId(); const t2 = new ObjectId(); const l1 = new ObjectId(); const l2 = new ObjectId(); const l3 = new ObjectId();
const ownerContext = (overrides: Row = {}) => Object.freeze({ userId, tenantId: t1, locationId: l1, role: "owner", permissions: ["vehicle.create", "vehicle.read"], ...overrides });
const selection = { tenantId: t1.toHexString(), locationId: l1.toHexString() };
const entry = (raw: Row = {}) => recordVehicleEntry(selection, { plateNumber: " b  1234   xyz ", vehicleType: "mobil", ...raw });
const sessionsOf = (filter: Row = {}) => data.parkingSessions.filter((row) => matches(row, filter));
beforeEach(() => {
  vi.resetAllMocks(); resetParkingIndexCacheForTests(); barrier = undefined; failInsert = undefined;
  mocks.guard.mockResolvedValue(ownerContext());
  mocks.db.mockResolvedValue(fakeDb);
  mocks.client.mockResolvedValue({ startSession: newSession });
  indexes = [{ name: "_id_", key: { _id: 1 } }, { name: activePlateIndex.name, key: activePlateIndex.key, unique: true, partialFilterExpression: { status: "active" } }];
  data = {
    tenants: [{ _id: t1, status: "active", timezone: "Asia/Makassar" }, { _id: t2, status: "active", timezone: "Asia/Jakarta" }],
    locations: [{ _id: l1, tenantId: t1, name: "Lokasi Utara", status: "active" }, { _id: l2, tenantId: t1, name: "Lokasi Barat", status: "active" }, { _id: l3, tenantId: t2, name: "Lokasi Lain", status: "active" }],
    vehicles: [], parkingSessions: [],
  };
});
afterEach(() => vi.useRealTimers());

describe("authorization", () => {
  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)("propagates %s from the fresh permission guard before touching data", async (code) => {
    mocks.guard.mockRejectedValue(new AppError(code));
    await expect(entry()).rejects.toMatchObject({ code });
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("re-derives context with vehicle.create for the given selection on every call", async () => {
    await entry();
    expect(mocks.guard).toHaveBeenCalledWith("vehicle.create", selection);
  });
  it.each(["admin", "staff"])("is Owner-only in this phase: %s is forbidden without writes", async (role) => {
    mocks.guard.mockResolvedValue(ownerContext({ role }));
    await expect(entry()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.db).not.toHaveBeenCalled(); expect(data.parkingSessions).toHaveLength(0);
  });
});

describe("validation and normalization", () => {
  it.each([
    ["plateNumber", { plateNumber: "   " }], ["plateNumber", { plateNumber: undefined }], ["plateNumber", { plateNumber: "B 1234 XYZ 98765" }],
    ["plateNumber", { plateNumber: "B@1234" }], ["plateNumber", { plateNumber: "---" }],
    ["vehicleType", { vehicleType: undefined }], ["vehicleType", { vehicleType: "truk" }],
    ["notes", { notes: "x".repeat(501) }],
  ])("rejects invalid %s %j without writes", async (field, change) => {
    const result = await entry(change);
    expect(result).toMatchObject({ ok: false, reason: "validation" });
    expect((result as { fieldErrors: Record<string, string> }).fieldErrors[field]).toBeTruthy();
    expect(data.parkingSessions).toHaveLength(0);
  });
  it.each([{ entryAt: "2020-01-01T00:00:00Z" }, { status: "completed" }, { tenantId: t2.toHexString() }, { locationId: l3.toHexString() }, { enteredBy: "x" }])("rejects browser-supplied server fields %j", async (change) => {
    expect(await entry(change)).toMatchObject({ ok: false, reason: "validation" });
    expect(data.parkingSessions).toHaveLength(0);
  });
  it("stores a display plate, a matching plate, server time, context scope and actor", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-26T03:15:00Z"));
    const result = await entry({ notes: "  helm dititipkan  " });
    expect(result).toEqual({ ok: true, entry: { plateNumber: "B 1234 XYZ", vehicleType: "mobil", entryAt: "2026-10-26T03:15:00.000Z", timeZone: "Asia/Makassar", locationName: "Lokasi Utara" } });
    const [saved] = data.parkingSessions;
    expect(saved).toMatchObject({ tenantId: t1, locationId: l1, plateNumberSnapshot: "B 1234 XYZ", normalizedPlateSnapshot: "B1234XYZ", vehicleTypeSnapshot: "mobil", notes: "helm dititipkan", status: "active", enteredBy: userId });
    expect(saved.entryAt).toEqual(new Date("2026-10-26T03:15:00Z")); expect(saved.createdAt).toEqual(saved.entryAt); expect(saved.updatedAt).toEqual(saved.entryAt);
    for (const absent of ["exitAt", "transactionId", "completedBy", "canceledAt"]) expect(saved).not.toHaveProperty(absent);
    expect(data.vehicles[0]).toMatchObject({ _id: saved.vehicleId, tenantId: t1, plateNumber: "B 1234 XYZ", normalizedPlate: "B1234XYZ", type: "mobil" });
  });
  it("omits empty notes", async () => {
    await entry({ notes: "   " });
    expect(data.parkingSessions[0]).not.toHaveProperty("notes");
  });
  it("reuses the tenant's existing vehicle record but never another tenant's", async () => {
    const own = new ObjectId(); const foreign = new ObjectId();
    data.vehicles.push({ _id: foreign, tenantId: t2, normalizedPlate: "B1234XYZ", createdAt: new Date(0) }, { _id: own, tenantId: t1, normalizedPlate: "B1234XYZ", createdAt: new Date(1) });
    await entry();
    expect(data.parkingSessions[0].vehicleId).toEqual(own);
    expect(data.vehicles).toHaveLength(2);
  });
});

describe("one active session per plate per location", () => {
  it("rejects a second active entry regardless of spacing or case, writing nothing", async () => {
    expect(await entry()).toMatchObject({ ok: true });
    expect(await entry({ plateNumber: "B1234XYZ", vehicleType: "motor" })).toEqual({ ok: false, reason: "duplicate_active" });
    expect(sessionsOf({ status: "active" })).toHaveLength(1); expect(data.vehicles).toHaveLength(1);
  });
  it("allows a new entry after the previous session is completed (history is kept)", async () => {
    data.parkingSessions.push({ _id: new ObjectId(), tenantId: t1, locationId: l1, normalizedPlateSnapshot: "B1234XYZ", status: "completed", entryAt: new Date(0) });
    expect(await entry()).toMatchObject({ ok: true });
    expect(data.parkingSessions).toHaveLength(2);
  });
  it("isolates by location and tenant: the same plate may be active elsewhere", async () => {
    data.parkingSessions.push(
      { _id: new ObjectId(), tenantId: t1, locationId: l2, normalizedPlateSnapshot: "B1234XYZ", status: "active", entryAt: new Date(0) },
      { _id: new ObjectId(), tenantId: t2, locationId: l3, normalizedPlateSnapshot: "B1234XYZ", status: "active", entryAt: new Date(0) },
    );
    expect(await entry()).toMatchObject({ ok: true });
    expect(sessionsOf({ tenantId: t1, locationId: l1, status: "active" })).toHaveLength(1);
  });
  it("concurrent entries that both pass the pre-check: the unique index lets exactly one win, with no orphan vehicle", async () => {
    let release!: () => void;
    barrier = { waiting: 0, gate: new Promise<void>((done) => { release = done; }) };
    barrier.release = release;
    const results = await Promise.all([entry(), entry({ plateNumber: "B 1234XYZ" })]);
    expect(results.map((result) => result.ok).sort()).toEqual([false, true]);
    expect(results.find((result) => !result.ok)).toEqual({ ok: false, reason: "duplicate_active" });
    expect(sessionsOf({ status: "active", normalizedPlateSnapshot: "B1234XYZ" })).toHaveLength(1);
    expect(data.vehicles).toHaveLength(1);
    expect(data.vehicles[0]._id).toEqual(data.parkingSessions[0].vehicleId);
  });
});

describe("tenant/location status, readiness and failures", () => {
  it.each([
    ["tenant suspended", () => { data.tenants[0].status = "suspended"; }],
    ["tenant archived", () => { data.tenants[0].status = "archived"; }],
    ["location inactive", () => { data.locations[0].status = "inactive"; }],
  ])("refuses the write when the %s inside the transaction (raced the guard)", async (_case, mutate) => {
    mutate();
    await expect(entry()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(data.parkingSessions).toHaveLength(0); expect(data.vehicles).toHaveLength(0);
  });
  it.each([
    ["missing collection", "missing" as const],
    ["missing unique index", [{ name: "_id_", key: { _id: 1 } }]],
    ["non-partial unique index", [{ name: activePlateIndex.name, key: activePlateIndex.key, unique: true }]],
  ])("fails closed when the active-plate index is not ready (%s)", async (_case, value) => {
    indexes = value;
    expect(await entry()).toEqual({ ok: false, reason: "not_ready" });
    expect(data.parkingSessions).toHaveLength(0);
  });
  it.each(["vehicles", "parkingSessions"])("a storage failure inserting %s rolls back and is sanitized", async (name) => {
    failInsert = name;
    const error = await entry().then(() => undefined, (caught: AppError) => caught);
    expect(error).toMatchObject({ code: "SERVICE_UNAVAILABLE" }); expect(error?.message).not.toContain("synthetic");
    expect(data.parkingSessions).toHaveLength(0); expect(data.vehicles).toHaveLength(0);
  });
});

describe("dashboard overview", () => {
  const at = (iso: string, extra: Row = {}) => ({ _id: new ObjectId(), tenantId: t1, locationId: l1, plateNumberSnapshot: `P ${iso.slice(11, 16)}`, normalizedPlateSnapshot: iso, vehicleTypeSnapshot: "motor", entryAt: new Date(iso), status: "active", ...extra });
  it("counts only this tenant/location, today in the tenant time zone, excluding canceled entries", async () => {
    // Asia/Makassar (UTC+8): local midnight of 26 Oct = 2026-10-25T16:00Z.
    data.parkingSessions.push(
      at("2026-10-25T15:59:00Z"), at("2026-10-25T16:01:00Z"), at("2026-10-26T01:00:00Z", { status: "completed" }), at("2026-10-26T02:00:00Z", { status: "canceled" }),
      at("2026-10-26T02:30:00Z", { locationId: l2 }), at("2026-10-26T02:30:00Z", { tenantId: t2, locationId: l3 }),
    );
    const overview = await getLocationParkingOverview(selection, new Date("2026-10-26T03:00:00Z"));
    expect(mocks.guard).toHaveBeenCalledWith("vehicle.read", selection);
    expect(overview.activeCount).toBe(2);
    expect(overview.entriesToday).toBe(2);
    expect(overview.timeZone).toBe("Asia/Makassar");
    expect(overview.recent.map((item) => item.entryAt)).toEqual(["2026-10-26T02:00:00.000Z", "2026-10-26T01:00:00.000Z", "2026-10-25T16:01:00.000Z", "2026-10-25T15:59:00.000Z"]);
  });
  it("limits recent activity to five and exposes no identifiers", async () => {
    for (let hour = 0; hour < 7; hour++) data.parkingSessions.push(at(`2026-10-26T0${hour}:00:00Z`));
    const overview = await getLocationParkingOverview(selection, new Date("2026-10-26T08:00:00Z"));
    expect(overview.recent).toHaveLength(5);
    expect(JSON.stringify(overview)).not.toMatch(/tenantId|locationId|_id|enteredBy/);
  });
  it("propagates guard errors and sanitizes storage failures", async () => {
    mocks.guard.mockRejectedValueOnce(new AppError("FORBIDDEN"));
    await expect(getLocationParkingOverview(selection)).rejects.toMatchObject({ code: "FORBIDDEN" });
    mocks.db.mockRejectedValueOnce(new Error("synthetic secret"));
    await expect(getLocationParkingOverview(selection)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});

describe("vehicle list (read-only)", () => {
  const session = (plate: string, extra: Row = {}) => ({ _id: new ObjectId(), tenantId: t1, locationId: l1, plateNumberSnapshot: plate, normalizedPlateSnapshot: plate.replace(/\s/g, ""), vehicleTypeSnapshot: "motor", entryAt: new Date("2026-10-26T01:00:00Z"), status: "active", ...extra });
  const list = (params: Record<string, string> = {}) => listLocationVehicles(selection, parseVehicleListQuery(params));
  beforeEach(() => {
    data.parkingSessions.push(
      session("B 1234 XYZ", { vehicleTypeSnapshot: "mobil", entryAt: new Date("2026-10-26T03:00:00Z"), notes: "helm" }),
      session("D 1234 AB", { entryAt: new Date("2026-10-26T02:00:00Z") }),
      session("F 9 Z", { status: "completed", entryAt: new Date("2026-10-25T23:00:00Z"), exitAt: new Date("2026-10-26T01:30:00Z") }),
      session("G 1 C", { status: "canceled", entryAt: new Date("2026-10-25T22:00:00Z") }),
      // Same plate in another location and another tenant — must never appear.
      session("B 1234 XYZ", { locationId: l2 }),
      session("B 1234 XYZ", { tenantId: t2, locationId: l3 }),
    );
  });
  it("defaults to active vehicles of the guarded tenant/location, newest first", async () => {
    const result = await list();
    expect(mocks.guard).toHaveBeenCalledWith("vehicle.read", selection);
    expect(result.rows.map((row) => row.plateNumber)).toEqual(["B 1234 XYZ", "D 1234 AB"]);
    expect(result).toMatchObject({ total: 2, page: 1, pageCount: 1, timeZone: "Asia/Makassar", ready: true });
    expect(result.rows[0]).toMatchObject({ vehicleType: "mobil", entryAt: "2026-10-26T03:00:00.000Z", exitAt: null, status: "active", notes: "helm" });
    expect(JSON.stringify(result)).not.toMatch(/tenantId|locationId|enteredBy|vehicleId/);
  });
  it.each([
    [{ status: "completed" }, ["F 9 Z"]],
    [{ status: "all" }, ["B 1234 XYZ", "D 1234 AB", "F 9 Z", "G 1 C"]],
    [{ type: "mobil" }, ["B 1234 XYZ"]],
    [{ type: "motor", status: "all" }, ["D 1234 AB", "F 9 Z", "G 1 C"]],
  ])("filters %j", async (params, plates) => {
    expect((await list(params)).rows.map((row) => row.plateNumber)).toEqual(plates);
  });
  it("returns exit time for completed sessions", async () => {
    expect((await list({ status: "completed" })).rows[0]).toMatchObject({ status: "completed", exitAt: "2026-10-26T01:30:00.000Z" });
  });
  it.each([
    ["1234", ["B 1234 XYZ", "D 1234 AB"]], ["b 12", ["B 1234 XYZ"]], ["  xyz ", ["B 1234 XYZ"]], ["d1234ab", ["D 1234 AB"]],
    [".*", []], ["(", []], ["ZZZ", []],
  ])("partial plate search %j ignores case/spaces and treats regex characters literally", async (q, plates) => {
    expect((await list({ q })).rows.map((row) => row.plateNumber)).toEqual(plates);
  });
  it("paginates on the server and clamps out-of-range pages", async () => {
    data.parkingSessions = Array.from({ length: vehicleListPageSize + 3 }, (_, index) => session(`P ${index}`, { entryAt: new Date(Date.UTC(2026, 9, 26, 0, index)) }));
    const first = await list();
    expect([first.rows.length, first.total, first.pageCount]).toEqual([vehicleListPageSize, vehicleListPageSize + 3, 2]);
    expect(first.rows[0].plateNumber).toBe(`P ${vehicleListPageSize + 2}`);
    const last = await list({ page: "99" });
    expect([last.page, last.rows.length]).toEqual([2, 3]);
  });
  it("ignores tenantId/locationId in the URL: scope comes only from the guard", async () => {
    const query = parseVehicleListQuery({ tenantId: t2.toHexString(), locationId: l3.toHexString(), status: "all" });
    expect(query).toEqual({ status: "all", type: "all", page: 1 });
    const result = await listLocationVehicles(selection, query);
    // Only the 4 sessions of t1/l1; the other-location and other-tenant copies of B 1234 XYZ are excluded.
    expect(result.total).toBe(4);
    expect(result.rows.filter((row) => row.plateNumber === "B 1234 XYZ")).toHaveLength(1);
  });
  it("is Owner-only and propagates guard denials (incl. suspended tenant/inactive location) without reading sessions", async () => {
    mocks.guard.mockResolvedValueOnce(ownerContext({ role: "staff" }));
    await expect(list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const code of ["UNAUTHENTICATED", "FORBIDDEN"] as const) {
      mocks.guard.mockRejectedValueOnce(new AppError(code));
      await expect(list()).rejects.toMatchObject({ code });
    }
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("reports not-ready (and writes nothing) when the P4.3 index/collection is missing", async () => {
    indexes = "missing"; data.parkingSessions = [];
    const result = await list();
    expect(result).toMatchObject({ ready: false, total: 0, rows: [] });
  });
  it("sanitizes storage failures", async () => {
    mocks.db.mockRejectedValueOnce(new Error("synthetic secret"));
    await expect(list()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", message: expect.not.stringContaining("synthetic") });
  });
  it.each([
    [{}, { status: "active", type: "all", page: 1 }],
    [{ q: "  b 12  ", status: "completed", type: "mobil", page: "2" }, { q: "b 12", status: "completed", type: "mobil", page: 2 }],
    [{ status: "deleted", type: "truk", page: "-1" }, { status: "active", type: "all", page: 1 }],
    [{ q: "x".repeat(40) }, { q: "x".repeat(15), status: "active", type: "all", page: 1 }],
  ])("parses URL filters %j safely", (params, expected) => {
    expect(parseVehicleListQuery(params)).toEqual(expected);
  });
});

describe("overview exits", () => {
  it("counts completed sessions that exited today (local day), scoped to the location", async () => {
    data.parkingSessions.push(
      { _id: new ObjectId(), tenantId: t1, locationId: l1, status: "completed", entryAt: new Date("2026-10-25T10:00:00Z"), exitAt: new Date("2026-10-25T16:30:00Z") },
      { _id: new ObjectId(), tenantId: t1, locationId: l1, status: "completed", entryAt: new Date("2026-10-25T10:00:00Z"), exitAt: new Date("2026-10-25T15:30:00Z") },
      { _id: new ObjectId(), tenantId: t1, locationId: l2, status: "completed", entryAt: new Date("2026-10-25T10:00:00Z"), exitAt: new Date("2026-10-26T01:00:00Z") },
    );
    expect((await getLocationParkingOverview(selection, new Date("2026-10-26T03:00:00Z"))).exitsToday).toBe(1);
  });
  it("revenue is completed payments by paymentAt today (local day), this location only — never active sessions", async () => {
    const payment = (extra: Row) => ({ _id: new ObjectId(), tenantId: t1, locationId: l1, status: "completed", amountPaid: 5_000, paymentAt: new Date("2026-10-26T01:00:00Z"), ...extra });
    data.parkingSessions.push({ _id: new ObjectId(), tenantId: t1, locationId: l1, status: "active", entryAt: new Date("2026-10-26T00:00:00Z") });
    data.parkingTransactions = [
      payment({}), payment({ amountPaid: 20_000 }),
      payment({ paymentAt: new Date("2026-10-25T15:59:00Z") }), // yesterday (Asia/Makassar)
      payment({ locationId: l2 }), payment({ tenantId: t2, locationId: l3 }),
      payment({ status: "voided" }), payment({ status: "pending" }),
    ];
    expect((await getLocationParkingOverview(selection, new Date("2026-10-26T03:00:00Z"))).revenueToday).toBe(25_000);
    data.parkingTransactions = [];
    expect((await getLocationParkingOverview(selection, new Date("2026-10-26T03:00:00Z"))).revenueToday).toBe(0);
  });
});
