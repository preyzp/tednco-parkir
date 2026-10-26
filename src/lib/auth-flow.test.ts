import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Session, User } from "better-auth/types";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), getMongoClient: vi.fn(), findOne: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./mongodb", () => ({ getDb: mocks.getDb, getMongoClient: mocks.getMongoClient }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

let auth: Awaited<ReturnType<typeof import("./auth")["getAuth"]>>;
let context: Awaited<typeof auth.$context>;
let route: typeof import("../app/api/auth/[...all]/route");
let stored: { session: Session; user: User } | null;
const id = new ObjectId();
const password = "synthetic-password-for-isolated-test";
const user: User = { id: id.toHexString(), name: "Synthetic", email: "synthetic@example.test", emailVerified: true, createdAt: new Date(), updatedAt: new Date() };

beforeEach(async () => {
  vi.resetAllMocks();
  vi.resetModules();
  vi.stubEnv("BETTER_AUTH_SECRET", "synthetic-test-secret-with-entropy-0123456789");
  vi.stubEnv("BETTER_AUTH_URL", "https://parkir.example.test");
  mocks.getDb.mockResolvedValue({ collection: (name: string) => {
    if (name !== "users") throw new Error("Unexpected mock collection");
    return { findOne: mocks.findOne };
  } });
  mocks.getMongoClient.mockResolvedValue({ startSession: () => ({
    withTransaction: async (work: () => Promise<unknown>) => work(), endSession: async () => {},
  }) });
  mocks.findOne.mockResolvedValue({ ...user, _id: id, status: "active" });
  auth = await (await import("./auth")).getAuth();
  context = await auth.$context;
  // Isolate session lifecycle from the shared DB limiter. This only changes
  // this test instance; production configuration remains database/enabled.
  context.rateLimit.enabled = false;
  stored = null;
  const account = { id: new ObjectId().toHexString(), userId: user.id, accountId: user.id, providerId: "credential", password: await context.password.hash(password), createdAt: new Date(), updatedAt: new Date() };
  vi.spyOn(context.internalAdapter, "findUserByEmail").mockImplementation(async (email) => email === user.email ? { user, accounts: [account] } : null);
  vi.spyOn(context.internalAdapter, "createSession").mockImplementation(async (userId) => {
    stored = { user, session: { id: new ObjectId().toHexString(), userId, token: "synthetic-session-token", expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000), createdAt: new Date(), updatedAt: new Date() } };
    return stored.session;
  });
  vi.spyOn(context.internalAdapter, "findSession").mockImplementation(async (token) => stored?.session.token === token ? stored : null);
  vi.spyOn(context.internalAdapter, "updateSession").mockImplementation(async (token, update) => {
    if (!stored || stored.session.token !== token) return null;
    Object.assign(stored.session, update);
    return stored.session;
  });
  vi.spyOn(context.internalAdapter, "deleteSession").mockImplementation(async () => { stored = null; });
  vi.spyOn(context.internalAdapter, "findAccounts").mockResolvedValue([account]);
  route = await import("../app/api/auth/[...all]/route");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function request(path: string, method = "GET", cookie?: string, body?: unknown, origin = "https://parkir.example.test") {
  return new Request(`https://parkir.example.test/api/auth/${path}`, {
    method,
    headers: { origin, ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function login() {
  const response = await route.POST(request("sign-in/email", "POST", undefined, { email: user.email, password }));
  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie().find((value) => value.includes(".session_token="));
  expect(cookie).toBeDefined();
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/Secure/i);
  expect(cookie).toMatch(/SameSite=Lax/i);
  return { response, cookie: cookie!.split(";")[0] };
}

test("real Better Auth verifies passwords, issues a signed cookie and resolves safe current identity", async () => {
  const { response, cookie } = await login();
  const body = await response.json();
  expect(body.user.id).toBe(user.id);
  expect(JSON.stringify(body)).not.toMatch(/token|password|account|platformRole/);
  const current = await route.GET(request("get-session", "GET", cookie));
  expect(current.status).toBe(200);
  expect((await current.json()).user.id).toBe(user.id);
  const { requireAuthenticatedSession } = await import("./auth-session");
  expect((await requireAuthenticatedSession(new Headers({ cookie }))).user.id).toBe(user.id);
});

test("wrong passwords and unknown emails yield the same safe authentication failure", async () => {
  const responses = [];
  for (const credentials of [{ email: user.email, password: "wrong-synthetic-password" }, { email: "missing@example.test", password }]) {
    const response = await route.POST(request("sign-in/email", "POST", undefined, credentials));
    expect(response.status).toBe(401);
    responses.push(await response.json());
  }
  expect(responses[0]).toEqual(responses[1]);
  expect(context.internalAdapter.createSession).not.toHaveBeenCalled();
});

test("real logout revokes the session and rejects replay of the old signed cookie", async () => {
  const { cookie } = await login();
  const response = await route.POST(request("sign-out", "POST", cookie, {}));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(response.headers.getSetCookie().some((value) => value.includes("Max-Age=0"))).toBe(true);
  expect(stored).toBeNull();
  expect((await route.GET(request("get-session", "GET", cookie))).status).toBe(401);
});

test("expired sessions and forged cookie signatures cannot authenticate", async () => {
  const { cookie } = await login();
  const lookups = vi.mocked(context.internalAdapter.findSession).mock.calls.length;
  expect((await route.GET(request("get-session", "GET", `${cookie}tampered`))).status).toBe(401);
  expect(context.internalAdapter.findSession).toHaveBeenCalledTimes(lookups);
  if (!stored) throw new Error("Missing fixture session");
  stored.session.expiresAt = new Date("2000-01-01T00:00:00Z");
  expect((await route.GET(request("get-session", "GET", cookie))).status).toBe(401);
});

test("HTTP current-session preserves the library's secure refresh cookie", async () => {
  const { cookie } = await login();
  if (!stored) throw new Error("Missing fixture session");
  stored.session.expiresAt = new Date(Date.now() + 60_000);
  const response = await route.GET(request("get-session", "GET", cookie));
  expect(response.status).toBe(200);
  expect(context.internalAdapter.updateSession).toHaveBeenCalledOnce();
  expect(response.headers.getSetCookie().some((value) => value.includes(".session_token=") && /HttpOnly/i.test(value) && /Secure/i.test(value))).toBe(true);
  expect((await response.json()).session.expiresAt).toBe(stored.session.expiresAt.toISOString());
});

test("valid login never grants tenant/location/platform DAL access and inactive users are denied", async () => {
  const { cookie } = await login();
  const { requireAuthenticatedSession } = await import("./auth-session");
  await expect(requireAuthenticatedSession(new Headers({ cookie }))).resolves.toHaveProperty("user.id", user.id);
  const { getTenantCollection, getLocationCollection, getPlatformCollection } = await import("./dal");
  const count = mocks.getDb.mock.calls.length;
  await expect(getTenantCollection("vehicles")).rejects.toThrow("Silakan masuk untuk melanjutkan.");
  await expect(getLocationCollection("parkingSessions")).rejects.toThrow("Silakan masuk untuk melanjutkan.");
  await expect(getPlatformCollection("users")).rejects.toThrow("Silakan masuk untuk melanjutkan.");
  expect(mocks.getDb).toHaveBeenCalledTimes(count);
  mocks.findOne.mockResolvedValue(null);
  expect((await route.GET(request("get-session", "GET", cookie))).status).toBe(401);
});

test("native swallowed logout deletion failure cannot become application success", async () => {
  const { cookie } = await login();
  vi.mocked(context.internalAdapter.deleteSession).mockRejectedValueOnce(new Error("synthetic DB failure"));
  const response = await route.POST(request("sign-out", "POST", cookie, {}));
  expect(response.status).toBe(503);
  expect(stored).not.toBeNull();
});

test("untrusted origins and native session failures are rejected without secret records", async () => {
  const rejected = await route.POST(request("sign-in/email", "POST", undefined, { email: user.email, password }, "https://untrusted.example.test"));
  expect(rejected.status).toBe(403);
  expect(context.internalAdapter.createSession).not.toHaveBeenCalled();
  const { cookie } = await login();
  vi.mocked(context.internalAdapter.findSession).mockRejectedValueOnce(new Error("synthetic secret record"));
  const response = await route.GET(request("get-session", "GET", cookie));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("synthetic secret");
});
