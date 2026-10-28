import { MongoServerError, ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../errors";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), db: vi.fn(), client: vi.fn(), hash: vi.fn(), transaction: vi.fn(), end: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./authorization", () => ({ requirePlatformActor: mocks.actor }));
vi.mock("../mongodb", () => ({ getDb: mocks.db, getMongoClient: mocks.client }));
vi.mock("better-auth/crypto", () => ({ hashPassword: mocks.hash }));
import { createTenantWithOwner } from "./platform-tenant-create";

// Filter-aware fake with a transaction that really rolls back on failure.
type Row = Record<string, unknown>;
const equal = (a: unknown, b: unknown) => (a instanceof ObjectId && b instanceof ObjectId ? a.equals(b) : a === b);
function matches(row: Row, filter: Row) {
  return Object.entries(filter).every(([key, expected]) => expected && typeof expected === "object" && "$regex" in expected ? new RegExp(String(expected.$regex), String((expected as Row).$options ?? "")).test(String(row[key])) : equal(row[key], expected));
}
let data: Record<string, Row[]>;
let failAt: string | undefined; let duplicateAt: { collection: string; key: string } | undefined;
const writes = () => Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.length]));
const session = { withTransaction: mocks.transaction, endSession: mocks.end };
const fakeDb = { collection: (name: string) => ({
  findOne: async (filter: Row, options: { session?: unknown }) => { expect(options.session).toBe(session); return (data[name] ??= []).find((row) => matches(row, filter)) ?? null; },
  insertOne: async (document: Row, options: { session?: unknown }) => {
    expect(options.session).toBe(session);
    if (failAt === name) throw new Error("synthetic secret persistence failure");
    if (duplicateAt?.collection === name) throw new MongoServerError({ message: "E11000 duplicate key", code: 11000, keyPattern: { [duplicateAt.key]: 1 } });
    (data[name] ??= []).push(document);
  },
}) };

const adminId = new ObjectId();
const existingTenantId = new ObjectId(); const existingUserId = new ObjectId();
const valid = () => ({ tenantName: "  Parkir Sentosa  ", slug: "  Parkir-Sentosa ", timezone: "Asia/Makassar", locationName: " Lokasi Utara ", locationAddress: "", ownerName: " Budi ", ownerEmail: " Budi.Owner@Example.Test ", ownerPassword: "synthetic-initial-password", ownerPasswordConfirm: "synthetic-initial-password" });
beforeEach(() => {
  vi.resetAllMocks(); failAt = undefined; duplicateAt = undefined;
  mocks.actor.mockResolvedValue({ userId: adminId });
  mocks.hash.mockResolvedValue("library-generated-fixture-hash");
  mocks.db.mockResolvedValue(fakeDb);
  mocks.client.mockResolvedValue({ startSession: () => session });
  mocks.end.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async (work: () => Promise<void>) => {
    const snapshot = Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, [...rows]]));
    try { await work(); } catch (error) { data = snapshot; throw error; }
  });
  data = {
    tenants: [{ _id: existingTenantId, name: "Tenant Pengembangan", slug: "tednco-dev-provision", status: "active" }],
    users: [{ _id: existingUserId, name: "Owner Lama", email: "existing.owner@example.test", status: "active" }],
    memberships: [{ _id: new ObjectId(), tenantId: existingTenantId, userId: existingUserId, role: "owner", status: "active", locationIds: [] }],
    locations: [], authAccounts: [], auditLogs: [],
  };
});
const snapshotExisting = () => JSON.stringify([data.tenants[0], data.users[0], data.memberships[0]]);

describe("authorization", () => {
  it.each(["UNAUTHENTICATED", "FORBIDDEN"] as const)("%s callers are rejected before validation, hashing or database access", async (code) => {
    mocks.actor.mockRejectedValue(new AppError(code));
    await expect(createTenantWithOwner(valid())).rejects.toMatchObject({ code });
    expect(mocks.hash).not.toHaveBeenCalled(); expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.client).not.toHaveBeenCalled();
  });
});

describe("validation and normalization", () => {
  it.each([
    ["tenantName", { tenantName: "A" }],
    ["slug", { slug: "Bad Slug!" }],
    ["slug", { slug: "-awal" }],
    ["timezone", { timezone: "Europe/Paris" }],
    ["locationName", { locationName: "" }],
    ["ownerName", { ownerName: "   " }],
    ["ownerEmail", { ownerEmail: "bukan-email" }],
    ["ownerPassword", { ownerPassword: "abcde", ownerPasswordConfirm: "abcde" }],
    ["ownerPassword", { ownerPassword: "x".repeat(129), ownerPasswordConfirm: "x".repeat(129) }],
    ["ownerPasswordConfirm", { ownerPasswordConfirm: "berbeda-dari-password" }],
    ["tenantName", { tenantName: undefined }],
  ])("rejects invalid %s with a static message and no write", async (field, change) => {
    const result = await createTenantWithOwner({ ...valid(), ...change });
    expect(result).toMatchObject({ ok: false, reason: "validation" });
    const message = (result as { fieldErrors: Record<string, string> }).fieldErrors[field];
    expect(message).toBeTruthy();
    for (const value of Object.values(change)) if (typeof value === "string" && value.trim()) expect(message).not.toContain(value);
    expect(mocks.hash).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each([["exactly 6 characters", "abcdef"], ["a longer password", "a-much-longer-password-1234"], ["exactly 128 characters", "x".repeat(128)]])("accepts an Owner password of %s and hashes it", async (_case, password) => {
    expect(await createTenantWithOwner({ ...valid(), ownerPassword: password, ownerPasswordConfirm: password })).toMatchObject({ ok: true });
    expect(mocks.hash).toHaveBeenCalledWith(password);
    expect(JSON.stringify(data)).not.toContain(password); // only the hash is stored
  });
  it("rejects unknown fields such as a smuggled role", async () => {
    expect(await createTenantWithOwner({ ...valid(), platformRole: "platform_admin" })).toMatchObject({ ok: false, reason: "validation" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("atomic creation", () => {
  it("creates tenant, first location, Owner, credential, membership and audit record in one transaction", async () => {
    const result = await createTenantWithOwner(valid());
    expect(result).toMatchObject({ ok: true });
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
    const tenant = data.tenants[1]; const location = data.locations[0]; const user = data.users[1]; const account = data.authAccounts[0]; const membership = data.memberships[1]; const audit = data.auditLogs[0];
    expect((tenant._id as ObjectId).toHexString()).toBe((result as { tenantId: string }).tenantId);
    expect(tenant).toMatchObject({ name: "Parkir Sentosa", slug: "parkir-sentosa", status: "active", timezone: "Asia/Makassar" });
    expect(location).toMatchObject({ tenantId: tenant._id, name: "Lokasi Utara", status: "active", timezone: "Asia/Makassar" });
    expect(location).not.toHaveProperty("address");
    expect(user).toMatchObject({ name: "Budi", email: "budi.owner@example.test", status: "active", emailVerified: false });
    expect(user).not.toHaveProperty("platformRole"); expect(user).not.toHaveProperty("password");
    expect(account).toMatchObject({ userId: user._id, accountId: (user._id as ObjectId).toHexString(), providerId: "credential", password: "library-generated-fixture-hash" });
    expect(membership).toMatchObject({ tenantId: tenant._id, userId: user._id, role: "owner", status: "active", locationIds: [location._id] });
    expect(membership).not.toHaveProperty("permissions");
    expect(audit).toMatchObject({ tenantId: tenant._id, actorId: adminId, action: "platform.tenant.create", entityType: "tenant", entityId: tenant._id });
    expect(mocks.hash).toHaveBeenCalledWith("synthetic-initial-password");
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("synthetic-initial-password");
    expect(JSON.stringify(audit)).not.toMatch(/budi\.owner|library-generated-fixture-hash|password/i);
    expect(mocks.end).toHaveBeenCalledOnce();
  });
  it.each(["tenants", "locations", "users", "authAccounts", "memberships", "auditLogs"])("a failure inserting %s rolls back everything and reports an unconfirmed outcome", async (collection) => {
    const before = writes(); failAt = collection;
    const error = await createTenantWithOwner(valid()).then(() => undefined, (caught: AppError) => caught);
    expect(error).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(error?.message).not.toContain("synthetic");
    expect(writes()).toEqual(before); expect(mocks.end).toHaveBeenCalledOnce();
  });
  it("hash failures are sanitized and never start a transaction", async () => {
    mocks.hash.mockRejectedValue(new Error("synthetic secret"));
    await expect(createTenantWithOwner(valid())).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("duplicates and isolation", () => {
  it("rejects an existing slug without writing anything", async () => {
    const before = writes();
    expect(await createTenantWithOwner({ ...valid(), slug: "TEDNCO-DEV-PROVISION" })).toEqual({ ok: false, reason: "conflict", field: "slug" });
    expect(writes()).toEqual(before);
  });
  it("rejects an existing email in any letter case and never modifies that account", async () => {
    const before = writes(); const existing = snapshotExisting();
    expect(await createTenantWithOwner({ ...valid(), ownerEmail: "EXISTING.Owner@Example.TEST" })).toEqual({ ok: false, reason: "conflict", field: "email" });
    expect(writes()).toEqual(before); expect(snapshotExisting()).toBe(existing);
  });
  it("matches email literally, so regex characters cannot collide with another account", async () => {
    data.users.push({ _id: new ObjectId(), email: "aXb@example.test", status: "active" });
    expect(await createTenantWithOwner({ ...valid(), ownerEmail: "a.b@example.test" })).toMatchObject({ ok: true });
  });
  it.each([["tenants", "slug", "slug"], ["users", "email", "email"]] as const)("a concurrent request winning the unique %s index becomes a %s conflict with full rollback", async (collection, key, field) => {
    const before = writes(); duplicateAt = { collection, key };
    expect(await createTenantWithOwner(valid())).toEqual({ ok: false, reason: "conflict", field });
    expect(writes()).toEqual(before);
  });
  it("only inserts new documents and links the new Owner to the new tenant only", async () => {
    const existing = snapshotExisting();
    await createTenantWithOwner(valid());
    expect(snapshotExisting()).toBe(existing);
    const newMemberships = data.memberships.slice(1);
    expect(newMemberships).toHaveLength(1);
    expect((newMemberships[0].tenantId as ObjectId).equals(existingTenantId)).toBe(false);
    expect(data.memberships.filter((member) => (member.tenantId as ObjectId).equals(existingTenantId))).toHaveLength(1);
  });
});
