import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../errors";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), db: vi.fn(), client: vi.fn(), transaction: vi.fn(), end: vi.fn(), updates: [] as { filter: Record<string, unknown>; update: Record<string, unknown> }[] }));
vi.mock("server-only", () => ({}));
vi.mock("./authorization", () => ({ requirePlatformActor: mocks.actor }));
vi.mock("../mongodb", () => ({ getDb: mocks.db, getMongoClient: mocks.client }));
import { changeTenantStatus, renameTenant } from "./platform-tenant-update";

type Row = Record<string, unknown>;
const equal = (a: unknown, b: unknown) => (a instanceof ObjectId && b instanceof ObjectId ? a.equals(b) : a === b);
const matches = (row: Row, filter: Row) => Object.entries(filter).every(([key, value]) => equal(row[key], value));
let data: Record<string, Row[]>;
let failAudit = false; let concurrentChange: ((tenant: Row) => void) | undefined;
const session = { withTransaction: mocks.transaction, endSession: mocks.end };
const fakeDb = { collection: (name: string) => ({
  findOne: async (filter: Row, options: { session?: unknown; projection: Row }) => {
    expect(options.session).toBe(session);
    const row = data[name].find((item) => matches(item, filter));
    if (row && concurrentChange) { concurrentChange(row); concurrentChange = undefined; return { _id: row._id, name: "before-concurrent", status: "active" }; }
    return row ? Object.fromEntries(Object.keys(options.projection).map((key) => [key, row[key]])) : null;
  },
  updateOne: async (filter: Row, update: { $set: Row }, options: { session?: unknown }) => {
    expect(options.session).toBe(session);
    mocks.updates.push({ filter, update });
    const row = data[name].find((item) => matches(item, filter));
    if (row) Object.assign(row, update.$set);
    return { matchedCount: row ? 1 : 0 };
  },
  insertOne: async (document: Row, options: { session?: unknown }) => {
    expect(options.session).toBe(session);
    if (name === "auditLogs" && failAudit) throw new Error("synthetic secret audit failure");
    data[name].push(document);
  },
}) };

const adminId = new ObjectId(); const tenantId = new ObjectId(); const otherId = new ObjectId(); const created = new Date("2026-01-01T00:00:00Z");
const tenant = () => data.tenants.find((row) => (row._id as ObjectId).equals(tenantId))!;
const other = () => data.tenants.find((row) => (row._id as ObjectId).equals(otherId))!;
beforeEach(() => {
  vi.resetAllMocks(); mocks.updates.length = 0; failAudit = false; concurrentChange = undefined;
  mocks.actor.mockResolvedValue({ userId: adminId });
  mocks.db.mockResolvedValue(fakeDb); mocks.client.mockResolvedValue({ startSession: () => session }); mocks.end.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async (work: () => Promise<void>) => {
    const snapshot = Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
    try { await work(); } catch (error) { data = snapshot; throw error; }
  });
  data = {
    tenants: [
      { _id: tenantId, name: "Parkir Sentosa", slug: "parkir-sentosa", status: "active", timezone: "Asia/Jakarta", createdAt: created, updatedAt: created },
      { _id: otherId, name: "Tenant Lain", slug: "tenant-lain", status: "active", timezone: "Asia/Jakarta", createdAt: created, updatedAt: created },
    ],
    auditLogs: [],
  };
});
const rename = (name: string, id = tenantId.toHexString()) => renameTenant({ tenantId: id, name });
const setStatus = (toStatus: string, expectedStatus: string, id = tenantId.toHexString()) => changeTenantStatus({ tenantId: id, toStatus, expectedStatus });

describe("authorization", () => {
  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)("%s callers cannot rename or change status and nothing is read", async (code) => {
    mocks.actor.mockRejectedValue(new AppError(code));
    await expect(rename("Nama Baru")).rejects.toMatchObject({ code });
    await expect(setStatus("suspended", "active")).rejects.toMatchObject({ code });
    expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.client).not.toHaveBeenCalled();
    expect(tenant()).toMatchObject({ name: "Parkir Sentosa", status: "active" });
  });
});

describe("rename", () => {
  it("updates only the name and updatedAt and writes an audit record with before/after atomically", async () => {
    expect(await rename("  Parkir Sentosa Jaya  ")).toEqual({ ok: true, tenantId: tenantId.toHexString() });
    expect(tenant()).toMatchObject({ name: "Parkir Sentosa Jaya", slug: "parkir-sentosa", status: "active", timezone: "Asia/Jakarta", createdAt: created });
    expect((tenant().updatedAt as Date).getTime()).toBeGreaterThan(created.getTime());
    expect(Object.keys(mocks.updates[0].update.$set as Row).sort()).toEqual(["name", "updatedAt"]);
    expect(data.auditLogs).toHaveLength(1);
    expect(data.auditLogs[0]).toMatchObject({ tenantId, actorId: adminId, action: "platform.tenant.rename", entityType: "tenant", entityId: tenantId, before: { name: "Parkir Sentosa" }, after: { name: "Parkir Sentosa Jaya" } });
    expect(data.auditLogs[0].createdAt).toEqual(tenant().updatedAt);
    expect(other()).toMatchObject({ name: "Tenant Lain", updatedAt: created });
  });
  it.each([["", "too short"], ["A", "too short"], ["x".repeat(101), "too long"]])("rejects invalid name %j (%s) without touching data", async (name) => {
    expect(await rename(name)).toMatchObject({ ok: false, reason: "validation" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects smuggled slug/owner fields and malformed ids", async () => {
    expect(await renameTenant({ tenantId: tenantId.toHexString(), name: "Baru", slug: "hijack" })).toMatchObject({ reason: "validation" });
    expect(await rename("Nama Baru", "not-an-id")).toMatchObject({ reason: "validation" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("reports an unchanged name and a missing tenant without writing", async () => {
    expect(await rename("Parkir Sentosa")).toEqual({ ok: false, reason: "unchanged" });
    expect(await rename("Nama Baru", new ObjectId().toHexString())).toEqual({ ok: false, reason: "not_found" });
    expect(mocks.updates).toHaveLength(0); expect(data.auditLogs).toHaveLength(0);
  });
  it("rolls the rename back when the audit insert fails", async () => {
    failAudit = true;
    const error = await rename("Nama Baru").then(() => undefined, (caught: AppError) => caught);
    expect(error).toMatchObject({ code: "SERVICE_UNAVAILABLE" }); expect(error?.message).not.toContain("synthetic");
    expect(tenant().name).toBe("Parkir Sentosa"); expect(data.auditLogs).toHaveLength(0);
  });
});

describe("status transitions", () => {
  it.each([
    ["active", "suspended"], ["active", "archived"], ["suspended", "active"], ["suspended", "archived"], ["archived", "active"],
  ])("allows %s → %s with an audit record", async (from, to) => {
    tenant().status = from;
    expect(await setStatus(to, from)).toMatchObject({ ok: true });
    expect(tenant().status).toBe(to);
    expect(Object.keys(mocks.updates[0].update.$set as Row).sort()).toEqual(["status", "updatedAt"]);
    expect(data.auditLogs[0]).toMatchObject({ actorId: adminId, tenantId, action: "platform.tenant.status_change", before: { status: from }, after: { status: to } });
    expect(other().status).toBe("active");
  });
  it("archived tenants can only return through restore to active", async () => {
    tenant().status = "archived";
    expect(await setStatus("suspended", "archived")).toEqual({ ok: false, reason: "invalid_transition" });
    expect(tenant().status).toBe("archived"); expect(data.auditLogs).toHaveLength(0);
  });
  it("rejects a stale view (expected status differs) and same-status requests without writing", async () => {
    tenant().status = "suspended";
    expect(await setStatus("archived", "active")).toEqual({ ok: false, reason: "stale" });
    expect(await setStatus("suspended", "active")).toEqual({ ok: false, reason: "unchanged" });
    expect(mocks.updates).toHaveLength(0); expect(tenant().status).toBe("suspended");
  });
  it("a duplicate submit after success is rejected instead of applied twice", async () => {
    expect(await setStatus("suspended", "active")).toMatchObject({ ok: true });
    expect(await setStatus("suspended", "active")).toEqual({ ok: false, reason: "unchanged" });
    expect(data.auditLogs).toHaveLength(1);
  });
  it("a concurrent change between read and update makes the conditional update a stale no-op", async () => {
    // The read returns the pre-change view; the update is conditional on it.
    concurrentChange = (row) => { row.status = "archived"; };
    expect(await setStatus("suspended", "active")).toEqual({ ok: false, reason: "stale" });
    expect(mocks.updates[0].filter).toMatchObject({ _id: tenantId, name: "before-concurrent", status: "active" });
    expect(tenant().status).not.toBe("suspended"); expect(data.auditLogs).toHaveLength(0);
  });
  it("rolls the status change back when the audit insert fails", async () => {
    failAudit = true;
    await expect(setStatus("suspended", "active")).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(tenant().status).toBe("active"); expect(data.auditLogs).toHaveLength(0);
  });
  it.each([{ toStatus: "deleted", expectedStatus: "active" }, { toStatus: "active" }, { toStatus: "suspended", expectedStatus: "active", reason: "x" }])("rejects malformed status input %j", async (input) => {
    expect(await changeTenantStatus({ tenantId: tenantId.toHexString(), ...input })).toMatchObject({ reason: "validation" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
