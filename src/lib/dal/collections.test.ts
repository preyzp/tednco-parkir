import { ObjectId, type Filter } from "mongodb";
import { beforeEach, expect, expectTypeOf, test, vi } from "vitest";
import type { ParkingSession, Vehicle } from "../../types";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(), collection: vi.fn(), tenant: vi.fn(), location: vi.fn(), platform: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../mongodb", () => ({ getDb: mocks.getDb }));
vi.mock("./authorization", () => ({
  requireTenantContext: mocks.tenant,
  requireLocationContext: mocks.location,
  requirePlatformAccess: mocks.platform,
}));

import { getTenantCollection, getLocationCollection, getPlatformCollection } from "./index";

const tenantId = new ObjectId("000000000000000000000001");
const locationId = new ObjectId("000000000000000000000002");
const foreignId = new ObjectId("000000000000000000000003");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getDb.mockResolvedValue({ collection: mocks.collection });
  mocks.collection.mockImplementation((name: string) => ({ collectionName: name }));
  mocks.tenant.mockResolvedValue({ tenantId });
  mocks.location.mockResolvedValue({ tenantId, locationId });
  mocks.platform.mockResolvedValue(undefined);
});

test("import does not acquire a database", async () => {
  vi.resetModules();
  await import("./index");
  expect(mocks.getDb).not.toHaveBeenCalled();
});

test.each(["tenants", "locations", "memberships", "vehicles", "auditLogs"] as const)(
  "maps tenant collection %s and scopes it", async (name) => {
    const handle = await getTenantCollection(name);
    expect(mocks.collection).toHaveBeenCalledWith(name);
    expect(handle.collectionName).toBe(name);
    expect(handle.scopedFilter()).toEqual({
      $and: [name === "tenants" ? { _id: tenantId } : { tenantId }, {}],
    });
    expect(mocks.tenant).toHaveBeenCalledOnce();
    expect(mocks.location).not.toHaveBeenCalled();
    expect(mocks.platform).not.toHaveBeenCalled();
  },
);

test.each([
  "locations", "parkingSessions", "tariffs", "parkingTransactions",
  "prepaidAccounts", "prepaidLedger", "auditLogs",
] as const)("maps location collection %s with both constraints", async (name) => {
  const handle = await getLocationCollection(name);
  expect(mocks.collection).toHaveBeenCalledWith(name);
  expect(handle.scopedFilter()).toEqual({
    $and: [name === "locations" ? { tenantId, _id: locationId } : { tenantId, locationId }, {}],
  });
  expect(mocks.location).toHaveBeenCalledOnce();
  expect(mocks.tenant).not.toHaveBeenCalled();
  expect(mocks.platform).not.toHaveBeenCalled();
});

test.each(["tenants", "users", "auditLogs"] as const)("maps platform collection %s separately", async (name) => {
  const handle = await getPlatformCollection(name);
  expect(mocks.collection).toHaveBeenCalledWith(name);
  expect(mocks.platform).toHaveBeenCalledOnce();
  expect(handle.scopedFilter()).toEqual({ $and: [name === "auditLogs"
    ? { tenantId: { $exists: false }, locationId: { $exists: false } } : {}, {}] });
});

test("conflicting tenant/location, $or and $and criteria cannot replace the guard", async () => {
  const handle = await getLocationCollection("parkingSessions");
  const criteria: Filter<ParkingSession> = {
    tenantId: foreignId, locationId: foreignId,
    $or: [{ tenantId: foreignId }, { status: "active" }],
    $and: [{ locationId: foreignId }],
  };
  expect(handle.scopedFilter(criteria)).toEqual({ $and: [{ tenantId, locationId }, criteria] });
  expect(criteria.tenantId).toBe(foreignId);
});

test("tenant filter cannot be overwritten by conflicting criteria", async () => {
  const handle = await getTenantCollection("vehicles");
  expect(handle.scopedFilter({ tenantId: foreignId })).toEqual({
    $and: [{ tenantId }, { tenantId: foreignId }],
  });
});

test("context changes and returned filter mutations cannot alter captured scope", async () => {
  const context = { tenantId, locationId };
  mocks.location.mockResolvedValue(context);
  const handle = await getLocationCollection("tariffs");
  context.tenantId = foreignId;
  context.locationId = foreignId;
  const filter = handle.scopedFilter();
  const guard = filter.$and![0];
  guard.tenantId = foreignId;
  guard.locationId = foreignId;
  expect(handle.scopedFilter()).toEqual({ $and: [{ tenantId, locationId }, {}] });
});

test("separate requests do not share tenant context", async () => {
  const first = await getTenantCollection("vehicles");
  mocks.tenant.mockResolvedValue({ tenantId: foreignId });
  const second = await getTenantCollection("vehicles");
  expect(first.scopedFilter()).toEqual({ $and: [{ tenantId }, {}] });
  expect(second.scopedFilter()).toEqual({ $and: [{ tenantId: foreignId }, {}] });
  expect(mocks.tenant).toHaveBeenCalledTimes(2);
});

test("authorization denial stops every accessor before database acquisition", async () => {
  const denied = new Error("Denied");
  mocks.tenant.mockRejectedValue(denied);
  mocks.location.mockRejectedValue(denied);
  mocks.platform.mockRejectedValue(denied);
  await expect(getTenantCollection("vehicles")).rejects.toThrow("Denied");
  await expect(getLocationCollection("tariffs")).rejects.toThrow("Denied");
  await expect(getPlatformCollection("users")).rejects.toThrow("Denied");
  expect(mocks.getDb).not.toHaveBeenCalled();
});

test.each(["tenant", "location", "platform"] as const)(
  "%s accessor waits for authorization and never acquires a database after delayed denial", async (scope) => {
    let deny!: (reason: Error) => void;
    mocks[scope].mockReturnValue(new Promise<never>((_resolve, reject) => { deny = reject; }));
    const pending = scope === "tenant" ? getTenantCollection("vehicles")
      : scope === "location" ? getLocationCollection("parkingSessions")
      : getPlatformCollection("users");
    const rejected = expect(pending).rejects.toThrow("Denied");
    await Promise.resolve();
    expect(mocks[scope]).toHaveBeenCalledOnce();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.collection).not.toHaveBeenCalled();
    deny(new Error("Denied"));
    await rejected;
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.collection).not.toHaveBeenCalled();
  },
);

test("mutating original ObjectId bytes cannot change an acquired location scope", async () => {
  const sourceTenant = new ObjectId(tenantId.toHexString());
  const sourceLocation = new ObjectId(locationId.toHexString());
  mocks.location.mockResolvedValue({ tenantId: sourceTenant, locationId: sourceLocation });
  const handle = await getLocationCollection("parkingSessions");
  sourceTenant.id = foreignId.id;
  sourceLocation.id = foreignId.id;
  expect(handle.scopedFilter()).toEqual({ $and: [{ tenantId, locationId }, {}] });
});

test("malformed authorized context cannot acquire a database", async () => {
  mocks.tenant.mockResolvedValue({ tenantId: "unverified-client-id" });
  mocks.location.mockResolvedValue({ tenantId, locationId: undefined });
  await expect(getTenantCollection("vehicles")).rejects.toThrow("Invalid authorized database scope");
  await expect(getLocationCollection("tariffs")).rejects.toThrow("Invalid authorized database scope");
  expect(mocks.getDb).not.toHaveBeenCalled();
});

test("runtime allowlists block cross-scope collection names", async () => {
  // Intentional type errors emulate untyped input without widening the API.
  // @ts-expect-error global identities are not tenant collections
  await expect(getTenantCollection("users")).rejects.toThrow("not available");
  // @ts-expect-error location collections cannot be opened tenant-wide
  await expect(getTenantCollection("parkingSessions")).rejects.toThrow("not available");
  // @ts-expect-error operational data cannot be accessed through platform API
  await expect(getPlatformCollection("vehicles")).rejects.toThrow("not available");
  // @ts-expect-error arbitrary names are not permitted
  await expect(getLocationCollection("unknown")).rejects.toThrow("not available");
  expect(mocks.getDb).not.toHaveBeenCalled();
});

test("typed handles do not expose raw driver APIs", async () => {
  const vehicles = await getTenantCollection("vehicles");
  const sessions = await getLocationCollection("parkingSessions");
  expectTypeOf(vehicles.scopedFilter()).toEqualTypeOf<Filter<Vehicle>>();
  expectTypeOf(sessions.scopedFilter()).toEqualTypeOf<Filter<ParkingSession>>();
  expectTypeOf(vehicles).not.toHaveProperty("find");
  expectTypeOf(vehicles).not.toHaveProperty("collection");
  expectTypeOf(vehicles).not.toHaveProperty("db");
  expect(Object.keys(vehicles)).toEqual([]);
});

test("tenant/location document _id constraints cannot be overridden", async () => {
  const tenant = await getTenantCollection("tenants");
  const location = await getLocationCollection("locations");
  expect(tenant.scopedFilter({ _id: foreignId })).toEqual({ $and: [{ _id: tenantId }, { _id: foreignId }] });
  expect(location.scopedFilter({ _id: foreignId, tenantId: foreignId })).toEqual({
    $and: [{ tenantId, _id: locationId }, { _id: foreignId, tenantId: foreignId }],
  });
});

test("platform audit criteria cannot include tenant operational records", async () => {
  const handle = await getPlatformCollection("auditLogs");
  expect(handle.scopedFilter({ tenantId })).toEqual({
    $and: [{ tenantId: { $exists: false }, locationId: { $exists: false } }, { tenantId }],
  });
});

test("location scope rejects a malformed tenant even with a valid location", async () => {
  mocks.location.mockResolvedValue({ tenantId: "untrusted", locationId });
  await expect(getLocationCollection("parkingSessions")).rejects.toThrow("Invalid authorized database scope");
  expect(mocks.getDb).not.toHaveBeenCalled();
  expect(mocks.collection).not.toHaveBeenCalled();
});
