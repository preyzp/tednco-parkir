import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../errors";
const mocks = vi.hoisted(() => ({ session: vi.fn(), db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../auth-session", () => ({ requireAuthenticatedSession: mocks.session }));
vi.mock("../mongodb", () => ({ getDb: mocks.db }));
import { hasPlatformAccess, listAuthorizedWorkspaces, requireLocationContext, requireOwnerAccount, requirePlatformAccess, requireTenantContext } from "./authorization";
import { getLocationCollection, getTenantCollection } from "./collections";

// Minimal filter-aware fake: equality, ObjectId equality and $in. Queries that
// forget tenant/assignment scoping therefore return foreign rows and fail tests.
type Row = Record<string, unknown>;
function equal(a: unknown, b: unknown) { return a instanceof ObjectId && b instanceof ObjectId ? a.equals(b) : a === b; }
function matches(row: Row, filter: Row) {
  return Object.entries(filter).every(([key, expected]) => expected && typeof expected === "object" && "$in" in expected ? (expected.$in as unknown[]).some((value) => equal(row[key], value)) : equal(row[key], expected));
}
let data: Record<string, Row[]>;
const fakeDb = { collection: (name: string) => ({
  findOne: async (filter: Row) => data[name].find((row) => matches(row, filter)) ?? null,
  find: (filter: Row) => ({ limit: (count: number) => ({ toArray: async () => data[name].filter((row) => matches(row, filter)).slice(0, count) }) }),
}) };

const ids = { owner: new ObjectId(), staff: new ObjectId(), admin: new ObjectId(), platform: new ObjectId(), t1: new ObjectId(), t2: new ObjectId(), suspended: new ObjectId(), l1: new ObjectId(), l2: new ObjectId(), l3: new ObjectId(), l4: new ObjectId(), l5: new ObjectId() };
function member(userId: ObjectId, tenantId: ObjectId, role: string, locationIds: ObjectId[] = [], extra: Row = {}) {
  return { _id: new ObjectId(), userId, tenantId, role, status: "active", locationIds, ...extra };
}
function signIn(userId: ObjectId) {
  mocks.session.mockResolvedValue({ user: { id: userId.toHexString() }, session: { expiresAt: new Date(Date.now() + 60_000).toISOString() } });
}
const hex = (id: ObjectId) => id.toHexString();
beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.mockResolvedValue(fakeDb);
  data = {
    users: [ids.owner, ids.staff, ids.admin].map((_id) => ({ _id, status: "active" })).concat({ _id: ids.platform, status: "active", platformRole: "platform_admin" } as never),
    tenants: [{ _id: ids.t1, name: "Parkir Sentosa", status: "active" }, { _id: ids.t2, name: "Parkir Lain", status: "active" }, { _id: ids.suspended, name: "Parkir Ditangguhkan", status: "suspended" }],
    locations: [
      { _id: ids.l1, tenantId: ids.t1, name: "Lokasi Utara", status: "active" },
      { _id: ids.l2, tenantId: ids.t1, name: "Lokasi Lama", status: "inactive" },
      { _id: ids.l4, tenantId: ids.t1, name: "Lokasi Barat", status: "active" },
      { _id: ids.l3, tenantId: ids.t2, name: "Lokasi Tenant Lain", status: "active" },
      { _id: ids.l5, tenantId: ids.suspended, name: "Lokasi Ditangguhkan", status: "active" },
    ],
    memberships: [
      member(ids.owner, ids.t1, "owner"),
      member(ids.owner, ids.suspended, "owner"),
      member(ids.staff, ids.t1, "staff", [ids.l1]),
      // Assignment points at an inactive location and a foreign-tenant location.
      member(ids.admin, ids.t1, "admin", [ids.l2, ids.l3]),
    ],
  };
});

describe("authorized workspace options", () => {
  it("owner sees every active location of active owned tenants only, as plain strings", async () => {
    signIn(ids.owner);
    const result = await listAuthorizedWorkspaces();
    expect(result).toEqual({ userId: hex(ids.owner), workspaces: [{ tenantId: hex(ids.t1), tenantName: "Parkir Sentosa", role: "owner", locations: [{ locationId: hex(ids.l4), name: "Lokasi Barat" }, { locationId: hex(ids.l1), name: "Lokasi Utara" }] }] });
    const serialized = JSON.stringify(result);
    for (const hidden of [ids.t2, ids.l3, ids.l2, ids.suspended, ids.l5]) expect(serialized).not.toContain(hex(hidden));
    expect(serialized).not.toMatch(/permissions|status/);
  });
  it("staff sees only the assigned active location", async () => {
    signIn(ids.staff);
    expect((await listAuthorizedWorkspaces()).workspaces).toEqual([{ tenantId: hex(ids.t1), tenantName: "Parkir Sentosa", role: "staff", locations: [{ locationId: hex(ids.l1), name: "Lokasi Utara" }] }]);
  });
  it("admin assignments to inactive or foreign-tenant locations grant nothing", async () => {
    signIn(ids.admin);
    expect((await listAuthorizedWorkspaces()).workspaces).toEqual([]);
  });
  it("platform_admin without membership gets no tenant options or operational context", async () => {
    signIn(ids.platform);
    expect((await listAuthorizedWorkspaces()).workspaces).toEqual([]);
    await expect(requireLocationContext({ tenantId: hex(ids.t1), locationId: hex(ids.l1) })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("platform_admin with an explicit membership is evaluated only by that tenant role", async () => {
    data.memberships.push(member(ids.platform, ids.t2, "staff", [ids.l3]));
    signIn(ids.platform);
    expect((await listAuthorizedWorkspaces()).workspaces.map((workspace) => [workspace.tenantId, workspace.role])).toEqual([[hex(ids.t2), "staff"]]);
    await expect(requireLocationContext({ tenantId: hex(ids.t1), locationId: hex(ids.l1) })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("skips malformed, duplicated, inactive and unassigned memberships", async () => {
    data.memberships.push(
      member(ids.staff, ids.t2, "staff", [ids.l3]), member(ids.staff, ids.t2, "staff", [ids.l3]),
      member(ids.staff, ids.t2, "superuser", [ids.l3]), member(ids.staff, ids.t1, "staff", [ids.l4], { status: "inactive" }),
      member(ids.staff, ids.t2, "staff", [ids.l3, ids.l3]), member(ids.staff, ids.t2, "admin", []),
    );
    signIn(ids.staff);
    expect((await listAuthorizedWorkspaces()).workspaces.map((workspace) => workspace.tenantId)).toEqual([hex(ids.t1)]);
  });
  it("rejects unauthenticated users before database access and sanitizes storage failures", async () => {
    mocks.session.mockRejectedValue(new AppError("UNAUTHENTICATED"));
    await expect(listAuthorizedWorkspaces()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(mocks.db).not.toHaveBeenCalled();
    signIn(ids.owner);
    mocks.db.mockRejectedValue(new Error("synthetic secret connection"));
    await expect(listAuthorizedWorkspaces()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", message: expect.not.stringContaining("synthetic") });
  });
});

describe("tenant status is enforced on every request of an active session", () => {
  const setStatus = (status: string) => { (data.tenants.find((row) => (row._id as ObjectId).equals(ids.t1)) as Row).status = status; };
  it.each(["suspended", "archived"])("%s immediately blocks Owner and Staff with an unchanged session, then reactivation restores access", async (status) => {
    for (const role of ["owner", "staff"] as const) {
      signIn(ids[role]);
      await expect(requireLocationContext({ tenantId: hex(ids.t1), locationId: hex(ids.l1) })).resolves.toBeTruthy();
      setStatus(status);
      // Same session cookie/identity; only the tenant document changed.
      expect((await listAuthorizedWorkspaces()).workspaces.map((workspace) => workspace.tenantId)).not.toContain(hex(ids.t1));
      await expect(requireLocationContext({ tenantId: hex(ids.t1), locationId: hex(ids.l1) })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(requireLocationContext()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(getLocationCollection("parkingSessions", { tenantId: hex(ids.t1), locationId: hex(ids.l1) })).rejects.toMatchObject({ code: "FORBIDDEN" });
      if (role === "owner") {
        await expect(requireTenantContext({ tenantId: hex(ids.t1) })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(getTenantCollection("vehicles", { tenantId: hex(ids.t1) })).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      setStatus("active");
      await expect(requireLocationContext({ tenantId: hex(ids.t1), locationId: hex(ids.l1) })).resolves.toBeTruthy();
    }
  });
  it("suspending one tenant does not affect another tenant or platform administration", async () => {
    data.memberships.push(member(ids.owner, ids.t2, "owner"));
    setStatus("suspended");
    signIn(ids.owner);
    expect((await listAuthorizedWorkspaces()).workspaces.map((workspace) => workspace.tenantId)).toEqual([hex(ids.t2)]);
    await expect(requireLocationContext({ tenantId: hex(ids.t2), locationId: hex(ids.l3) })).resolves.toBeTruthy();
    signIn(ids.platform);
    await expect(requirePlatformAccess()).resolves.toBeUndefined();
  });
});

describe("location status is enforced on every request of an active session", () => {
  const setLocation = (status: string) => { (data.locations.find((row) => (row._id as ObjectId).equals(ids.l1)) as Row).status = status; };
  it("deactivating a location blocks staff assigned only there and Owner use of it, while the Owner keeps other locations", async () => {
    signIn(ids.staff);
    await expect(requireLocationContext({ tenantId: hex(ids.t1), locationId: hex(ids.l1) })).resolves.toBeTruthy();
    setLocation("inactive");
    expect((await listAuthorizedWorkspaces()).workspaces).toEqual([]);
    await expect(requireLocationContext({ tenantId: hex(ids.t1), locationId: hex(ids.l1) })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getLocationCollection("parkingSessions", { tenantId: hex(ids.t1), locationId: hex(ids.l1) })).rejects.toMatchObject({ code: "FORBIDDEN" });
    signIn(ids.owner);
    expect((await listAuthorizedWorkspaces()).workspaces[0].locations.map((location) => location.locationId)).toEqual([hex(ids.l4)]);
    await expect(requireLocationContext({ tenantId: hex(ids.t1), locationId: hex(ids.l1) })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requireLocationContext({ tenantId: hex(ids.t1), locationId: hex(ids.l4) })).resolves.toBeTruthy();
    setLocation("active");
    signIn(ids.staff);
    await expect(requireLocationContext({ tenantId: hex(ids.t1), locationId: hex(ids.l1) })).resolves.toBeTruthy();
  });
});

describe("Owner account gate (change password)", () => {
  it("allows an active Owner of an active tenant", async () => {
    signIn(ids.owner);
    await expect(requireOwnerAccount()).resolves.toBeUndefined();
  });
  it.each(["staff", "admin", "platform"] as const)("denies %s accounts", async (who) => {
    signIn(ids[who]);
    await expect(requireOwnerAccount()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("denies an Owner whose only tenants are suspended or archived, and allows again after reactivation", async () => {
    signIn(ids.owner);
    const t1 = data.tenants.find((row) => (row._id as ObjectId).equals(ids.t1)) as Row;
    t1.status = "archived";
    await expect(requireOwnerAccount()).rejects.toMatchObject({ code: "FORBIDDEN" });
    t1.status = "active";
    await expect(requireOwnerAccount()).resolves.toBeUndefined();
  });
  it("denies inactive Owner memberships and unauthenticated callers", async () => {
    (data.memberships.find((row) => (row.userId as ObjectId).equals(ids.owner) && (row.tenantId as ObjectId).equals(ids.t1)) as Row).status = "inactive";
    signIn(ids.owner);
    await expect(requireOwnerAccount()).rejects.toMatchObject({ code: "FORBIDDEN" });
    mocks.session.mockRejectedValue(new AppError("UNAUTHENTICATED"));
    await expect(requireOwnerAccount()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("platform role isolation", () => {
  it("platform_admin passes the platform guard but gets no tenant or location context", async () => {
    signIn(ids.platform);
    expect(await hasPlatformAccess()).toBe(true);
    await expect(requirePlatformAccess()).resolves.toBeUndefined();
    await expect(requireTenantContext()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requireLocationContext()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it.each(["owner", "staff", "admin"] as const)("%s membership never grants platform access", async (role) => {
    signIn(ids[role]);
    expect(await hasPlatformAccess()).toBe(false);
    await expect(requirePlatformAccess()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("platform role is read fresh: revoking it or deactivating the user removes access immediately", async () => {
    signIn(ids.platform);
    expect(await hasPlatformAccess()).toBe(true);
    delete (data.users.find((row) => (row._id as ObjectId).equals(ids.platform)) as Row).platformRole;
    expect(await hasPlatformAccess()).toBe(false);
    await expect(requirePlatformAccess()).rejects.toMatchObject({ code: "FORBIDDEN" });
    (data.users.find((row) => (row._id as ObjectId).equals(ids.platform)) as Row).status = "inactive";
    await expect(requirePlatformAccess()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
  it("an unknown platformRole value fails closed", async () => {
    (data.users.find((row) => (row._id as ObjectId).equals(ids.owner)) as Row).platformRole = "super_admin";
    signIn(ids.owner);
    await expect(hasPlatformAccess()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requirePlatformAccess()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("location selection guard against the same data", () => {
  it("owner may select any active location within the owned tenant", async () => {
    signIn(ids.owner);
    for (const location of [ids.l1, ids.l4]) {
      const context = await requireLocationContext({ tenantId: hex(ids.t1), locationId: hex(location) });
      expect([context.role, hex(context.tenantId), hex(context.locationId)]).toEqual(["owner", hex(ids.t1), hex(location)]);
    }
  });
  it.each([
    ["owner", "foreign-tenant location", "t1", "l3"],
    ["owner", "inactive location", "t1", "l2"],
    ["owner", "missing location", "t1", "missing"],
    ["owner", "suspended tenant", "suspended", "l5"],
    ["owner", "tenant without membership", "t2", "l3"],
    ["staff", "unassigned location", "t1", "l4"],
    ["staff", "assigned location under a forged tenant", "t2", "l1"],
    ["admin", "inactive assigned location", "t1", "l2"],
    ["admin", "assigned foreign-tenant location", "t1", "l3"],
  ] as const)("%s cannot select %s", async (role, _case, tenant, location) => {
    signIn(ids[role]);
    const locationId = location === "missing" ? new ObjectId() : ids[location];
    await expect(requireLocationContext({ tenantId: hex(ids[tenant]), locationId: hex(locationId) })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("staff may select the assigned location and receives no tenant administration grants", async () => {
    signIn(ids.staff);
    const context = await requireLocationContext({ tenantId: hex(ids.t1), locationId: hex(ids.l1) });
    expect(hex(context.locationId)).toBe(hex(ids.l1));
    expect(context.permissions).not.toContain("memberships.manage");
  });
});
