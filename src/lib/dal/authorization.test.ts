import { ObjectId } from "mongodb";
import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "../errors";
const mocks = vi.hoisted(() => ({ session: vi.fn(), db: vi.fn(), collection: vi.fn(), user: vi.fn(), tenant: vi.fn(), members: vi.fn(), locations: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../auth-session", () => ({ requireAuthenticatedSession: mocks.session }));
vi.mock("../mongodb", () => ({ getDb: mocks.db }));
import { requireTenantContext, requireLocationContext, requirePlatformAccess, requirePermission, requireTenantPermission } from "./authorization";
import { getTenantCollection, getLocationCollection, getPlatformCollection } from "./collections";
const uid = new ObjectId(); const tid = new ObjectId(); const lid = new ObjectId(); const foreign = new ObjectId();
let user: Record<string, unknown>; let member: Record<string, unknown>; let location: Record<string, unknown>; let tenant: Record<string, unknown>;
beforeEach(() => {
  vi.resetAllMocks();
  user = { _id: uid, status: "active" };
  member = { _id: new ObjectId(), userId: uid, tenantId: tid, role: "owner", status: "active", locationIds: [] };
  tenant = { _id: tid, status: "active" }; location = { _id: lid, tenantId: tid, status: "active" };
  mocks.session.mockResolvedValue({ user: { id: uid.toHexString(), role: "owner", tenantId: foreign.toHexString() }, session: { expiresAt: new Date(Date.now() + 60000).toISOString() } });
  mocks.user.mockImplementation(async () => user); mocks.tenant.mockImplementation(async () => tenant);
  mocks.members.mockImplementation(async () => [member]); mocks.locations.mockImplementation(async () => [location]);
  mocks.collection.mockImplementation((name: string) => ({ collectionName: name, findOne: name === "users" ? mocks.user : mocks.tenant, find: (filter: unknown) => { const fn = name === "memberships" ? mocks.members : mocks.locations; return { limit: () => ({ toArray: () => fn(filter) }) }; } }));
  mocks.db.mockResolvedValue({ collection: mocks.collection });
});
it("owner resolves active tenant and all active owned locations using BSON queries", async () => {
  expect((await requireTenantContext()).tenantId).toEqual(tid);
  expect((await requireLocationContext()).locationId).toEqual(lid);
  expect(mocks.members).toHaveBeenCalledWith({ userId: uid, status: "active" });
  expect(mocks.locations).toHaveBeenCalledWith({ tenantId: tid, status: "active" });
});
it.each(["admin", "staff"])("%s is restricted to assigned locations and cannot obtain tenant-wide DAL", async (role) => {
  member.role = role; member.locationIds = [lid];
  const context = await requireLocationContext(); expect(context.role).toBe(role);
  expect(mocks.locations).toHaveBeenCalledWith({ tenantId: tid, status: "active", _id: { $in: [lid] } });
  await expect(getTenantCollection("vehicles")).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it.each(["admin", "staff"])("%s without location assignments has no access", async (role) => {
  member.role = role; await expect(requireLocationContext()).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(mocks.locations).not.toHaveBeenCalled();
});
it("explicit selectors are validated and never used as authorization evidence", async () => {
  member.role = "staff"; member.locationIds = [lid];
  await expect(requireLocationContext({ tenantId: foreign.toHexString(), locationId: lid.toHexString() })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(requireLocationContext({ locationId: foreign.toHexString() })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(mocks.locations).not.toHaveBeenCalled();
});
it.each([{ tenantId: "invalid" }, { role: "owner" }, { permissions: ["memberships.manage"] }])("rejects invalid/privilege-bearing selection %j before DB access", async (input) => {
  await expect(requireLocationContext(input as never)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(mocks.db).not.toHaveBeenCalled();
});
it.each(["inactive", "locked"])("rejects %s users even if identity was previously authenticated", async (status) => {
  user.status = status; await expect(requireTenantContext()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});
it("missing authentication never opens DB", async () => {
  mocks.session.mockRejectedValue(new AppError("UNAUTHENTICATED"));
  await expect(requireTenantContext()).rejects.toMatchObject({ code: "UNAUTHENTICATED" }); expect(mocks.db).not.toHaveBeenCalled();
});
it.each([{ rows: [] }, { rows: [{ status: "inactive" }] }, { rows: [null] }, { rows: ["bad"] }])("rejects missing or malformed memberships %j", async ({ rows }) => {
  mocks.members.mockResolvedValue(rows); await expect(requireTenantContext()).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it.each(["userId", "tenantId"])("rejects membership with foreign %s", async (key) => {
  member[key] = foreign;
  await expect(requireTenantContext({ tenantId: tid.toHexString() })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("rejects duplicate/ambiguous memberships and locations", async () => {
  mocks.members.mockResolvedValue([member, { ...member, tenantId: foreign }]);
  await expect(requireTenantContext()).rejects.toMatchObject({ code: "FORBIDDEN" });
  mocks.members.mockResolvedValue([member]); mocks.locations.mockResolvedValue([location, { ...location, _id: foreign }]);
  await expect(requireLocationContext()).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it.each(["suspended", "archived"])("rejects %s tenants", async (status) => {
  tenant.status = status; await expect(requireLocationContext()).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it.each([{ tenantId: foreign }, { status: "inactive" }, { _id: foreign }])("rejects cross-tenant/inactive/mismatched locations %j", async (change) => {
  Object.assign(location, change); await expect(requireLocationContext({ locationId: lid.toHexString() })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it.each(["platform_admin", "unknown"])("rejects invalid tenant role %s", async (role) => {
  member.role = role; await expect(requireTenantContext()).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("staff cannot escalate using persisted financial/admin grants or session claims", async () => {
  member.role = "staff"; member.locationIds = [lid]; member.permissions = ["prepaid.refund", "transactions.correct", "memberships.manage", "prepaid.deposit"];
  await expect(requirePermission("prepaid.refund")).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(requirePermission("memberships.manage")).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await requirePermission("prepaid.deposit")).role).toBe("staff");
});
it("admin sensitive permissions require explicit DB grants, never broaden scope", async () => {
  member.role = "admin"; member.locationIds = [lid];
  await expect(requirePermission("prepaid.refund")).rejects.toMatchObject({ code: "FORBIDDEN" });
  member.permissions = ["prepaid.refund"]; expect((await requirePermission("prepaid.refund")).role).toBe("admin");
  await expect(requirePermission("prepaid.refund", { locationId: foreign.toHexString() })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("platform admin is DB-only and does not bypass operational memberships", async () => {
  await expect(requirePlatformAccess()).rejects.toMatchObject({ code: "FORBIDDEN" });
  user.platformRole = "platform_admin"; await expect(requirePlatformAccess()).resolves.toBeUndefined();
  mocks.members.mockResolvedValue([]); await expect(requireLocationContext()).rejects.toMatchObject({ code: "FORBIDDEN" });
  const handle = await getPlatformCollection("auditLogs"); expect(handle.scopedFilter()).toEqual({ $and: [{ tenantId: { $exists: false }, locationId: { $exists: false } }, {}] });
});
it("rechecks revocation on each request and sanitizes storage failures", async () => {
  await requireLocationContext(); member.status = "inactive";
  await expect(requireLocationContext()).rejects.toMatchObject({ code: "FORBIDDEN" });
  mocks.members.mockRejectedValue(new Error("sensitive database detail"));
  await expect(requireTenantContext()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
});
it("real DAL captures authorized scope and exposes no raw CRUD", async () => {
  member.role = "staff"; member.locationIds = [lid];
  const handle = await getLocationCollection("parkingSessions", { tenantId: tid.toHexString(), locationId: lid.toHexString() });
  expect(handle.scopedFilter({ tenantId: foreign, $or: [{ locationId: foreign }] })).toEqual({ $and: [{ tenantId: tid, locationId: lid }, { tenantId: foreign, $or: [{ locationId: foreign }] }] });
  expect("find" in handle).toBe(false); expect("collection" in handle).toBe(false);
});

it("real authorization integration fails closed for all accessors", async () => {
  mocks.session.mockRejectedValue(new AppError("UNAUTHENTICATED"));
  await expect(getTenantCollection("vehicles")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  await expect(getLocationCollection("parkingSessions")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  await expect(getPlatformCollection("users")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(mocks.db).not.toHaveBeenCalled();
});
it("rejects unknown persisted permission names instead of accepting corrupt grants", async () => {
  member.permissions = ["superuser"];
  await expect(requireTenantContext()).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("does not reuse roles or permissions across different tenant selections", async () => {
  await requireTenantContext({ tenantId: tid.toHexString() });
  member.tenantId = foreign; member.role = "staff"; member.locationIds = [lid]; location.tenantId = foreign; tenant._id = foreign;
  await expect(requireTenantContext({ tenantId: foreign.toHexString() })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await requireLocationContext({ tenantId: foreign.toHexString(), locationId: lid.toHexString() })).role).toBe("staff");
});

it("owner permissions cover tenant administration while admin remains location-scoped", async () => {
  expect((await requireTenantPermission("memberships.manage")).role).toBe("owner");
  member.role = "admin"; member.locationIds = [lid]; member.permissions = ["memberships.manage"];
  await expect(requireTenantPermission("memberships.manage")).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(requirePermission("memberships.manage")).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("rejects deleted users and expired sessions", async () => {
  mocks.user.mockResolvedValue(null);
  await expect(requirePlatformAccess()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  mocks.session.mockResolvedValue({ user: { id: uid.toHexString() }, session: { expiresAt: "2020-01-01T00:00:00Z" } });
  await expect(requireTenantContext()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});
it("rejects nonexistent tenants and locations", async () => {
  mocks.tenant.mockResolvedValue(null);
  await expect(requireTenantContext()).rejects.toMatchObject({ code: "FORBIDDEN" });
  mocks.tenant.mockResolvedValue(tenant); mocks.locations.mockResolvedValue([]);
  await expect(requireLocationContext()).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("rejects corrupt assignment arrays and unknown requested permission", async () => {
  member.locationIds = [lid, lid];
  await expect(requireLocationContext()).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(requirePermission("superuser" as never)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
