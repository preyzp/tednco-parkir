import { beforeEach, expect, expectTypeOf, test, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { getSchema, parseUserInput, parseUserOutput } from "better-auth/db";
import type { AuthAccount, AuthSession, User } from "../types";

const mocks = vi.hoisted(() => ({ collection: vi.fn(), createIndex: vi.fn(), insertOne: vi.fn(), aggregate: vi.fn(), toArray: vi.fn(), getDb: vi.fn(), createIndexes: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./mongodb", () => ({ getDb: mocks.getDb }));
import { authSchemaOptions } from "./auth-schema";
import { authenticationIndexDefinitions, setupAuthenticationIndexes } from "./auth-indexes";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.collection.mockReturnValue({ createIndex: mocks.createIndex, insertOne: mocks.insertOne, aggregate: mocks.aggregate, createIndexes: mocks.createIndexes });
  mocks.getDb.mockResolvedValue({ collection: mocks.collection });
  mocks.aggregate.mockReturnValue({ toArray: mocks.toArray });
  mocks.createIndex.mockResolvedValue("index");
  mocks.createIndexes.mockResolvedValue([]);
  mocks.insertOne.mockImplementation(async (data) => ({ insertedId: data._id }));
});

test("one existing users model, no user password, and library credential/session schema", () => {
  const schema = getSchema(authSchemaOptions);
  expect(Object.keys(schema).sort()).toEqual(["authAccounts", "authRateLimits", "authSessions", "authVerifications", "users"]);
  expect(schema.users.fields).not.toHaveProperty("passwordHash");
  expect(schema.users.fields.emailVerified.type).toBe("boolean");
  expect(schema.authAccounts.fields.password.returned).toBe(false);
  expect(schema.authAccounts.fields.userId.references?.model).toBe("users");
  expect(schema.authSessions.fields.userId.references?.model).toBe("users");
  expectTypeOf<User>().not.toHaveProperty("passwordHash");
  expectTypeOf<AuthAccount["userId"]>().toEqualTypeOf<ObjectId>();
  expectTypeOf<AuthSession["userId"]>().toEqualTypeOf<ObjectId>();
});

test("privilege fields cannot be supplied or returned through library profile parsing", () => {
  expect(() => parseUserInput(authSchemaOptions, { name: "Synthetic", email: "synthetic@example.test", platformRole: "platform_admin" }, "create")).toThrow("not allowed");
  const input = parseUserInput(authSchemaOptions, { name: "Synthetic", email: "synthetic@example.test" }, "create");
  expect(input.platformRole).toBeUndefined();
  expect(input.status).toBe("inactive");
  expect(parseUserInput(authSchemaOptions, { status: "active" }, "create").status).toBe("inactive");
  const output = parseUserOutput(authSchemaOptions, { id: "synthetic", name: "Synthetic", email: "synthetic@example.test", emailVerified: false, createdAt: new Date(), updatedAt: new Date(), status: "active", platformRole: "platform_admin" });
  expect(output).not.toHaveProperty("platformRole");
  expect(output).not.toHaveProperty("status");
});

test("real adapter round-trips BSON ObjectId primary keys, references and query filters without IO", async () => {
  const db = { collection: mocks.collection } as unknown as Db;
  const adapter = mongodbAdapter(db)({ ...authSchemaOptions, logger: { disabled: true } });
  const now = new Date();
  const user = await adapter.create<{ id: string }>({ model: "user", data: { name: "Synthetic", email: "synthetic@example.test", emailVerified: false, status: "active", createdAt: now, updatedAt: now } });
  const userId = mocks.insertOne.mock.calls[0][0]._id as ObjectId;
  expect(mocks.collection).toHaveBeenCalledWith("users");
  expect(mocks.insertOne.mock.calls[0][0]._id).toEqual(userId);
  expect(user.id).toBe(userId.toHexString());
  for (const model of ["session", "account"] as const) {
    const data = { userId: userId.toHexString(), token: "synthetic", expiresAt: now, accountId: userId.toHexString(), providerId: "credential", password: "synthetic-hash", createdAt: now, updatedAt: now };
    const result = await adapter.create<{ userId: string }>({ model, data });
    const inserted = mocks.insertOne.mock.calls.at(-1)![0];
    expect(inserted._id).toBeInstanceOf(ObjectId);
    expect(inserted.userId).toEqual(userId);
    expect(result.userId).toBe(userId.toHexString());
    mocks.toArray.mockResolvedValueOnce([inserted]);
    const found = await adapter.findOne<{ userId: string }>({ model, where: [{ field: "userId", value: userId.toHexString() }] });
    expect(found?.userId).toBe(userId.toHexString());
    expect(JSON.stringify(mocks.aggregate.mock.calls.at(-1)![0])).toContain(userId.toHexString());
    expect(mocks.aggregate.mock.calls.at(-1)![0][0].$match.userId).toBeInstanceOf(ObjectId);
  }
});

test("explicit auth indexes match actual adapter first-write definitions and preserve existing user names", async () => {
  const definitions = authenticationIndexDefinitions();
  expect(definitions.users).toEqual([
    { name: "users_email_unique", key: { email: 1 }, unique: true },
    { name: "users_status", key: { status: 1 }, unique: false },
  ]);
  expect(definitions.authAccounts).toContainEqual({ name: "auth_accounts_provider_account_unique", key: { providerId: 1, accountId: 1 }, unique: true });
  expect(definitions.authSessions).toContainEqual({ name: "auth_sessions_token_unique", key: { token: 1 }, unique: true });
  expect(definitions.authRateLimits).toEqual([{ name: "auth_rate_limits_key_unique", key: { key: 1 }, unique: true }]);
  const adapter = mongodbAdapter({ collection: mocks.collection } as unknown as Db)(authSchemaOptions);
  await adapter.create({ model: "session", data: { userId: new ObjectId().toHexString(), token: "synthetic", expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date() } });
  expect(mocks.createIndex.mock.calls.map(([key, options]) => ({ ...options, key }))).toEqual(definitions.authSessions);
  await setupAuthenticationIndexes();
  expect(mocks.createIndexes).toHaveBeenCalledTimes(5);
});

test("index initialization is explicit and failures never expose driver diagnostics", async () => {
  vi.resetModules();
  await import("./auth-indexes");
  expect(mocks.getDb).not.toHaveBeenCalled();
  mocks.createIndexes.mockRejectedValueOnce(new Error("mongodb://synthetic:secret@host"));
  await expect(setupAuthenticationIndexes()).rejects.toThrow(/^Authentication index setup failed\. Review database indexes securely before retrying\.$/);
});
