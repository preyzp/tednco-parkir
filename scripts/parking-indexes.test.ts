import { execFileSync, spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import type { MongoClient } from "mongodb";
import { applyParkingIndexes, parkingIndexConfirmation, parkingIndexPlan, validateParkingIndexSetup } from "./parking-indexes-core.mjs";
import { developmentDatabase } from "./dev-provisioning-core.mjs";
const mocks = vi.hoisted(() => ({ createIndexes: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/mongodb", () => ({ getDb: async () => ({ collection: (name: string) => ({ createIndexes: (defs: unknown) => mocks.createIndexes(name, defs) }) }) }));

const env = () => ({ NODE_ENV: "development" as const, TEDNCO_ENABLE_DEV_PROVISIONING: "1", MONGODB_DB_NAME: developmentDatabase, TEDNCO_DEV_WRITE_CONFIRMATION: parkingIndexConfirmation, MONGODB_URI: "mongodb://localhost:27017" });
type Index = Record<string, unknown>;
function fakeClient(initial: Record<string, Index[]> = {}, duplicates: Record<string, number> = {}) {
  const store: Record<string, Index[]> = structuredClone(initial);
  const created: string[] = []; const forbidden = vi.fn();
  const client = { db: () => ({ collection: (name: string) => ({
    listIndexes: () => ({ toArray: async () => { if (!store[name]) throw new Error("ns not found"); return store[name]; } }),
    // Read-only duplicate pre-check for unique indexes still to be created.
    aggregate: () => ({ toArray: async () => (duplicates[name] ? [{ groups: duplicates[name] }] : []) }),
    createIndex: async (key: Index, options: Index) => { (store[name] ??= [{ name: "_id_", key: { _id: 1 } }]).push({ key, ...options }); created.push(`${name}.${options.name}`); },
    dropIndex: forbidden, dropIndexes: forbidden, insertOne: forbidden, updateOne: forbidden, deleteMany: forbidden,
  }) }) } as unknown as MongoClient;
  return { client, store, created, forbidden };
}

describe("index plan", () => {
  it("is identical to the application's index contract in src/lib/database-indexes.ts", async () => {
    const { setupDatabaseIndexes } = await import("../src/lib/database-indexes");
    await setupDatabaseIndexes();
    const fromApp = Object.fromEntries(mocks.createIndexes.mock.calls.filter(([name]) => name === "parkingSessions" || name === "vehicles" || name === "parkingTransactions" || name === "tariffs"));
    expect(fromApp).toEqual(JSON.parse(JSON.stringify(parkingIndexPlan)));
  });
  it("contains the unique partial index that prevents two active sessions per plate per location", () => {
    expect(parkingIndexPlan.parkingSessions).toContainEqual({ name: "parking_sessions_active_plate_unique", key: { tenantId: 1, locationId: 1, normalizedPlateSnapshot: 1 }, unique: true, partialFilterExpression: { status: "active" } });
    expect(parkingIndexPlan.vehicles.some((index) => "unique" in index)).toBe(false);
    expect(parkingIndexPlan.parkingTransactions).toContainEqual({ name: "parking_transactions_completed_session_unique", key: { tenantId: 1, parkingSessionId: 1 }, unique: true, partialFilterExpression: { status: "completed" } });
    expect(parkingIndexPlan.tariffs).toEqual([{ name: "tariffs_location_vehicle_tariff_active_unique", key: { tenantId: 1, locationId: 1, vehicleType: 1, tariffType: 1 }, unique: true, partialFilterExpression: { status: "active" } }]);
  });
});

describe("guards", () => {
  it.each([{ NODE_ENV: "production" }, { TEDNCO_ENABLE_DEV_PROVISIONING: "" }, { MONGODB_DB_NAME: "tednco_parkir_dev" }])("rejects unsafe environment %j", (change) => {
    expect(() => validateParkingIndexSetup({ ...env(), ...change }, [])).toThrow();
  });
  it("defaults to dry-run and requires its own confirmation for apply", () => {
    expect(validateParkingIndexSetup(env(), []).apply).toBe(false);
    expect(() => validateParkingIndexSetup({ ...env(), TEDNCO_DEV_WRITE_CONFIRMATION: "PROVISION_DEVELOPMENT_DATABASE" }, ["--apply"])).toThrow("confirmation");
    expect(() => validateParkingIndexSetup(env(), ["--apply", "--dry-run"])).toThrow();
  });
});

describe("apply", () => {
  const input = { apply: true, database: developmentDatabase };
  it("creates the eleven indexes on fresh collections and verifies them, without drops or document writes", async () => {
    const fake = fakeClient();
    const log = await applyParkingIndexes(fake.client, input);
    expect(fake.created).toHaveLength(11);
    expect(log.filter((line) => line.startsWith("PASS"))).toHaveLength(11);
    expect(fake.forbidden).not.toHaveBeenCalled();
  });
  it("is repeatable: identical indexes are skipped", async () => {
    const fake = fakeClient();
    await applyParkingIndexes(fake.client, input);
    const second = await applyParkingIndexes(fake.client, input);
    expect(second.filter((line) => line.startsWith("SKIP"))).toHaveLength(11);
    expect(fake.created).toHaveLength(11);
  });
  it("after the P4.5 apply (ten indexes present) it only adds the tariffs index", async () => {
    const applied = JSON.parse(JSON.stringify({ parkingSessions: parkingIndexPlan.parkingSessions, vehicles: parkingIndexPlan.vehicles, parkingTransactions: parkingIndexPlan.parkingTransactions }));
    const fake = fakeClient(applied);
    const log = await applyParkingIndexes(fake.client, input);
    expect(log.filter((line) => line.startsWith("SKIP"))).toHaveLength(10);
    expect(log.filter((line) => line.startsWith("CREATED"))).toEqual(["CREATED tariffs.tariffs_location_vehicle_tariff_active_unique"]);
    expect(fake.created).toEqual(["tariffs.tariffs_location_vehicle_tariff_active_unique"]);
    expect(fake.forbidden).not.toHaveBeenCalled();
  });
  it("stops before creating anything when active tariffs would violate the new unique index", async () => {
    const applied = JSON.parse(JSON.stringify({ parkingSessions: parkingIndexPlan.parkingSessions, vehicles: parkingIndexPlan.vehicles, parkingTransactions: parkingIndexPlan.parkingTransactions }));
    const fake = fakeClient(applied, { tariffs: 1 });
    await expect(applyParkingIndexes(fake.client, input)).rejects.toThrow("violate tariffs_location_vehicle_tariff_active_unique");
    expect(fake.created).toHaveLength(0); expect(fake.forbidden).not.toHaveBeenCalled();
  });
  it.each([
    ["same name, different options", { parkingSessions: [{ name: "parking_sessions_active_plate_unique", key: { tenantId: 1, locationId: 1, normalizedPlateSnapshot: 1 }, unique: true }] }],
    ["another index on the same key", { vehicles: [{ name: "custom", key: { tenantId: 1, normalizedPlate: 1 } }] }],
  ])("stops before creating anything on a conflict (%s)", async (_case, initial) => {
    const fake = fakeClient(initial);
    await expect(applyParkingIndexes(fake.client, input)).rejects.toThrow("Conflict");
    expect(fake.created).toHaveLength(0);
  });
});

describe("CLI", () => {
  const runtime = () => ({ ...process.env, ...env(), TEDNCO_DEV_WRITE_CONFIRMATION: "", MONGODB_URI: "invalid-uri-proves-offline-dry-run" });
  it("dry-run is offline and lists the plan", () => {
    const output = execFileSync(process.execPath, ["scripts/setup-parking-indexes.mjs"], { env: runtime(), encoding: "utf8" });
    expect(output).toContain("DRY RUN (offline)"); expect(output).toContain("parking_sessions_active_plate_unique");
    expect(output).not.toContain("invalid-uri");
  });
  it("apply without confirmation fails before connecting", () => {
    const result = spawnSync(process.execPath, ["scripts/setup-parking-indexes.mjs", "--apply"], { env: runtime(), encoding: "utf8" });
    expect(result.status).toBe(1); expect(result.stderr).toContain("not completed");
  });
});
