import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../errors";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), db: vi.fn(), client: vi.fn(), transaction: vi.fn(), end: vi.fn(), ops: [] as string[] }));
vi.mock("server-only", () => ({}));
vi.mock("./authorization", () => ({ requirePlatformActor: mocks.actor }));
vi.mock("../mongodb", () => ({ getDb: mocks.db, getMongoClient: mocks.client }));
import { changeTenantLocationStatus, createTenantLocation, renameTenantOwner, updateTenantLocation } from "./platform-tenant-resources";

type Row = Record<string, unknown>;
const equal = (a: unknown, b: unknown) => (a instanceof ObjectId && b instanceof ObjectId ? a.equals(b) : a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);
function matches(row: Row, filter: Row) {
  return Object.entries(filter).every(([key, expected]) => {
    if (expected === null) return row[key] === undefined || row[key] === null;
    if (expected && typeof expected === "object" && !(expected instanceof ObjectId) && !(expected instanceof Date)) {
      const condition = expected as Row;
      if ("$regex" in condition) return typeof row[key] === "string" && new RegExp(String(condition.$regex), String(condition.$options ?? "")).test(row[key] as string);
      if ("$ne" in condition) return !equal(row[key], condition.$ne);
      if ("$exists" in condition) return (row[key] !== undefined) === condition.$exists;
    }
    return equal(row[key], expected);
  });
}
let data: Record<string, Row[]>;
let failAudit = false; let beforeUpdate: (() => void) | undefined;
const session = { withTransaction: mocks.transaction, endSession: mocks.end };
const fakeDb = { collection: (name: string) => ({
  findOne: async (filter: Row, options: { session?: unknown; projection: Row }) => {
    expect(options.session).toBe(session);
    const row = (data[name] ??= []).find((item) => matches(item, filter));
    return row ? Object.fromEntries(Object.keys(options.projection).filter((key) => key in row).map((key) => [key, row[key]])) : null;
  },
  updateOne: async (filter: Row, update: { $set?: Row; $unset?: Row }, options: { session?: unknown }) => {
    expect(options.session).toBe(session);
    if (name !== "tenants" && beforeUpdate) { beforeUpdate(); beforeUpdate = undefined; }
    mocks.ops.push(`update:${name}`);
    const row = (data[name] ??= []).find((item) => matches(item, filter));
    if (row) { Object.assign(row, update.$set ?? {}); for (const key of Object.keys(update.$unset ?? {})) delete row[key]; }
    return { matchedCount: row ? 1 : 0 };
  },
  insertOne: async (document: Row, options: { session?: unknown }) => {
    expect(options.session).toBe(session);
    if (name === "auditLogs" && failAudit) throw new Error("synthetic secret audit failure");
    mocks.ops.push(`insert:${name}`);
    (data[name] ??= []).push(document);
  },
}) };

const adminId = new ObjectId(); const t1 = new ObjectId(); const t2 = new ObjectId();
const ownerId = new ObjectId(); const staffId = new ObjectId(); const otherOwnerId = new ObjectId(); const adminOwnerId = new ObjectId();
const l1 = new ObjectId(); const l2 = new ObjectId(); const foreign = new ObjectId();
const old = new Date("2026-01-01T00:00:00Z");
const hex = (id: ObjectId) => id.toHexString();
const find = (name: string, id: ObjectId) => data[name].find((row) => (row._id as ObjectId).equals(id))!;
beforeEach(() => {
  vi.resetAllMocks(); mocks.ops.length = 0; failAudit = false; beforeUpdate = undefined;
  mocks.actor.mockResolvedValue({ userId: adminId });
  mocks.db.mockResolvedValue(fakeDb); mocks.client.mockResolvedValue({ startSession: () => session }); mocks.end.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async (work: () => Promise<void>) => {
    const snapshot = Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
    try { await work(); } catch (error) { data = snapshot; throw error; }
  });
  data = {
    tenants: [{ _id: t1, name: "Parkir Sentosa", slug: "parkir-sentosa", status: "active", timezone: "Asia/Makassar", updatedAt: old }, { _id: t2, name: "Tenant Lain", slug: "tenant-lain", status: "active", timezone: "Asia/Jakarta", updatedAt: old }],
    users: [
      { _id: ownerId, name: "Budi", email: "budi@example.test", status: "active", updatedAt: old },
      { _id: staffId, name: "Staf", email: "staf@example.test", status: "active", updatedAt: old },
      { _id: otherOwnerId, name: "Owner Lain", email: "lain@example.test", status: "active", updatedAt: old },
      { _id: adminOwnerId, name: "Admin Platform", email: "admin@example.test", status: "active", platformRole: "platform_admin", updatedAt: old },
    ],
    memberships: [
      { _id: new ObjectId(), tenantId: t1, userId: ownerId, role: "owner", status: "active" },
      { _id: new ObjectId(), tenantId: t1, userId: staffId, role: "staff", status: "active" },
      { _id: new ObjectId(), tenantId: t2, userId: otherOwnerId, role: "owner", status: "active" },
      { _id: new ObjectId(), tenantId: t1, userId: adminOwnerId, role: "owner", status: "active" },
    ],
    locations: [
      { _id: l1, tenantId: t1, name: "Lokasi Utara", address: "Jl. Mawar 1", status: "active", updatedAt: old },
      { _id: l2, tenantId: t1, name: "Lokasi Barat", status: "inactive", updatedAt: old },
      { _id: foreign, tenantId: t2, name: "Lokasi Asing", status: "active", updatedAt: old },
    ],
    auditLogs: [],
  };
});
const untouched = () => JSON.stringify([data.tenants[1], find("users", otherOwnerId), find("locations", foreign)]);

describe("authorization", () => {
  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)("%s callers cannot run any Owner/location mutation", async (code) => {
    mocks.actor.mockRejectedValue(new AppError(code));
    for (const run of [
      () => renameTenantOwner({ tenantId: hex(t1), userId: hex(ownerId), name: "X" }),
      () => createTenantLocation({ tenantId: hex(t1), name: "Lokasi Baru" }),
      () => updateTenantLocation({ tenantId: hex(t1), locationId: hex(l1), name: "Lokasi Baru" }),
      () => changeTenantLocationStatus({ tenantId: hex(t1), locationId: hex(l1), toStatus: "inactive", expectedStatus: "active" }),
    ]) await expect(run()).rejects.toMatchObject({ code });
    expect(mocks.db).not.toHaveBeenCalled(); expect(data.auditLogs).toHaveLength(0);
  });
});

describe("Owner name", () => {
  const rename = (userId: ObjectId, name: string, tenantId = t1) => renameTenantOwner({ tenantId: hex(tenantId), userId: hex(userId), name });
  it("renames only the Owner's name and audits before/after atomically", async () => {
    expect(await rename(ownerId, "  Budi Santoso ")).toMatchObject({ ok: true });
    expect(find("users", ownerId)).toMatchObject({ name: "Budi Santoso", email: "budi@example.test", status: "active" });
    expect(find("users", ownerId)).not.toHaveProperty("platformRole");
    expect(data.auditLogs[0]).toMatchObject({ tenantId: t1, actorId: adminId, action: "platform.owner.rename", entityType: "user", entityId: ownerId, before: { name: "Budi" }, after: { name: "Budi Santoso" } });
    expect(JSON.stringify(data.auditLogs[0])).not.toContain("budi@example.test");
  });
  it("cannot target a non-Owner member, another tenant's Owner, or a platform_admin account", async () => {
    const before = untouched();
    expect(await rename(staffId, "X")).toEqual({ ok: false, reason: "not_found" });
    expect(await rename(otherOwnerId, "X")).toEqual({ ok: false, reason: "not_found" });
    expect(await rename(adminOwnerId, "X")).toEqual({ ok: false, reason: "protected_account" });
    expect(find("users", adminOwnerId).name).toBe("Admin Platform"); expect(find("users", staffId).name).toBe("Staf");
    expect(untouched()).toBe(before); expect(data.auditLogs).toHaveLength(0);
  });
  it("rejects email/password fields, empty names and unchanged names", async () => {
    expect(await renameTenantOwner({ tenantId: hex(t1), userId: hex(ownerId), name: "Budi", email: "baru@example.test" })).toMatchObject({ reason: "validation" });
    expect(await renameTenantOwner({ tenantId: hex(t1), userId: hex(ownerId), name: "Budi", password: "x".repeat(12) })).toMatchObject({ reason: "validation" });
    expect(await rename(ownerId, "   ")).toMatchObject({ reason: "validation" });
    expect(await rename(ownerId, "Budi")).toEqual({ ok: false, reason: "unchanged" });
    expect(data.auditLogs).toHaveLength(0);
  });
  it("rolls back when the audit insert fails", async () => {
    failAudit = true;
    await expect(rename(ownerId, "Budi Santoso")).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(find("users", ownerId).name).toBe("Budi");
  });
});

describe("create location", () => {
  const create = (name: string, address?: string, tenantId = t1) => createTenantLocation({ tenantId: hex(tenantId), name, ...(address !== undefined ? { address } : {}) });
  it("inserts an active location in the tenant's time zone with an audit record, locking the tenant first", async () => {
    expect(await create(" Lokasi Timur ", " Jl. Melati 2 ")).toMatchObject({ ok: true });
    const created = data.locations[3];
    expect(created).toMatchObject({ tenantId: t1, name: "Lokasi Timur", address: "Jl. Melati 2", status: "active", timezone: "Asia/Makassar" });
    expect(mocks.ops).toEqual(["update:tenants", "insert:locations", "insert:auditLogs"]);
    expect(data.auditLogs[0]).toMatchObject({ tenantId: t1, locationId: created._id, action: "platform.location.create", entityType: "location", after: { name: "Lokasi Timur", address: "Jl. Melati 2", status: "active" } });
    expect(untouched()).not.toContain("Lokasi Timur");
  });
  it("omits an empty address", async () => {
    await create("Lokasi Timur", "   ");
    expect(data.locations[3]).not.toHaveProperty("address");
  });
  it("rejects a duplicate name within the tenant in any letter case, but allows it in another tenant", async () => {
    expect(await create("LOKASI utara")).toEqual({ ok: false, reason: "duplicate_name" });
    expect(data.locations).toHaveLength(3);
    expect(await create("Lokasi Utara", undefined, t2)).toMatchObject({ ok: true });
  });
  it("rejects unknown tenants, invalid names and smuggled fields", async () => {
    expect(await create("Lokasi Timur", undefined, new ObjectId())).toEqual({ ok: false, reason: "not_found" });
    expect(await create("A")).toMatchObject({ reason: "validation" });
    expect(await createTenantLocation({ tenantId: hex(t1), name: "Lokasi Timur", status: "inactive" })).toMatchObject({ reason: "validation" });
    expect(data.locations).toHaveLength(3);
  });
  it("rolls back the location and tenant lock when the audit insert fails", async () => {
    failAudit = true;
    await expect(create("Lokasi Timur")).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(data.locations).toHaveLength(3); expect(data.tenants[0].updatedAt).toEqual(old);
  });
});

describe("update location", () => {
  const update = (locationId: ObjectId, name: string, address?: string) => updateTenantLocation({ tenantId: hex(t1), locationId: hex(locationId), name, ...(address !== undefined ? { address } : {}) });
  it("changes name/address only and audits before/after", async () => {
    expect(await update(l1, "Lokasi Utara Baru", "Jl. Mawar 10")).toMatchObject({ ok: true });
    expect(find("locations", l1)).toMatchObject({ name: "Lokasi Utara Baru", address: "Jl. Mawar 10", status: "active", tenantId: t1 });
    expect(data.auditLogs[0]).toMatchObject({ action: "platform.location.update", locationId: l1, before: { name: "Lokasi Utara", address: "Jl. Mawar 1" }, after: { name: "Lokasi Utara Baru", address: "Jl. Mawar 10" } });
  });
  it("clearing the address removes the field", async () => {
    await update(l1, "Lokasi Utara", "");
    expect(find("locations", l1)).not.toHaveProperty("address");
    expect(data.auditLogs[0]).toMatchObject({ before: { address: "Jl. Mawar 1" }, after: { address: null } });
  });
  it("treats another tenant's location as not found and never touches it", async () => {
    const before = untouched();
    expect(await update(foreign, "Diambil alih")).toEqual({ ok: false, reason: "not_found" });
    expect(untouched()).toBe(before);
  });
  it("rejects a name already used by another location of the tenant, and unchanged values", async () => {
    expect(await update(l1, "lokasi barat")).toEqual({ ok: false, reason: "duplicate_name" });
    expect(await update(l1, "Lokasi Utara", "Jl. Mawar 1")).toEqual({ ok: false, reason: "unchanged" });
    expect(await update(l1, "LOKASI UTARA", "Jl. Mawar 1")).toMatchObject({ ok: true });
  });
  it("a concurrent edit after the read turns the conditional update into a stale no-op", async () => {
    beforeUpdate = () => { find("locations", l1).updatedAt = new Date(); };
    expect(await update(l1, "Lokasi Utara Baru")).toEqual({ ok: false, reason: "stale" });
    expect(data.auditLogs).toHaveLength(0);
  });
});

describe("location status", () => {
  const setStatus = (locationId: ObjectId, toStatus: string, expectedStatus: string) => changeTenantLocationStatus({ tenantId: hex(t1), locationId: hex(locationId), toStatus, expectedStatus });
  it.each([[l1, "active", "inactive"], [l2, "inactive", "active"]] as const)("changes %s from %s to %s with an audit record and tenant lock", async (locationId, from, to) => {
    expect(await setStatus(locationId, to, from)).toMatchObject({ ok: true });
    expect(find("locations", locationId).status).toBe(to);
    expect(mocks.ops).toEqual(["update:tenants", "update:locations", "insert:auditLogs"]);
    expect(data.auditLogs[0]).toMatchObject({ action: "platform.location.status_change", locationId, before: { status: from }, after: { status: to } });
  });
  it("rejects stale views, same-status requests, foreign locations and invalid statuses", async () => {
    expect(await setStatus(l1, "inactive", "inactive")).toEqual({ ok: false, reason: "stale" });
    expect(await setStatus(l1, "active", "active")).toEqual({ ok: false, reason: "unchanged" });
    expect(await changeTenantLocationStatus({ tenantId: hex(t1), locationId: hex(foreign), toStatus: "inactive", expectedStatus: "active" })).toEqual({ ok: false, reason: "not_found" });
    expect(await setStatus(l1, "deleted", "active")).toMatchObject({ reason: "validation" });
    expect(find("locations", l1).status).toBe("active"); expect(find("locations", foreign).status).toBe("active");
    expect(data.auditLogs).toHaveLength(0);
  });
  it("a duplicate submit after success is rejected, so it is applied and audited once", async () => {
    expect(await setStatus(l1, "inactive", "active")).toMatchObject({ ok: true });
    expect(await setStatus(l1, "inactive", "active")).toEqual({ ok: false, reason: "unchanged" });
    expect(data.auditLogs).toHaveLength(1);
  });
  it("rolls back when the audit insert fails", async () => {
    failAudit = true;
    await expect(setStatus(l1, "inactive", "active")).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(find("locations", l1).status).toBe("active");
  });
});
