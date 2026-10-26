import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ObjectId } from "mongodb";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), getMongoClient: vi.fn(), collection: vi.fn(), findOne: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./mongodb", () => ({ getDb: mocks.getDb, getMongoClient: mocks.getMongoClient }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
  vi.stubEnv("BETTER_AUTH_SECRET", "synthetic-test-secret-with-entropy-0123456789");
  vi.stubEnv("BETTER_AUTH_URL", "https://parkir.example.test");
  mocks.getDb.mockResolvedValue({ collection: mocks.collection });
  mocks.getMongoClient.mockResolvedValue({ startSession: () => ({
    withTransaction: async (work: () => Promise<unknown>) => work(),
    endSession: async () => {},
  }) });
  mocks.collection.mockReturnValue({ findOne: mocks.findOne });
});
afterEach(() => vi.unstubAllEnvs());

test("auth import is lazy, initialization shares a pending promise and never runs DB operations", async () => {
  const { getAuth } = await import("./auth");
  expect(mocks.getDb).not.toHaveBeenCalled();
  const first = getAuth();
  expect(getAuth()).toBe(first);
  const auth = await first;
  expect(await getAuth()).toBe(auth);
  expect(mocks.getDb).toHaveBeenCalledOnce();
  expect(mocks.getMongoClient).toHaveBeenCalledOnce();
  expect(mocks.collection).not.toHaveBeenCalled();
  expect(auth.options.emailAndPassword).toMatchObject({ enabled: true, disableSignUp: true });
  expect(auth.options.session).toMatchObject({ modelName: "authSessions", storeSessionInDatabase: true, cookieCache: { enabled: false } });
  expect(auth.options.advanced).toMatchObject({ useSecureCookies: true, defaultCookieAttributes: { httpOnly: true, sameSite: "lax" } });
  expect(auth.options.trustedOrigins).toEqual(["https://parkir.example.test"]);
  expect(auth.options).not.toHaveProperty("secondaryStorage");
  expect(auth.options.logger).toEqual({ disabled: true });
  const context = await auth.$context;
  expect(context.authCookies.sessionToken.attributes).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax" });
});

test("invalid auth environment fails before acquiring MongoDB and can be retried", async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", undefined);
  const { getAuth } = await import("./auth");
  await expect(getAuth()).rejects.toThrow("Authentication service is unavailable.");
  expect(mocks.getDb).not.toHaveBeenCalled();
  vi.stubEnv("BETTER_AUTH_SECRET", "synthetic-test-secret-with-entropy-0123456789");
  await expect(getAuth()).resolves.toHaveProperty("handler");
});

test("public email signup is disabled by the actual library without writing user or credentials", async () => {
  const auth = await (await import("./auth")).getAuth();
  await expect(auth.api.signUpEmail({ body: { email: "synthetic@example.test", name: "Synthetic", password: "synthetic-password-012345" } })).rejects.toMatchObject({ status: "BAD_REQUEST" });
  expect(mocks.collection).not.toHaveBeenCalled();
  expect(auth.options.emailAndPassword).not.toHaveProperty("password");
});

test("connection failures are sanitized and failed initialization permits a shared retry", async () => {
  mocks.getDb.mockRejectedValueOnce(new Error("mongodb://synthetic:secret@host"));
  const { getAuth } = await import("./auth");
  await expect(getAuth()).rejects.toThrow(/^Authentication service is unavailable\.$/);
  const retry = getAuth();
  expect(getAuth()).toBe(retry);
  await expect(retry).resolves.toHaveProperty("handler");
  expect(mocks.getDb).toHaveBeenCalledTimes(2);
});

test("session creation rejects invalid IDs and absent/inactive users before issuing a session", async () => {
  const auth = await (await import("./auth")).getAuth();
  const hook = auth.options.databaseHooks!.session!.create!.before!;
  const session = { id: new ObjectId().toHexString(), userId: "bad-id", token: "synthetic", expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date() };
  expect(await hook(session)).toBe(false);
  expect(mocks.collection).not.toHaveBeenCalled();
  session.userId = new ObjectId().toHexString();
  mocks.findOne.mockResolvedValueOnce(null);
  expect(await hook(session)).toBe(false);
  expect(mocks.findOne).toHaveBeenLastCalledWith({ _id: new ObjectId(session.userId), status: "active" }, { projection: { _id: 1 } });
  mocks.findOne.mockResolvedValueOnce({ _id: new ObjectId(session.userId) });
  expect(await hook(session)).toBeUndefined();
  mocks.findOne.mockRejectedValueOnce(new Error("synthetic database unavailable"));
  await expect(hook(session)).rejects.toThrow();
});
