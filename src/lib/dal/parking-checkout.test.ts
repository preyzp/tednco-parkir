import { MongoServerError, ObjectId } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../errors";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), db: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./authorization", () => ({ requirePermission: mocks.guard }));
vi.mock("../mongodb", () => ({ getDb: mocks.db, getMongoClient: mocks.client }));
import { completeParkingCheckout, completedTransactionIndex, getParkingCheckout, resetCheckoutIndexCacheForTests } from "./parking-checkout";

// Filter-aware fake with per-transaction rollback of inserts and updates, the
// unique partial index on completed parkingTransactions, an optional barrier
// that lets two transactions read before either writes, and an optional
// "commit succeeded but the reply was lost" failure.
type Row = Record<string, unknown>;
const equal = (a: unknown, b: unknown) => (a instanceof ObjectId && b instanceof ObjectId ? a.equals(b) : a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);
const matches = (row: Row, filter: Row) => Object.entries(filter).every(([key, expected]) => equal(row[key], expected));
const project = (row: Row, projection?: Row) => (projection ? Object.fromEntries([...new Set(["_id", ...Object.keys(projection)])].filter((key) => key in row).map((key) => [key, row[key]])) : row);
type Write = { kind: "insert"; name: string; doc: Row } | { kind: "update"; row: Row; before: Row };
type FakeSession = { writes: Write[]; withTransaction: (work: () => Promise<void>) => Promise<void>; endSession: () => Promise<void> };
let data: Record<string, Row[]>;
let indexes: Row[] | "missing";
let barrier: { waiting: number; release?: () => void; gate?: Promise<void> } | undefined;
let failInsert: string | undefined;
let loseCommitReply = false;
let beforeUpdate: (() => void) | undefined;
const fakeDb = { collection: (name: string) => ({
  findOne: async (filter: Row, options: { projection?: Row; session?: FakeSession } = {}) => {
    if (name === "parkingSessions" && options.session && barrier) { barrier.waiting++; if (barrier.waiting >= 2) barrier.release?.(); await barrier.gate; }
    const row = (data[name] ??= []).find((item) => matches(item, filter));
    return row ? project(row, options.projection) : null;
  },
  find: (filter: Row, options: { projection?: Row } = {}) => {
    let limit = Infinity;
    const cursor = { limit: (count: number) => { limit = count; return cursor; }, toArray: async () => (data[name] ??= []).filter((item) => matches(item, filter)).slice(0, limit).map((row) => project(row, options.projection)) };
    return cursor;
  },
  listIndexes: () => ({ toArray: async () => { if (indexes === "missing") throw new MongoServerError({ message: "ns not found", code: 26 }); return indexes; } }),
  insertOne: async (doc: Row, options: { session: FakeSession }) => {
    if (failInsert === name) throw new Error("synthetic secret storage failure");
    if (name === "parkingTransactions" && doc.status === "completed" && (data.parkingTransactions ??= []).some((row) => row.status === "completed" && equal(row.tenantId, doc.tenantId) && equal(row.parkingSessionId, doc.parkingSessionId))) {
      throw new MongoServerError({ message: "E11000 duplicate key", code: 11000, keyPattern: completedTransactionIndex.key });
    }
    (data[name] ??= []).push(doc); options.session.writes.push({ kind: "insert", name, doc });
  },
  updateOne: async (filter: Row, update: { $set: Row }, options: { session: FakeSession }) => {
    beforeUpdate?.(); beforeUpdate = undefined;
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
      if (loseCommitReply) throw new MongoServerError({ message: "connection lost after commit", errorLabels: ["UnknownTransactionCommitResult"] });
    },
    endSession: async () => {},
  };
  return session;
}

const userId = new ObjectId(); const otherUser = new ObjectId();
const t1 = new ObjectId(); const t2 = new ObjectId(); const l1 = new ObjectId(); const l2 = new ObjectId(); const l3 = new ObjectId();
const s1 = new ObjectId(); const sOther = new ObjectId(); const sForeign = new ObjectId(); const sCanceled = new ObjectId();
const ownerContext = (overrides: Row = {}) => Object.freeze({ userId, tenantId: t1, locationId: l1, role: "owner", permissions: ["parking.checkout"], ...overrides });
const selection = { tenantId: t1.toHexString(), locationId: l1.toHexString() };
const key = "6f1c1d7e-2b3a-4c5d-8e9f-0a1b2c3d4e5f"; const key2 = "7a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d";
// Server "now": 27 Oct 2026 08:00 WIB. Entry: 26 Oct 10:00 WIB → 1 night passed.
const serverNow = new Date("2026-10-27T01:00:00Z");
const confirm = (raw: Row = {}) => completeParkingCheckout(selection, { sessionId: s1.toHexString(), tariffType: "overnight", nightCount: 1, paymentMethod: "cash", expectedTotal: 10_000, idempotencyKey: key, ...raw });
const session = (id: ObjectId, extra: Row = {}) => ({ _id: id, tenantId: t1, locationId: l1, vehicleId: new ObjectId(), plateNumberSnapshot: "B 1234 XYZ", normalizedPlateSnapshot: "B1234XYZ", vehicleTypeSnapshot: "mobil", entryAt: new Date("2026-10-26T03:00:00Z"), status: "active", enteredBy: userId, ...extra });
const s1Row = () => data.parkingSessions.find((row) => equal(row._id, s1))!;
const writesUntouched = () => { expect(data.parkingTransactions ?? []).toHaveLength(0); expect(data.auditLogs ?? []).toHaveLength(0); expect(s1Row().status).toBe("active"); };

beforeEach(() => {
  vi.resetAllMocks(); resetCheckoutIndexCacheForTests();
  barrier = undefined; failInsert = undefined; loseCommitReply = false; beforeUpdate = undefined;
  vi.useFakeTimers({ now: serverNow, toFake: ["Date"] });
  mocks.guard.mockResolvedValue(ownerContext());
  mocks.db.mockResolvedValue(fakeDb);
  mocks.client.mockResolvedValue({ startSession: newSession });
  indexes = [{ name: "_id_", key: { _id: 1 } }, { name: completedTransactionIndex.name, key: completedTransactionIndex.key, unique: true, partialFilterExpression: { status: "completed" } }];
  data = {
    tenants: [{ _id: t1, status: "active", timezone: "Asia/Makassar" }, { _id: t2, status: "active", timezone: "Asia/Jakarta" }],
    // Location zone (WIB) differs from the tenant's (WITA) on purpose: location wins.
    locations: [{ _id: l1, tenantId: t1, name: "Lokasi Utara", status: "active", timezone: "Asia/Jakarta" }, { _id: l2, tenantId: t1, name: "Lokasi Barat", status: "active" }, { _id: l3, tenantId: t2, name: "Lokasi Lain", status: "active" }],
    parkingSessions: [session(s1), session(sOther, { locationId: l2 }), session(sForeign, { tenantId: t2, locationId: l3 }), session(sCanceled, { status: "canceled" })],
    tariffs: [], parkingTransactions: [], auditLogs: [],
  };
});
afterEach(() => vi.useRealTimers());

describe("authorization and isolation", () => {
  it("re-derives the context with parking.checkout on every call", async () => {
    await confirm(); await getParkingCheckout(selection, s1.toHexString());
    expect(mocks.guard).toHaveBeenNthCalledWith(1, "parking.checkout", selection);
    expect(mocks.guard).toHaveBeenNthCalledWith(2, "parking.checkout", selection);
  });
  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)("propagates %s before touching data", async (code) => {
    mocks.guard.mockRejectedValue(new AppError(code));
    await expect(confirm()).rejects.toMatchObject({ code });
    await expect(getParkingCheckout(selection, s1.toHexString())).rejects.toMatchObject({ code });
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each(["admin", "staff"])("is Owner-only: %s is forbidden without writes", async (role) => {
    mocks.guard.mockResolvedValue(ownerContext({ role }));
    await expect(confirm()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.db).not.toHaveBeenCalled(); writesUntouched();
  });
  it.each([["another location", sOther], ["another tenant", sForeign]])("a session of %s is not found (scope comes from the guard)", async (_label, id) => {
    expect(await confirm({ sessionId: id.toHexString() })).toEqual({ ok: false, reason: "not_found" });
    expect(await getParkingCheckout(selection, id.toHexString())).toEqual({ kind: "not_found" });
    expect(data.parkingSessions.every((row) => row.status !== "completed")).toBe(true);
  });
  it("rejects browser-supplied tenant/location/exit time/total fields (strict input)", async () => {
    for (const extra of [{ tenantId: t2.toHexString() }, { locationId: l3.toHexString() }, { exitAt: "2026-10-27T00:00:00Z" }, { totalAmount: 1 }, { amountPaid: 1 }]) {
      expect(await confirm(extra)).toEqual({ ok: false, reason: "validation" });
    }
    writesUntouched();
  });
  it.each([["suspended tenant", () => { data.tenants[0].status = "suspended"; }], ["inactive location", () => { data.locations[0].status = "inactive"; }]])("%s blocks checkout inside the transaction", async (_label, change) => {
    change();
    await expect(confirm()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getParkingCheckout(selection, s1.toHexString())).rejects.toMatchObject({ code: "FORBIDDEN" });
    writesUntouched();
  });
});

describe("validation", () => {
  it.each([
    [{ sessionId: "not-an-id" }], [{ tariffType: "menginap" }], [{ tariffType: "overnight", nightCount: undefined }], [{ tariffType: "regular", nightCount: 1 }],
    [{ nightCount: 0 }], [{ nightCount: 1.5 }], [{ nightCount: "1" }], [{ paymentMethod: "qris" }], [{ paymentMethod: "prepaid" }],
    [{ expectedTotal: 0 }], [{ expectedTotal: 10_000.5 }], [{ idempotencyKey: "abc" }], [{ idempotencyKey: undefined }],
  ])("rejects %j without writes", async (change) => {
    expect(await confirm(change)).toEqual({ ok: false, reason: "validation" });
    writesUntouched();
  });
});

describe("successful checkout (atomic)", () => {
  it("stores payment, completes the session and audits — server time, server total, guarded scope", async () => {
    const result = await confirm();
    expect(result).toEqual({ ok: true, replayed: false, receipt: {
      plateNumber: "B 1234 XYZ", vehicleType: "mobil", locationName: "Lokasi Utara", entryAt: "2026-10-26T03:00:00.000Z", exitAt: serverNow.toISOString(),
      timeZone: "Asia/Jakarta", tariffType: "overnight", nightCount: 1, amountPerUnit: 10_000, totalAmount: 10_000, paymentMethod: "cash",
    } });
    expect(data.parkingTransactions).toHaveLength(1);
    const transaction = data.parkingTransactions[0];
    expect(transaction).toMatchObject({ tenantId: t1, locationId: l1, parkingSessionId: s1, plateNumberSnapshot: "B 1234 XYZ", vehicleTypeSnapshot: "mobil", paymentMethod: "cash", amountDue: 10_000, amountPaid: 10_000, status: "completed", processedBy: userId, paymentAt: serverNow, idempotencyKey: key });
    expect(transaction.tariffSnapshot).toEqual({ tariffType: "overnight", amountPerUnit: 10_000, nightCount: 1, totalAmount: 10_000, currency: "IDR", source: "default" });
    expect(s1Row()).toMatchObject({ status: "completed", exitAt: serverNow, completedBy: userId, transactionId: transaction._id });
    expect(data.auditLogs).toHaveLength(1);
    expect(data.auditLogs[0]).toMatchObject({ tenantId: t1, locationId: l1, actorId: userId, action: "parking.checkout", entityType: "parkingSession", entityId: s1, before: { status: "active" } });
    expect(data.auditLogs[0].after).toMatchObject({ status: "completed", transactionId: transaction._id, tariffType: "overnight", nightCount: 1, totalAmount: 10_000, paymentMethod: "cash" });
  });
  it.each([["regular", undefined, 5_000], ["overnight", 2, 20_000], ["overnight", 3, 30_000]] as const)("%s %s → total %i (Menginap replaces Reguler)", async (tariffType, nightCount, total) => {
    const result = await confirm({ tariffType, nightCount, expectedTotal: total });
    expect(result).toMatchObject({ ok: true, receipt: { tariffType, totalAmount: total } });
    expect(data.parkingTransactions[0]).toMatchObject({ amountDue: total, amountPaid: total });
  });
  it("uses an active location tariff over the default and ignores inactive ones", async () => {
    data.tariffs.push({ _id: new ObjectId(), tenantId: t1, locationId: l1, vehicleType: "mobil", tariffType: "overnight", amount: 15_000, status: "active" },
      { _id: new ObjectId(), tenantId: t1, locationId: l1, vehicleType: "mobil", tariffType: "regular", amount: 1, status: "inactive" },
      { _id: new ObjectId(), tenantId: t1, locationId: l2, vehicleType: "mobil", tariffType: "regular", amount: 2, status: "active" });
    expect(await confirm({ nightCount: 2, expectedTotal: 30_000 })).toMatchObject({ ok: true, receipt: { amountPerUnit: 15_000, totalAmount: 30_000 } });
    expect(data.parkingTransactions[0].tariffSnapshot).toMatchObject({ source: "location" });
    expect(await confirm({ sessionId: sCanceled.toHexString() })).toEqual({ ok: false, reason: "not_active" });
  });
  it("refuses an ambiguous tariff configuration instead of guessing", async () => {
    for (const amount of [7_000, 8_000]) data.tariffs.push({ _id: new ObjectId(), tenantId: t1, locationId: l1, vehicleType: "mobil", tariffType: "regular", amount, status: "active" });
    expect(await confirm({ tariffType: "regular", nightCount: undefined, expectedTotal: 7_000 })).toEqual({ ok: false, reason: "tariff_unavailable" });
    expect(await getParkingCheckout(selection, s1.toHexString())).toEqual({ kind: "tariff_unavailable" });
    writesUntouched();
  });
  it("never charges an amount different from the one shown: price_changed, no writes", async () => {
    expect(await confirm({ expectedTotal: 5_000 })).toEqual({ ok: false, reason: "price_changed", totalAmount: 10_000 });
    writesUntouched();
  });
  it("a canceled session cannot be checked out", async () => {
    expect(await confirm({ sessionId: sCanceled.toHexString() })).toEqual({ ok: false, reason: "not_active" });
    expect(data.parkingTransactions).toHaveLength(0);
  });
});

describe("failure keeps the session active (rollback)", () => {
  it.each(["auditLogs", "parkingTransactions"])("a failed %s write rolls back everything and reports an unknown outcome", async (name) => {
    failInsert = name;
    await expect(confirm()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    writesUntouched();
  });
  it("fails closed without the unique completed-payment index", async () => {
    indexes = "missing";
    expect(await confirm()).toEqual({ ok: false, reason: "not_ready" });
    expect(await getParkingCheckout(selection, s1.toHexString())).toEqual({ kind: "not_ready" });
    indexes = [{ name: completedTransactionIndex.name, key: completedTransactionIndex.key, unique: true }]; // not partial: wrong
    expect(await confirm()).toEqual({ ok: false, reason: "not_ready" });
    writesUntouched();
  });
  it("a session changed between read and update (conditional update) aborts the payment", async () => {
    beforeUpdate = () => { s1Row().status = "canceled"; };
    expect(await confirm()).toEqual({ ok: false, reason: "not_active" });
    expect(data.parkingTransactions).toHaveLength(0); expect(data.auditLogs).toHaveLength(0);
  });
});

describe("duplicates, retries and idempotency", () => {
  it("retrying with the same key returns the committed result without a second payment", async () => {
    const first = await confirm();
    const retry = await confirm();
    expect(retry).toEqual({ ...first, replayed: true });
    expect(data.parkingTransactions).toHaveLength(1); expect(data.auditLogs).toHaveLength(1);
  });
  it("a completed session is read-only: another key, another tariff or another user cannot pay again", async () => {
    await confirm();
    expect(await confirm({ idempotencyKey: key2 })).toEqual({ ok: false, reason: "already_completed" });
    expect(await confirm({ nightCount: 2, expectedTotal: 20_000 })).toEqual({ ok: false, reason: "already_completed" });
    mocks.guard.mockResolvedValue(ownerContext({ userId: otherUser }));
    expect(await confirm()).toEqual({ ok: false, reason: "already_completed" });
    expect(data.parkingTransactions).toHaveLength(1);
  });
  it("double-submit (two concurrent requests, same key): one payment, both report the same success", async () => {
    let release!: () => void; barrier = { waiting: 0, gate: new Promise<void>((resolve) => { release = resolve; }) }; barrier.release = release;
    const [a, b] = await Promise.all([confirm(), confirm()]);
    expect([a, b].every((result) => result.ok)).toBe(true);
    expect([a, b].filter((result) => result.ok && result.replayed)).toHaveLength(1);
    expect(data.parkingTransactions).toHaveLength(1); expect(data.auditLogs).toHaveLength(1);
  });
  it("two concurrent checkouts with different keys: exactly one wins, the other is already_completed", async () => {
    let release!: () => void; barrier = { waiting: 0, gate: new Promise<void>((resolve) => { release = resolve; }) }; barrier.release = release;
    const results = await Promise.all([confirm(), confirm({ idempotencyKey: key2 })]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.reason === "already_completed")).toHaveLength(1);
    expect(data.parkingTransactions).toHaveLength(1);
  });
  it("commit succeeded but the reply was lost: the committed payment is found and reported, not repeated", async () => {
    loseCommitReply = true;
    const result = await confirm();
    expect(result).toMatchObject({ ok: true, replayed: true, receipt: { totalAmount: 10_000 } });
    loseCommitReply = false;
    expect(await confirm()).toMatchObject({ ok: true, replayed: true });
    expect(data.parkingTransactions).toHaveLength(1);
  });
});

describe("checkout view", () => {
  it("quotes an active session in the location zone with a suggestion, both rates and no scope ids", async () => {
    const view = await getParkingCheckout(selection, s1.toHexString(), serverNow);
    expect(view).toEqual({ kind: "active", quote: {
      sessionId: s1.toHexString(), plateNumber: "B 1234 XYZ", vehicleType: "mobil", locationName: "Lokasi Utara", entryAt: "2026-10-26T03:00:00.000Z",
      quotedAt: serverNow.toISOString(), timeZone: "Asia/Jakarta", nights: 1, suggestion: { tariffType: "overnight", nightCount: 1 },
      rates: { regular: { amount: 5_000, source: "default" }, overnight: { amount: 10_000, source: "default" } }, policy: { openTime: "05:00", closeTime: "00:00" },
    } });
    expect(JSON.stringify(view)).not.toMatch(/tenantId|locationId|enteredBy|vehicleId/);
  });
  it("falls back to the tenant zone when the location has none, and suggests Reguler on the same day", async () => {
    data.locations[0].timezone = undefined;
    const view = await getParkingCheckout(selection, s1.toHexString(), new Date("2026-10-26T08:00:00Z"));
    expect(view).toMatchObject({ kind: "active", quote: { timeZone: "Asia/Makassar", nights: 0, suggestion: { tariffType: "regular" } } });
  });
  it("shows a completed session read-only with its receipt, and a canceled one as such", async () => {
    await confirm();
    expect(await getParkingCheckout(selection, s1.toHexString())).toMatchObject({ kind: "completed", receipt: { totalAmount: 10_000, exitAt: serverNow.toISOString() } });
    expect(await getParkingCheckout(selection, sCanceled.toHexString())).toEqual({ kind: "canceled", plateNumber: "B 1234 XYZ" });
    expect(await getParkingCheckout(selection, "zzz")).toEqual({ kind: "not_found" });
  });
  it("sanitizes storage failures", async () => {
    mocks.db.mockRejectedValue(new Error("synthetic secret"));
    await expect(getParkingCheckout(selection, s1.toHexString())).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});
