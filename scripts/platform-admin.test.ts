import { beforeEach, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import type { MongoClient } from "mongodb";
import { validatePlatformAdminBootstrap, bootstrapPlatformAdmin, platformAdminConfirmation } from "./platform-admin-core.mjs";
import { developmentDatabase } from "./dev-provisioning-core.mjs";
const mocks = vi.hoisted(() => ({ hash: vi.fn() }));
vi.mock("better-auth/crypto", () => ({ hashPassword: mocks.hash }));

const env = () => ({ NODE_ENV: "development" as const, TEDNCO_ENABLE_DEV_PROVISIONING: "1", MONGODB_DB_NAME: developmentDatabase, TEDNCO_DEV_PLATFORM_ADMIN_EMAIL: "Synthetic.Admin@example.test", TEDNCO_DEV_PLATFORM_ADMIN_PASSWORD: "synthetic-admin-fixture-password", TEDNCO_DEV_WRITE_CONFIRMATION: platformAdminConfirmation, MONGODB_URI: "mongodb://localhost:27017" });
type Query = Record<string, unknown>;
let writes: { collection: string; document: Record<string, unknown> }[];
let failAt: string | undefined;
const find = vi.fn(); const indexes = vi.fn(); const end = vi.fn(); const transaction = vi.fn(); const dbCall = vi.fn();
const mutations = { updateOne: vi.fn(), updateMany: vi.fn(), replaceOne: vi.fn(), findOneAndUpdate: vi.fn(), deleteOne: vi.fn(), deleteMany: vi.fn(), createIndex: vi.fn(), createIndexes: vi.fn() };
const keys: Record<string, object> = { users: { email: 1 }, authAccounts: { providerId: 1, accountId: 1 } };
let client: MongoClient;
beforeEach(() => {
  vi.resetAllMocks(); end.mockResolvedValue(undefined); writes = []; failAt = undefined;
  mocks.hash.mockResolvedValue("library-generated-fixture-hash");
  indexes.mockImplementation((name: string) => [{ key: keys[name], unique: true }]);
  find.mockResolvedValue(null);
  const session = { endSession: end, withTransaction: transaction };
  const db = { collection: (name: string) => ({ ...mutations, listIndexes: () => ({ toArray: async () => indexes(name) }), findOne: async (query: Query, options: unknown) => find(name, query, options), insertOne: async (document: Record<string, unknown>, options: { session: unknown }) => { expect(options.session).toBe(session); if (failAt === name) throw new Error("sensitive persistence details"); writes.push({ collection: name, document }); } }) };
  transaction.mockImplementation(async (work: () => Promise<void>) => { try { await work(); } catch (error) { writes = []; throw error; } });
  dbCall.mockReturnValue(db); client = { db: dbCall, startSession: () => session } as unknown as MongoClient;
});
const apply = () => bootstrapPlatformAdmin(client, validatePlatformAdminBootstrap(env(), ["--apply"]));
const noMutations = () => { for (const mutation of Object.values(mutations)) expect(mutation).not.toHaveBeenCalled(); };

it("defaults to an offline dry-run and normalizes email without changing password", () => {
  const result = validatePlatformAdminBootstrap(env(), []);
  expect(result).toMatchObject({ apply: false, email: "synthetic.admin@example.test", password: env().TEDNCO_DEV_PLATFORM_ADMIN_PASSWORD, name: "Platform Admin Pengembangan" });
  expect(dbCall).not.toHaveBeenCalled(); expect(mocks.hash).not.toHaveBeenCalled();
});
it.each([
  { NODE_ENV: "production" }, { NODE_ENV: "test" }, { TEDNCO_ENABLE_DEV_PROVISIONING: "" }, { MONGODB_DB_NAME: "tednco_parkir_dev" },
  { TEDNCO_DEV_PLATFORM_ADMIN_EMAIL: "invalid" }, { TEDNCO_DEV_PLATFORM_ADMIN_EMAIL: undefined }, { TEDNCO_DEV_PLATFORM_ADMIN_PASSWORD: "short" }, { TEDNCO_DEV_PLATFORM_ADMIN_PASSWORD: undefined },
])("rejects unsafe or missing inputs %j (no default password)", (change) => {
  expect(() => validatePlatformAdminBootstrap({ ...env(), ...change }, [])).toThrow(); expect(dbCall).not.toHaveBeenCalled();
});
it("requires its own explicit confirmation; the Owner confirmation cannot trigger it", () => {
  expect(() => validatePlatformAdminBootstrap({ ...env(), TEDNCO_DEV_WRITE_CONFIRMATION: "PROVISION_DEVELOPMENT_DATABASE" }, ["--apply"])).toThrow("confirmation");
  expect(() => validatePlatformAdminBootstrap({ ...env(), TEDNCO_DEV_WRITE_CONFIRMATION: "" }, ["--apply"])).toThrow();
  expect(() => validatePlatformAdminBootstrap(env(), ["--password=secret"])).toThrow();
  expect(() => validatePlatformAdminBootstrap(env(), ["--apply", "--dry-run"])).toThrow();
});
it("cannot write with a default dry-run input", async () => {
  await expect(bootstrapPlatformAdmin(client, validatePlatformAdminBootstrap(env(), []))).rejects.toThrow("Apply mode"); expect(dbCall).not.toHaveBeenCalled();
});
it("creates exactly one platform_admin, credential and marker in one transaction without tenant access", async () => {
  expect(await apply()).toEqual({ ok: true, created: 3 });
  expect(transaction.mock.calls[0][1]).toEqual({ readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
  expect(writes.map((row) => row.collection)).toEqual(["developmentProvisioning", "users", "authAccounts"]);
  const user = writes[1].document; const account = writes[2].document; const marker = writes[0].document;
  expect(user).toMatchObject({ email: "synthetic.admin@example.test", status: "active", platformRole: "platform_admin", emailVerified: false });
  expect(user.password).toBeUndefined();
  expect(account).toMatchObject({ userId: user._id, accountId: String(user._id), providerId: "credential", password: "library-generated-fixture-hash" });
  expect(String(marker._id)).toBe("000000000000000000000002"); expect(marker.kind).toBe("platform_admin");
  expect(JSON.stringify(writes)).not.toContain(env().TEDNCO_DEV_PLATFORM_ADMIN_PASSWORD);
  noMutations(); expect(end).toHaveBeenCalledOnce();
});
it("rejects an existing email (e.g. the Owner) in any letter case without promoting or mutating it", async () => {
  find.mockImplementation(async (name: string, query: { email?: { $regex: string; $options: string } }) => name === "users" && query.email && new RegExp(query.email.$regex, query.email.$options).test("SYNTHETIC.admin@EXAMPLE.test") ? { _id: "existing-owner" } : null);
  await expect(apply()).rejects.toThrow("not confirmed");
  expect(writes).toEqual([]); noMutations();
});
it("rejects a second platform_admin even with a different email", async () => {
  find.mockImplementation(async (name: string, query: Query) => name === "users" && query.platformRole === "platform_admin" ? { _id: "first-admin" } : null);
  await expect(apply()).rejects.toThrow("not confirmed");
  expect(writes).toEqual([]); noMutations();
});
it("rejects a repeated run when the one-time marker exists", async () => {
  find.mockImplementation(async (name: string) => name === "developmentProvisioning" ? { _id: "marker" } : null);
  await expect(apply()).rejects.toThrow("not confirmed"); expect(writes).toEqual([]);
});
it("checks credential duplicates with the exact Better Auth key that is written", async () => {
  await apply();
  const account = writes.find((row) => row.collection === "authAccounts")!.document;
  expect(find.mock.calls.find(([name]) => name === "authAccounts")![1]).toEqual({ $or: [{ providerId: "credential", accountId: account.accountId }, { userId: account.userId }] });
});
it("a concurrent run that loses the unique marker race leaves no partial writes", async () => {
  // The second transaction sees no conflicts (snapshot) but its marker insert hits duplicate _id.
  failAt = "developmentProvisioning";
  await expect(apply()).rejects.toThrow("not confirmed"); expect(writes).toEqual([]);
});
it.each(["users", "authAccounts"])("rolls back a failure at %s (mock transaction)", async (collection) => {
  failAt = collection;
  await expect(apply()).rejects.toThrow("not confirmed"); expect(writes).toEqual([]); expect(end).toHaveBeenCalledOnce();
});
it("refuses to run without compatible unique indexes and never creates them", async () => {
  indexes.mockReturnValue([{ key: { email: 1 }, unique: true, partialFilterExpression: {} }]);
  await expect(apply()).rejects.toThrow("not confirmed");
  expect(transaction).not.toHaveBeenCalled(); expect(mocks.hash).not.toHaveBeenCalled(); noMutations();
});
it("sanitizes hash failures and does not start a transaction", async () => {
  mocks.hash.mockRejectedValue(new Error("synthetic secret"));
  const error = await apply().then(() => undefined, (caught: Error) => caught);
  expect(error?.message).toContain("not confirmed"); expect(error?.message).not.toContain("synthetic"); expect(transaction).not.toHaveBeenCalled();
});

const runtime = () => ({ ...process.env, ...env(), TEDNCO_DEV_WRITE_CONFIRMATION: "", MONGODB_URI: "invalid-uri-proves-offline-dry-run" });
it("CLI default dry-run is offline and prints no inputs", () => {
  const output = execFileSync(process.execPath, ["scripts/bootstrap-platform-admin.mjs"], { env: runtime(), encoding: "utf8" });
  expect(output).toContain("DRY RUN (offline)"); expect(output).toContain("No tenant or membership");
  for (const secret of [runtime().TEDNCO_DEV_PLATFORM_ADMIN_PASSWORD, runtime().MONGODB_URI, "synthetic.admin"]) expect(output.toLowerCase()).not.toContain(secret.toLowerCase());
});
it("CLI apply without its confirmation fails before connecting and prints no inputs", () => {
  const result = spawnSync(process.execPath, ["scripts/bootstrap-platform-admin.mjs", "--apply"], { env: runtime(), encoding: "utf8" });
  expect(result.status).toBe(1); expect(result.stderr).toContain("not confirmed");
  expect(result.stderr).not.toContain(runtime().TEDNCO_DEV_PLATFORM_ADMIN_PASSWORD); expect(result.stderr).not.toContain(runtime().MONGODB_URI);
});
it("CLI production mode is rejected even when opt-in is present", () => {
  const result = spawnSync(process.execPath, ["scripts/bootstrap-platform-admin.mjs"], { env: { ...runtime(), NODE_ENV: "production" }, encoding: "utf8" });
  expect(result.status).toBe(1); expect(result.stdout).not.toContain("committed");
});
it.each([["5 characters", "abcde", false], ["exactly 6 characters", "abcdef", true], ["a longer password", "a-much-longer-password-1234", true], ["128 characters", "x".repeat(128), true], ["129 characters", "x".repeat(129), false]])("Platform Admin bootstrap password policy: %s", (_case, password, accepted) => {
  const run = () => validatePlatformAdminBootstrap({ ...env(), TEDNCO_DEV_PLATFORM_ADMIN_PASSWORD: password }, []);
  if (accepted) expect(run().password).toBe(password); else expect(run).toThrow("6-128");
});
