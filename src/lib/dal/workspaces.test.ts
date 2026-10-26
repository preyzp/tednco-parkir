import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../errors";
const mocks = vi.hoisted(() => ({ session: vi.fn(), db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../auth-session", () => ({ requireAuthenticatedSession: mocks.session }));
vi.mock("../mongodb", () => ({ getDb: mocks.db }));
import { listAuthorizedWorkspaces, requireLocationContext } from "./authorization";

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
