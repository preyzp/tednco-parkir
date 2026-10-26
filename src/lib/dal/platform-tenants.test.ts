import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../errors";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), db: vi.fn(), accessed: [] as string[], calls: [] as { name: string; op: string; arg: unknown }[] }));
vi.mock("server-only", () => ({}));
vi.mock("./authorization", () => ({ requirePlatformAccess: mocks.guard }));
vi.mock("../mongodb", () => ({ getDb: mocks.db }));
import { getPlatformOverview, getPlatformTenantDetail, listPlatformTenants, parseTenantListQuery, tenantPageSize } from "./platform-tenants";

type Row = Record<string, unknown>;
const equal = (a: unknown, b: unknown) => (a instanceof ObjectId && b instanceof ObjectId ? a.equals(b) : a === b);
function matches(row: Row, filter: Row) {
  return Object.entries(filter).every(([key, expected]) => {
    if (expected && typeof expected === "object" && "$in" in expected) return (expected.$in as unknown[]).some((value) => equal(row[key], value));
    if (expected && typeof expected === "object" && "$regex" in expected) return new RegExp(String(expected.$regex), String((expected as Row).$options ?? "")).test(String(row[key]));
    return equal(row[key], expected);
  });
}
let data: Record<string, Row[]>;
const fakeDb = { collection: (name: string) => {
  mocks.accessed.push(name);
  return {
    findOne: async (filter: Row, options: { projection: Row }) => {
      mocks.calls.push({ name, op: "findOne", arg: { filter, options } });
      const row = (data[name] ?? []).find((item) => matches(item, filter));
      return row ? Object.fromEntries(Object.keys(options.projection).filter((key) => key in row).map((key) => [key, row[key]])) : null;
    },
    countDocuments: async (filter: Row) => { mocks.calls.push({ name, op: "count", arg: filter }); return data[name].filter((row) => matches(row, filter)).length; },
    find: (filter: Row, options: { projection: Row }) => {
      mocks.calls.push({ name, op: "find", arg: { filter, options } });
      let skip = 0; let limit = Infinity;
      const cursor = {
        sort: () => cursor, skip: (count: number) => { skip = count; return cursor; }, limit: (count: number) => { limit = count; return cursor; },
        toArray: async () => data[name].filter((row) => matches(row, filter))
          .sort((a, b) => (a.createdAt instanceof Date && b.createdAt instanceof Date ? b.createdAt.getTime() - a.createdAt.getTime() : 0))
          .slice(skip, skip + limit)
          .map((row) => Object.fromEntries(Object.keys(options.projection).filter((key) => key in row).map((key) => [key, row[key]]))),
      };
      return cursor;
    },
    aggregate: (pipeline: Row[]) => {
      mocks.calls.push({ name, op: "aggregate", arg: pipeline });
      const match = (pipeline[0] as { $match: Row }).$match;
      return { toArray: async () => {
        const counts = new Map<string, { _id: ObjectId; count: number }>();
        for (const row of data[name].filter((item) => matches(item, match))) {
          const id = row.tenantId as ObjectId; const entry = counts.get(id.toHexString()) ?? { _id: id, count: 0 }; entry.count++; counts.set(id.toHexString(), entry);
        }
        return [...counts.values()];
      } };
    },
  };
} };

const day = (n: number) => new Date(Date.UTC(2026, 0, n));
function tenant(name: string, status: string, created: number, extra: Row = {}) { return { _id: new ObjectId(), name, slug: name.toLowerCase().replace(/\W+/g, "-"), status, timezone: "Asia/Jakarta", createdAt: day(created), updatedAt: day(created), ...extra }; }
beforeEach(() => {
  vi.resetAllMocks(); mocks.accessed.length = 0; mocks.calls.length = 0;
  mocks.guard.mockResolvedValue(undefined); mocks.db.mockResolvedValue(fakeDb);
  const tenants = [tenant("Parkir Sentosa", "active", 1), tenant("Parkir Mitra", "suspended", 2), tenant("Gudang Arsip", "archived", 3), tenant("Parkir (Pusat)", "active", 4)];
  data = {
    tenants,
    locations: [
      { _id: new ObjectId(), tenantId: tenants[0]._id, name: "A", status: "active" },
      { _id: new ObjectId(), tenantId: tenants[0]._id, name: "B", status: "inactive" },
      { _id: new ObjectId(), tenantId: tenants[3]._id, name: "C", status: "active" },
    ],
  };
});

describe("platform authorization comes first", () => {
  it.each([["overview", () => getPlatformOverview()], ["list", () => listPlatformTenants({ page: 1 })]] as const)("%s rejects non-platform callers before any database access", async (_name, run) => {
    for (const code of ["UNAUTHENTICATED", "FORBIDDEN"] as const) {
      mocks.guard.mockRejectedValueOnce(new AppError(code));
      await expect(run()).rejects.toMatchObject({ code });
    }
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("sanitizes storage failures as unavailable", async () => {
    mocks.db.mockRejectedValue(new Error("synthetic secret connection"));
    await expect(getPlatformOverview()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", message: expect.not.stringContaining("synthetic") });
  });
  it("only reads the tenant directory and location counts, never operational collections", async () => {
    await getPlatformOverview(); await listPlatformTenants({ q: "parkir", status: "active", page: 1 });
    expect(new Set(mocks.accessed)).toEqual(new Set(["tenants", "locations"]));
    for (const call of mocks.calls.filter((item) => item.op === "find")) expect((call.arg as { options: { projection: Row } }).options.projection).toEqual({ _id: 1, name: 1, status: 1, createdAt: 1 });
  });
});

describe("overview", () => {
  it("counts tenants and locations from the database and lists the newest tenants", async () => {
    const overview = await getPlatformOverview();
    expect(overview).toMatchObject({ totalTenants: 4, activeTenants: 2, inactiveTenants: 2, totalLocations: 3 });
    expect(overview.recentTenants.map((row) => [row.name, row.status, row.locationCount])).toEqual([["Parkir (Pusat)", "active", 1], ["Gudang Arsip", "archived", 0], ["Parkir Mitra", "suspended", 0], ["Parkir Sentosa", "active", 2]]);
    expect(overview.recentTenants[0]).toEqual({ id: (data.tenants[3]._id as ObjectId).toHexString(), name: "Parkir (Pusat)", status: "active", locationCount: 1, createdAt: day(4).toISOString() });
    expect(JSON.stringify(overview)).not.toMatch(/slug|timezone|updatedAt/);
  });
  it("returns zeros and an empty list for an empty platform", async () => {
    data.tenants = []; data.locations = [];
    expect(await getPlatformOverview()).toEqual({ totalTenants: 0, activeTenants: 0, inactiveTenants: 0, totalLocations: 0, recentTenants: [] });
    expect(mocks.calls.some((call) => call.op === "aggregate")).toBe(false);
  });
  it("maps malformed tenant records defensively instead of failing or leaking", async () => {
    data.tenants = [{ _id: new ObjectId(), status: "weird", createdAt: "not-a-date" }];
    expect((await getPlatformOverview()).recentTenants[0]).toMatchObject({ name: "Tanpa nama", status: "unknown", createdAt: null, locationCount: 0 });
  });
});

describe("tenant list", () => {
  it("searches names case-insensitively with regex metacharacters escaped", async () => {
    expect((await listPlatformTenants({ q: "PARKIR", page: 1 })).rows.map((row) => row.name)).toEqual(["Parkir (Pusat)", "Parkir Mitra", "Parkir Sentosa"]);
    expect((await listPlatformTenants({ q: "(pusat)", page: 1 })).rows.map((row) => row.name)).toEqual(["Parkir (Pusat)"]);
    expect((await listPlatformTenants({ q: ".*", page: 1 })).total).toBe(0);
  });
  it("filters by status and combines with search", async () => {
    expect((await listPlatformTenants({ status: "suspended", page: 1 })).rows.map((row) => row.name)).toEqual(["Parkir Mitra"]);
    expect((await listPlatformTenants({ q: "parkir", status: "active", page: 1 })).total).toBe(2);
  });
  it("paginates on the server and clamps out-of-range pages", async () => {
    data.tenants = Array.from({ length: tenantPageSize + 5 }, (_, index) => tenant(`Tenant ${index}`, "active", index + 1));
    const first = await listPlatformTenants({ page: 1 });
    expect([first.rows.length, first.total, first.pageCount, first.page]).toEqual([tenantPageSize, tenantPageSize + 5, 2, 1]);
    const last = await listPlatformTenants({ page: 99 });
    expect([last.page, last.rows.length]).toEqual([2, 5]);
    // Location counts are only computed for the tenants on the current page.
    const pipeline = mocks.calls.filter((call) => call.op === "aggregate").at(-1)!.arg as { $match: { tenantId: { $in: ObjectId[] } } }[];
    expect(pipeline[0].$match.tenantId.$in).toHaveLength(5);
  });
});

describe("tenant detail", () => {
  it("authorizes before reading and returns null for malformed ids without querying", async () => {
    mocks.guard.mockRejectedValueOnce(new AppError("FORBIDDEN"));
    await expect(getPlatformTenantDetail((data.tenants[0]._id as ObjectId).toHexString())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.db).not.toHaveBeenCalled();
    expect(await getPlatformTenantDetail("not-an-id")).toBeNull();
    expect(mocks.db).not.toHaveBeenCalled();
    expect(await getPlatformTenantDetail(new ObjectId().toHexString())).toBeNull();
  });
  it("returns the profile, its own locations and Owner contacts only", async () => {
    const [target, other] = data.tenants as { _id: ObjectId }[];
    const ownerId = new ObjectId(); const staffId = new ObjectId();
    data.users = [{ _id: ownerId, name: "Budi", email: "budi@example.test", status: "active" }, { _id: staffId, name: "Staf", email: "staf@example.test", status: "active" }];
    data.memberships = [
      { _id: new ObjectId(), tenantId: target._id, userId: ownerId, role: "owner", status: "active" },
      { _id: new ObjectId(), tenantId: target._id, userId: staffId, role: "staff", status: "active" },
      { _id: new ObjectId(), tenantId: other._id, userId: staffId, role: "owner", status: "active" },
    ];
    const detail = await getPlatformTenantDetail(target._id.toHexString());
    expect(detail).toMatchObject({ id: target._id.toHexString(), name: "Parkir Sentosa", slug: "parkir-sentosa", status: "active", timezone: "Asia/Jakarta" });
    expect(detail?.locations.map((location) => location.name).sort()).toEqual(["A", "B"]);
    expect(detail?.owners).toEqual([{ userId: ownerId.toHexString(), name: "Budi", email: "budi@example.test", accountStatus: "active", membershipStatus: "active" }]);
    expect(new Set(mocks.accessed)).toEqual(new Set(["tenants", "locations", "memberships", "users"]));
    const userQuery = mocks.calls.find((call) => call.name === "users")!.arg as { options: { projection: Row } };
    expect(userQuery.options.projection).toEqual({ _id: 1, name: 1, email: 1, status: 1 });
  });
});

describe("URL query parsing", () => {
  it.each([
    [{}, { page: 1 }],
    [{ q: "  Sentosa  ", status: "active", page: "2" }, { q: "Sentosa", status: "active", page: 2 }],
    [{ status: "deleted", page: "-3" }, { page: 1 }],
    [{ status: ["archived", "active"], q: ["a", "b"], page: "1.5" }, { q: "a", status: "archived", page: 1 }],
    [{ page: "999999999" }, { page: 10000 }],
    [{ q: "   " }, { page: 1 }],
  ])("normalizes %j", (input, expected) => {
    expect(parseTenantListQuery(input)).toEqual(expected);
  });
  it("truncates long search input", () => {
    expect(parseTenantListQuery({ q: "x".repeat(300) }).q).toHaveLength(100);
  });
});
