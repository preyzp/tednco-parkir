import { beforeEach, expect, it, vi } from "vitest";
import { validateProvisioning, provisionDevelopmentOwner, verifyProvisioningIndexes, developmentDatabase } from "./dev-provisioning-core.mjs";
import type { MongoClient, Db } from "mongodb";
const mocks = vi.hoisted(() => ({ hash: vi.fn() }));
vi.mock("better-auth/crypto", () => ({ hashPassword: mocks.hash }));
const env = () => ({ NODE_ENV: "development", TEDNCO_ENABLE_DEV_PROVISIONING: "1", MONGODB_DB_NAME: developmentDatabase, TEDNCO_DEV_OWNER_EMAIL: "Synthetic.Owner@example.test", TEDNCO_DEV_OWNER_PASSWORD: "synthetic-fixture-password-only", TEDNCO_DEV_WRITE_CONFIRMATION: "PROVISION_DEVELOPMENT_DATABASE", MONGODB_URI: "mongodb://localhost:27017" });
let writes: { collection: string; document: Record<string, unknown> }[];
let conflict: string | undefined; let failAt: string | undefined;
const find = vi.fn(); const indexes = vi.fn(); const end = vi.fn(); const transaction = vi.fn(); const dbCall = vi.fn();
const keys: Record<string, object> = { users: { email: 1 }, tenants: { slug: 1 }, memberships: { tenantId: 1, userId: 1 }, authAccounts: { providerId: 1, accountId: 1 } };
let client: MongoClient;
beforeEach(() => {
  vi.resetAllMocks(); end.mockResolvedValue(undefined); writes = []; conflict = undefined; failAt = undefined;
  mocks.hash.mockResolvedValue("library-generated-fixture-hash");
  indexes.mockImplementation((name: string) => [{ key: keys[name], unique: true }]);
  find.mockImplementation((name: string) => name === conflict ? { _id: "existing" } : null);
  const db = { collection: (name: string) => ({ listIndexes: () => ({ toArray: async () => indexes(name) }), findOne: async (query: unknown, options: unknown) => find(name, query, options), insertOne: async (document: Record<string, unknown>, options: { session: unknown }) => { expect(options.session).toBe(session); if (failAt === name) throw new Error("sensitive persistence details"); writes.push({ collection: name, document }); } }) };
  const session = { endSession: end, withTransaction: transaction };
  transaction.mockImplementation(async (work: () => Promise<void>) => { try { await work(); } catch (error) { writes = []; throw error; } });
  dbCall.mockReturnValue(db); client = { db: dbCall, startSession: () => session } as unknown as MongoClient;
});
it("defaults to an offline dry-run and normalizes email without changing password", () => {
  const result = validateProvisioning(env(), []);
  expect(result.apply).toBe(false); expect(result.email).toBe("synthetic.owner@example.test"); expect(result.password).toBe(env().TEDNCO_DEV_OWNER_PASSWORD);
  expect(dbCall).not.toHaveBeenCalled(); expect(mocks.hash).not.toHaveBeenCalled();
});
it.each([
  { NODE_ENV: "production" }, { NODE_ENV: "test" }, { TEDNCO_ENABLE_DEV_PROVISIONING: "" }, { MONGODB_DB_NAME: "production" },
  { TEDNCO_DEV_OWNER_EMAIL: "invalid" }, { TEDNCO_DEV_OWNER_PASSWORD: "short" }, { TEDNCO_DEV_OWNER_PASSWORD: "" },
])("rejects unsafe inputs without leaking values %j", (change) => {
  expect(() => validateProvisioning({ ...env(), ...change }, [])).toThrow(); expect(dbCall).not.toHaveBeenCalled();
});
it("requires explicit write confirmation and never accepts credential command arguments", () => {
  expect(() => validateProvisioning({ ...env(), TEDNCO_DEV_WRITE_CONFIRMATION: "" }, ["--apply"])).toThrow();
  expect(() => validateProvisioning(env(), ["--password=secret"])).toThrow();
  expect(() => validateProvisioning(env(), ["--apply", "--dry-run"])).toThrow();
});
it("cannot write with a default dry-run input", async () => {
  await expect(provisionDevelopmentOwner(client, validateProvisioning(env(), []))).rejects.toThrow("Apply mode"); expect(dbCall).not.toHaveBeenCalled();
});
it("creates exactly one identity/credential/tenant/location/membership/marker in a transaction", async () => {
  expect(await provisionDevelopmentOwner(client, validateProvisioning(env(), ["--apply"]))).toEqual({ ok: true, created: 6 });
  expect(transaction.mock.calls[0][1]).toEqual({ readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
  const user = writes.find((row) => row.collection === "users")!.document;
  const account = writes.find((row) => row.collection === "authAccounts")!.document;
  const member = writes.find((row) => row.collection === "memberships")!.document;
  expect(account.userId).toEqual(user._id); expect(account.accountId).toBe(String(user._id)); expect(account.providerId).toBe("credential");
  expect(account.password).toBe("library-generated-fixture-hash"); expect(user.password).toBeUndefined(); expect(user.platformRole).toBeUndefined();
  expect(member.role).toBe("owner"); expect(member.userId).toEqual(user._id); expect(writes.some((row) => row.collection === "authSessions")).toBe(false);
  expect(JSON.stringify(writes)).not.toContain(env().TEDNCO_DEV_OWNER_PASSWORD); expect(end).toHaveBeenCalledOnce();
});
it.each(["users", "tenants", "developmentProvisioning", "authAccounts"])("rejects an existing %s record without adopting or overwriting", async (collection) => {
  conflict = collection;
  await expect(provisionDevelopmentOwner(client, validateProvisioning(env(), ["--apply"]))).rejects.toThrow("not confirmed"); expect(writes).toEqual([]);
});
it.each(["developmentProvisioning", "users", "authAccounts", "tenants", "locations", "memberships"])("rolls back failures at %s (mock transaction)", async (collection) => {
  failAt = collection; await expect(provisionDevelopmentOwner(client, validateProvisioning(env(), ["--apply"]))).rejects.toThrow("not confirmed"); expect(writes).toEqual([]); expect(end).toHaveBeenCalledOnce();
});
it("rejects missing/sparse/partial unique indexes without creating indexes or writes", async () => {
  indexes.mockReturnValue([{ key: { email: 1 }, unique: true, sparse: true }]);
  await expect(provisionDevelopmentOwner(client, validateProvisioning(env(), ["--apply"]))).rejects.toThrow("not confirmed");
  expect(transaction).not.toHaveBeenCalled(); expect(mocks.hash).not.toHaveBeenCalled();
  await expect(verifyProvisioningIndexes(client.db() as Db)).rejects.toThrow("unique indexes");
});
it("hash failures are sanitized and do not start a transaction", async () => {
  mocks.hash.mockRejectedValue(new Error("sensitive password detail"));
  await expect(provisionDevelopmentOwner(client, validateProvisioning(env(), ["--apply"]))).rejects.toThrow("not confirmed"); expect(transaction).not.toHaveBeenCalled(); expect(end).toHaveBeenCalledOnce();
});
it("uses the real supported Better Auth password format", async () => {
  const crypto = await vi.importActual<typeof import("better-auth/crypto")>("better-auth/crypto");
  const password = env().TEDNCO_DEV_OWNER_PASSWORD; const hash = await crypto.hashPassword(password);
  expect(await crypto.verifyPassword({ hash, password })).toBe(true); expect(hash).not.toBe(password);
});

it("escapes literal email matching to prevent regex-based duplicate bypass", async () => {
  const input = validateProvisioning({ ...env(), TEDNCO_DEV_OWNER_EMAIL: "synthetic+owner@example.test" }, ["--apply"]);
  await provisionDevelopmentOwner(client, input);
  const call = find.mock.calls.find((row) => row[0] === "users")!;
  const regex = new RegExp(call[1].email.$regex, call[1].email.$options);
  expect(regex.test("SYNTHETIC+OWNER@example.test")).toBe(true);
  expect(regex.test("syntheticowner@exampleXtest")).toBe(false);
});
it("ambiguous transaction commit is reported as unconfirmed without compensating deletes", async () => {
  transaction.mockRejectedValue(new Error("UnknownTransactionCommitResult sensitive details"));
  await expect(provisionDevelopmentOwner(client, validateProvisioning(env(), ["--apply"]))).rejects.toThrow("not confirmed");
  expect(writes).toEqual([]); expect(end).toHaveBeenCalledOnce();
});
