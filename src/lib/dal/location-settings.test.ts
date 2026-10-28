import { MongoNetworkError, MongoOperationTimeoutError, MongoServerError, ObjectId } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../errors";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), db: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./authorization", () => ({ requirePermission: mocks.guard }));
vi.mock("../mongodb", () => ({ getDb: mocks.db, getMongoClient: mocks.client }));
import { activeTariffIndex, getLocationSettings, resetTariffIndexCacheForTests, updateLocationSettings } from "./location-settings";
import { completeParkingCheckout, completedTransactionIndex, resetCheckoutIndexCacheForTests } from "./parking-checkout";

// Shared filter-aware fake (equality, ObjectId/Date, $in incl. null = missing)
// used by both repositories: per-transaction rollback of inserts and updates,
// the unique partial indexes on active tariffs and completed payments, an
// optional barrier so two transactions read before either writes, and hooks.
type Row = Record<string, unknown>;
const equal = (a: unknown, b: unknown) => (a instanceof ObjectId && b instanceof ObjectId ? a.equals(b) : a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);
const matches = (row: Row, filter: Row) => Object.entries(filter).every(([key, expected]) => {
  if (expected && typeof expected === "object" && "$in" in (expected as Row)) return ((expected as Row).$in as unknown[]).some((value) => (value === null ? row[key] === undefined || row[key] === null : equal(row[key], value)));
  return equal(row[key], expected);
});
const project = (row: Row, projection?: Row) => (projection ? Object.fromEntries([...new Set(["_id", ...Object.keys(projection)])].filter((key) => key in row).map((key) => [key, row[key]])) : row);
type Write = { kind: "insert"; name: string; doc: Row } | { kind: "update"; row: Row; before: Row };
type FakeSession = { writes: Write[]; withTransaction: (work: () => Promise<void>, options?: unknown) => Promise<void>; endSession: () => Promise<void> };
// P4.7: a failing index check and a commit that fails without committing.
let indexError: Error | undefined;
let commitError: Error | undefined;
let transactionOptions: unknown[] = [];
let data: Record<string, Row[]>;
let indexes: Record<string, Row[]>;
let barrier: { collection: string; waiting: number; release?: () => void; gate?: Promise<void> } | undefined;
let failInsert: string | undefined;
let loseCommitReply = false;
let afterTariffRead: (() => Promise<void>) | undefined;
const fakeDb = { collection: (name: string) => ({
  findOne: async (filter: Row, options: { projection?: Row; session?: FakeSession } = {}) => {
    if (barrier && name === barrier.collection && options.session) { barrier.waiting++; if (barrier.waiting >= 2) barrier.release?.(); await barrier.gate; }
    const row = (data[name] ??= []).find((item) => matches(item, filter));
    return row ? { ...project(row, options.projection) } : null;
  },
  find: (filter: Row, options: { projection?: Row; session?: FakeSession } = {}) => {
    let limit = Infinity;
    const cursor = { limit: (count: number) => { limit = count; return cursor; }, toArray: async () => {
      const rows = (data[name] ??= []).filter((item) => matches(item, filter)).slice(0, limit).map((row) => ({ ...project(row, options.projection) }));
      // Snapshot model: rows already read stay as read even if a hook commits changes.
      if (name === "tariffs" && options.session && afterTariffRead) { const hook = afterTariffRead; afterTariffRead = undefined; await hook(); }
      return rows;
    } };
    return cursor;
  },
  countDocuments: async (filter: Row) => (data[name] ??= []).filter((item) => matches(item, filter)).length,
  listIndexes: () => ({ toArray: async () => { if (indexError) throw indexError; if (!indexes[name]) throw new MongoServerError({ message: "ns not found", code: 26 }); return indexes[name]; } }),
  insertOne: async (doc: Row, options: { session: FakeSession }) => {
    if (failInsert === name) throw new Error("synthetic secret storage failure");
    const rows = (data[name] ??= []);
    if (name === "tariffs" && doc.status === "active" && rows.some((row) => row.status === "active" && ["tenantId", "locationId", "vehicleType", "tariffType"].every((key) => equal(row[key], doc[key])))) throw new MongoServerError({ message: "E11000 duplicate key", code: 11000, keyPattern: activeTariffIndex.key });
    if (name === "parkingTransactions" && doc.status === "completed" && rows.some((row) => row.status === "completed" && equal(row.parkingSessionId, doc.parkingSessionId))) throw new MongoServerError({ message: "E11000 duplicate key", code: 11000 });
    rows.push(doc); options.session.writes.push({ kind: "insert", name, doc });
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
    withTransaction: async (work, options) => {
      transactionOptions.push(options);
      const rollback = () => {
        for (const write of session.writes.reverse()) {
          if (write.kind === "insert") data[write.name] = data[write.name].filter((row) => row !== write.doc);
          else { for (const key of Object.keys(write.row)) delete write.row[key]; Object.assign(write.row, write.before); }
        }
        session.writes = [];
      };
      try { await work(); } catch (error) { rollback(); throw error; }
      if (commitError) { rollback(); throw commitError; }
      if (loseCommitReply) throw new MongoServerError({ message: "connection lost after commit", errorLabels: ["UnknownTransactionCommitResult"] });
    },
    endSession: async () => {},
  };
  return session;
}

const userId = new ObjectId(); const t1 = new ObjectId(); const t2 = new ObjectId(); const l1 = new ObjectId(); const l2 = new ObjectId(); const l3 = new ObjectId();
const s1 = new ObjectId(); const s2 = new ObjectId();
const ownerContext = (overrides: Row = {}) => Object.freeze({ userId, tenantId: t1, locationId: l1, role: "owner", permissions: ["tariff.manage", "locations.manage", "parking.checkout"], ...overrides });
const selection = { tenantId: t1.toHexString(), locationId: l1.toHexString() };
const input = (overrides: Row = {}) => ({
  tariffs: { motor: { regular: 2_000, overnight: 4_000 }, mobil: { regular: 6_000, overnight: 12_000 } },
  operatingHours: { openTime: "06:00", closeTime: "22:00" }, expectedRevision: 0, ...overrides,
});
const save = (overrides: Row = {}) => updateLocationSettings(selection, input(overrides));
const location = () => data.locations.find((row) => equal(row._id, l1))!;
const activeTariffsOf = (locationId = l1) => data.tariffs.filter((row) => equal(row.locationId, locationId) && row.status === "active");
const nothingWritten = () => { expect(data.tariffs.filter((row) => equal(row.locationId, l1))).toHaveLength(0); expect(data.auditLogs).toHaveLength(0); expect(location().operatingHours).toBeUndefined(); expect(location().settingsRevision).toBeUndefined(); };
const allIndexes = () => ({
  tariffs: [{ name: "_id_", key: { _id: 1 } }, { name: activeTariffIndex.name, key: activeTariffIndex.key, unique: true, partialFilterExpression: { status: "active" } }],
  parkingTransactions: [{ name: completedTransactionIndex.name, key: completedTransactionIndex.key, unique: true, partialFilterExpression: { status: "completed" } }],
});
const session = (id: ObjectId) => ({ _id: id, tenantId: t1, locationId: l1, plateNumberSnapshot: "B 1", normalizedPlateSnapshot: `B${id.toHexString()}`, vehicleTypeSnapshot: "mobil", entryAt: new Date("2026-10-27T03:00:00Z"), status: "active" });
const checkout = (id: ObjectId, raw: Row) => completeParkingCheckout(selection, { sessionId: id.toHexString(), paymentMethod: "cash", idempotencyKey: crypto.randomUUID(), ...raw });

beforeEach(() => {
  vi.resetAllMocks(); resetTariffIndexCacheForTests(); resetCheckoutIndexCacheForTests();
  barrier = undefined; failInsert = undefined; loseCommitReply = false; afterTariffRead = undefined;
  indexError = undefined; commitError = undefined; transactionOptions = [];
  mocks.guard.mockResolvedValue(ownerContext());
  mocks.db.mockResolvedValue(fakeDb);
  mocks.client.mockResolvedValue({ startSession: newSession });
  indexes = allIndexes();
  data = {
    tenants: [{ _id: t1, status: "active", timezone: "Asia/Jakarta" }, { _id: t2, status: "active", timezone: "Asia/Jakarta" }],
    locations: [{ _id: l1, tenantId: t1, name: "Lokasi Utara", status: "active", timezone: "Asia/Jakarta" }, { _id: l2, tenantId: t1, name: "Lokasi Barat", status: "active" }, { _id: l3, tenantId: t2, name: "Lokasi Lain", status: "active" }],
    tariffs: [
      { _id: new ObjectId(), tenantId: t1, locationId: l2, vehicleType: "mobil", tariffType: "regular", amount: 9_999, status: "active" },
      { _id: new ObjectId(), tenantId: t2, locationId: l3, vehicleType: "mobil", tariffType: "regular", amount: 8_888, status: "active" },
    ],
    parkingSessions: [session(s1), session(s2)], parkingTransactions: [], auditLogs: [],
  };
});
afterEach(() => vi.useRealTimers());

describe("authorization and isolation", () => {
  it("re-derives the context with tariff.manage on every call", async () => {
    await getLocationSettings(selection); await save();
    expect(mocks.guard).toHaveBeenNthCalledWith(1, "tariff.manage", selection);
    expect(mocks.guard).toHaveBeenNthCalledWith(2, "tariff.manage", selection);
  });
  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)("propagates %s before touching data", async (code) => {
    mocks.guard.mockRejectedValue(new AppError(code));
    await expect(save()).rejects.toMatchObject({ code }); await expect(getLocationSettings(selection)).rejects.toMatchObject({ code });
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each([["admin", { role: "admin" }], ["staff", { role: "staff" }], ["owner without locations.manage", { permissions: ["tariff.manage"] }]])("%s is forbidden without writes", async (_label, overrides) => {
    mocks.guard.mockResolvedValue(ownerContext(overrides));
    await expect(save()).rejects.toMatchObject({ code: "FORBIDDEN" }); await expect(getLocationSettings(selection)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.db).not.toHaveBeenCalled(); nothingWritten();
  });
  it.each([["suspended tenant", () => { data.tenants[0].status = "suspended"; }], ["inactive location", () => { location().status = "inactive"; }]])("%s cannot be changed", async (_label, change) => {
    change();
    await expect(save()).rejects.toMatchObject({ code: "FORBIDDEN" }); await expect(getLocationSettings(selection)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(data.tariffs.filter((row) => equal(row.locationId, l1))).toHaveLength(0); expect(data.auditLogs).toHaveLength(0);
  });
  it("writes only the guarded location; other locations and tenants are untouched", async () => {
    const others = structuredClone(data.tariffs);
    expect(await save()).toMatchObject({ ok: true });
    expect(data.tariffs.filter((row) => !equal(row.locationId, l1))).toEqual(others);
    expect(data.tariffs.filter((row) => equal(row.locationId, l1)).every((row) => equal(row.tenantId, t1))).toBe(true);
    expect(data.locations.filter((row) => !equal(row._id, l1)).every((row) => row.operatingHours === undefined)).toBe(true);
  });
});

describe("validation", () => {
  it.each([
    [{ tenantId: t2.toHexString() }], [{ locationId: l3.toHexString() }], [{ settingsRevision: 5 }],
    [{ tariffs: { motor: { regular: 0, overnight: 1 }, mobil: { regular: 1, overnight: 1 } } }],
    [{ tariffs: { motor: { regular: 1, overnight: 10_000_001 }, mobil: { regular: 1, overnight: 1 } } }],
    [{ tariffs: { motor: { regular: 1, overnight: 1 } } }],
    [{ operatingHours: { openTime: "05:00", closeTime: "05:00" } }], [{ operatingHours: { openTime: "5:00", closeTime: "22:00" } }],
    [{ expectedRevision: -1 }], [{ expectedRevision: undefined }],
  ])("rejects %j without writes", async (change) => {
    expect(await save(change)).toMatchObject({ ok: false, reason: "validation" });
    nothingWritten();
  });
  it("reports field errors by path", async () => {
    const result = await save({ operatingHours: { openTime: "05:00", closeTime: "05:00" } });
    expect(result).toMatchObject({ fieldErrors: { "operatingHours.closeTime": "Jam tutup harus berbeda dari jam buka." } });
  });
});

describe("defaults for older locations", () => {
  it("shows default tariffs and hours, revision 0 and the active vehicle count", async () => {
    expect(await getLocationSettings(selection)).toEqual({
      locationName: "Lokasi Utara", revision: 0, tariffsConsistent: true, activeVehicleCount: 2,
      tariffs: { motor: { regular: { amount: 5_000, source: "default" }, overnight: { amount: 10_000, source: "default" } }, mobil: { regular: { amount: 5_000, source: "default" }, overnight: { amount: 10_000, source: "default" } } },
      operatingHours: { openTime: "05:00", closeTime: "00:00", source: "default" },
    });
  });
  it("mixes a configured tariff with defaults and flags inconsistent stored data", async () => {
    data.tariffs.push({ _id: new ObjectId(), tenantId: t1, locationId: l1, vehicleType: "motor", tariffType: "regular", amount: 3_000, status: "active" });
    expect(await getLocationSettings(selection)).toMatchObject({ tariffsConsistent: true, tariffs: { motor: { regular: { amount: 3_000, source: "location" }, overnight: { source: "default" } } } });
    data.tariffs.push({ _id: new ObjectId(), tenantId: t1, locationId: l1, vehicleType: "motor", tariffType: "regular", amount: 3_500, status: "active" });
    expect(await getLocationSettings(selection)).toMatchObject({ tariffsConsistent: false, tariffs: { motor: { regular: { amount: 5_000, source: "default" } } } });
  });
});

describe("atomic save", () => {
  it("stores daily hours + revision, exactly four active tariffs and one audit with before/after", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-28T03:00:00Z"), toFake: ["Date"] });
    const result = await save();
    expect(result).toMatchObject({ ok: true, settings: { revision: 1, tariffsConsistent: true, operatingHours: { openTime: "06:00", closeTime: "22:00", source: "location" }, tariffs: { motor: { regular: { amount: 2_000, source: "location" } }, mobil: { overnight: { amount: 12_000, source: "location" } } } } });
    expect(location()).toMatchObject({ operatingHours: { mode: "daily", openTime: "06:00", closeTime: "22:00" }, settingsRevision: 1 });
    const tariffs = activeTariffsOf();
    expect(tariffs).toHaveLength(4);
    expect(tariffs.map((row) => `${row.vehicleType}.${row.tariffType}=${row.amount}`).sort()).toEqual(["mobil.overnight=12000", "mobil.regular=6000", "motor.overnight=4000", "motor.regular=2000"]);
    expect(tariffs.every((row) => row.currency === "IDR" && equal(row.updatedBy, userId) && equal(row.tenantId, t1))).toBe(true);
    expect(data.auditLogs).toHaveLength(1);
    expect(data.auditLogs[0]).toMatchObject({
      tenantId: t1, locationId: l1, actorId: userId, action: "location.settings.update", entityType: "location", entityId: l1,
      before: { revision: 0, operatingHours: null, tariffs: { motor: { regular: null, overnight: null }, mobil: { regular: null, overnight: null } } },
      after: { revision: 1, operatingHours: { openTime: "06:00", closeTime: "22:00" }, tariffs: { motor: { regular: 2_000, overnight: 4_000 }, mobil: { regular: 6_000, overnight: 12_000 } } },
    });
  });
  it("a second save updates the same four documents in place (no duplicates) and audits the previous values", async () => {
    await save();
    const ids = activeTariffsOf().map((row) => String(row._id)).sort();
    expect(await save({ expectedRevision: 1, tariffs: { motor: { regular: 2_500, overnight: 4_000 }, mobil: { regular: 6_000, overnight: 15_000 } }, operatingHours: { openTime: "18:00", closeTime: "02:00" } })).toMatchObject({ ok: true, settings: { revision: 2 } });
    expect(activeTariffsOf().map((row) => String(row._id)).sort()).toEqual(ids);
    expect(activeTariffsOf().map((row) => `${row.vehicleType}.${row.tariffType}=${row.amount}`).sort()).toEqual(["mobil.overnight=15000", "mobil.regular=6000", "motor.overnight=4000", "motor.regular=2500"]);
    expect(data.tariffs.filter((row) => equal(row.locationId, l1))).toHaveLength(4);
    expect(data.auditLogs).toHaveLength(2);
    expect(data.auditLogs[1]).toMatchObject({ before: { revision: 1, operatingHours: { openTime: "06:00", closeTime: "22:00" }, tariffs: { motor: { regular: 2_000 } } }, after: { revision: 2, operatingHours: { openTime: "18:00", closeTime: "02:00" }, tariffs: { motor: { regular: 2_500 }, mobil: { overnight: 15_000 } } } });
  });
  it("retires legacy duplicate active tariffs (status inactive, never deleted) leaving one active per combination", async () => {
    const dup = (amount: number) => ({ _id: new ObjectId(), tenantId: t1, locationId: l1, vehicleType: "motor", tariffType: "regular", amount, status: "active" });
    data.tariffs.push(dup(3_000), dup(3_500));
    expect(await save()).toMatchObject({ ok: true });
    expect(activeTariffsOf()).toHaveLength(4);
    expect(data.tariffs.filter((row) => equal(row.locationId, l1))).toHaveLength(5);
    expect(data.tariffs.filter((row) => equal(row.locationId, l1) && row.status === "inactive").map((row) => row.amount)).toEqual([3_500]);
  });
  it.each(["auditLogs", "tariffs"])("a failed %s write rolls back hours, revision and tariffs", async (name) => {
    failInsert = name;
    await expect(save()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    nothingWritten();
  });
  it("an ambiguous commit is reported as unknown (SERVICE_UNAVAILABLE), never as success", async () => {
    loseCommitReply = true;
    await expect(save()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
  it("fails closed without the unique active-tariff index", async () => {
    delete indexes.tariffs;
    expect(await save()).toEqual({ ok: false, reason: "not_ready" });
    indexes.tariffs = [{ name: activeTariffIndex.name, key: activeTariffIndex.key, unique: true }]; // not partial: wrong
    expect(await save()).toEqual({ ok: false, reason: "not_ready" });
    nothingWritten();
  });
});

describe("connection failures (P4.7)", () => {
  // Safe operational log (P4.7 C): exactly one line per outage, no secrets.
  const logLines = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);
  it("the settings page read logs a storage failure once (settings.read); FORBIDDEN is not logged", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.db.mockResolvedValueOnce({ ...fakeDb, collection: (name: string) => ({ ...fakeDb.collection(name), countDocuments: async () => { throw new MongoNetworkError("synthetic secret host"); } }) });
    await expect(getLocationSettings(selection)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    data.locations[0].status = "inactive";
    await expect(getLocationSettings(selection)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(logLines(spy)).toEqual([expect.objectContaining({ operation: "settings.read", outcome: "unavailable", category: "network" })]);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/synthetic|Lokasi Utara/);
    spy.mockRestore();
  });
  it("logs a transaction timeout once (outcome unknown) without tariff values or ids; conflicts are not logged", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const timeout = new MongoOperationTimeoutError("synthetic secret Timed out");
    timeout.addErrorLabel("TransientTransactionError");
    commitError = timeout;
    await save().catch(() => undefined);
    commitError = undefined;
    await save({ expectedRevision: 7 });
    expect(logLines(spy)).toEqual([expect.objectContaining({ operation: "location.settings.update", outcome: "unknown", category: "timeout", labels: ["TransientTransactionError"] })]);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(new RegExp(["synthetic", "2000", "12000", l1.toHexString(), t1.toHexString()].join("|")));
    spy.mockRestore();
  });
  it("bounds the whole transaction with the driver deadline (20 s), keeping snapshot/majority/primary", async () => {
    expect(await save()).toMatchObject({ ok: true });
    expect(transactionOptions).toEqual([{ readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary", timeoutMS: 20_000 }]);
  });
  it("a failed index check (network) is unavailable, not not_ready, and is not cached", async () => {
    indexError = new MongoNetworkError("synthetic secret host");
    const error = await save().then(() => undefined, (caught: AppError) => caught);
    expect(error).toMatchObject({ code: "SERVICE_UNAVAILABLE" }); expect(error?.message).not.toContain("synthetic");
    nothingWritten();
    indexError = undefined;
    expect(await save()).toMatchObject({ ok: true });
  });
  it("a transaction timeout is unknown with nothing written; the reload-then-save path still works", async () => {
    const timeout = new MongoOperationTimeoutError("synthetic secret Timed out during withTransaction");
    timeout.addErrorLabel("TransientTransactionError");
    commitError = timeout;
    await expect(save()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    nothingWritten();
    commitError = undefined;
    expect(await save()).toMatchObject({ ok: true, settings: { revision: 1 } });
  });
  it("after an ambiguous commit that did persist, a retry on the old revision conflicts instead of writing twice", async () => {
    loseCommitReply = true;
    await expect(save()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    loseCommitReply = false;
    expect(await save()).toEqual({ ok: false, reason: "conflict" });
    expect(data.auditLogs).toHaveLength(1); expect(location().settingsRevision).toBe(1);
  });
});

describe("optimistic concurrency", () => {
  it("rejects a stale expectedRevision without writes", async () => {
    location().settingsRevision = 2;
    expect(await save({ expectedRevision: 1 })).toEqual({ ok: false, reason: "conflict" });
    expect(await save({ expectedRevision: 0 })).toEqual({ ok: false, reason: "conflict" });
    expect(data.auditLogs).toHaveLength(0); expect(location().settingsRevision).toBe(2);
    expect(await save({ expectedRevision: 2 })).toMatchObject({ ok: true, settings: { revision: 3 } });
  });
  it("two concurrent saves on the same revision: exactly one wins, the other conflicts and writes nothing", async () => {
    let release!: () => void; barrier = { collection: "locations", waiting: 0, gate: new Promise<void>((resolve) => { release = resolve; }) }; barrier.release = release;
    const results = await Promise.all([save(), save({ tariffs: { motor: { regular: 9_000, overnight: 9_000 }, mobil: { regular: 9_000, overnight: 9_000 } } })]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.reason === "conflict")).toHaveLength(1);
    expect(activeTariffsOf()).toHaveLength(4); expect(data.auditLogs).toHaveLength(1); expect(location().settingsRevision).toBe(1);
    const winner = results.findIndex((result) => result.ok);
    expect(activeTariffsOf().find((row) => row.vehicleType === "motor" && row.tariffType === "regular")?.amount).toBe(winner === 0 ? 2_000 : 9_000);
  });
  it("a tariff changed concurrently between read and update (conditional update) aborts the save", async () => {
    await save();
    afterTariffRead = async () => { for (const row of activeTariffsOf()) row.status = "inactive"; };
    expect(await save({ expectedRevision: 1 })).toEqual({ ok: false, reason: "conflict" });
    expect(location().settingsRevision).toBe(1); expect(data.auditLogs).toHaveLength(1);
  });
  it("a concurrent insert that won the unique tariff index is a conflict, not a duplicate", async () => {
    // Another transaction inserted the same combination after this one read the tariffs.
    afterTariffRead = async () => { data.tariffs.push({ _id: new ObjectId(), tenantId: t1, locationId: l1, vehicleType: "motor", tariffType: "regular", amount: 1, status: "active" }); };
    expect(await save()).toEqual({ ok: false, reason: "conflict" });
    expect(activeTariffsOf()).toHaveLength(1); expect(data.auditLogs).toHaveLength(0); expect(location().settingsRevision).toBeUndefined();
  });
});

describe("checkout interplay (latest settings at checkout, completed immutable)", () => {
  it("new tariffs and hours apply to active vehicles at their checkout", async () => {
    await save();
    expect(await checkout(s1, { tariffType: "overnight", nightCount: 2, expectedTotal: 24_000 })).toMatchObject({ ok: true, receipt: { amountPerUnit: 12_000, totalAmount: 24_000 } });
    const tx = data.parkingTransactions[0];
    expect(tx.tariffSnapshot).toMatchObject({ source: "location", amountPerUnit: 12_000 });
    expect(tx.policySnapshot).toEqual({ openTime: "06:00", closeTime: "22:00", source: "location" });
  });
  it("settings saved after the Owner saw the old total: confirmation reports price_changed, nothing is charged", async () => {
    await save();
    expect(await checkout(s1, { tariffType: "regular", expectedTotal: 5_000 })).toEqual({ ok: false, reason: "price_changed", totalAmount: 6_000 });
    expect(data.parkingTransactions).toHaveLength(0);
  });
  it("a checkout whose snapshot predates a concurrent save charges the shown old amount; later checkouts use the new one", async () => {
    // Checkout has read the (default) tariffs; the save commits before checkout writes.
    afterTariffRead = async () => { const result = await save(); expect(result).toMatchObject({ ok: true }); };
    expect(await checkout(s1, { tariffType: "regular", expectedTotal: 5_000 })).toMatchObject({ ok: true, receipt: { totalAmount: 5_000 } });
    expect(await checkout(s2, { tariffType: "regular", expectedTotal: 6_000 })).toMatchObject({ ok: true, receipt: { totalAmount: 6_000 } });
    expect(data.parkingTransactions.map((row) => row.amountPaid)).toEqual([5_000, 6_000]);
  });
  it("saving settings never modifies completed transactions", async () => {
    expect(await checkout(s1, { tariffType: "regular", expectedTotal: 5_000 })).toMatchObject({ ok: true });
    const before = structuredClone(data.parkingTransactions);
    await save(); await save({ expectedRevision: 1, tariffs: { motor: { regular: 1, overnight: 1 }, mobil: { regular: 1, overnight: 1 } } });
    expect(data.parkingTransactions).toEqual(before);
  });
});
