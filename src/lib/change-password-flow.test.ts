import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Account, Session, User } from "better-auth/types";
type AppErrorClass = typeof import("./errors")["AppError"];

// Real Better Auth (password hashing, cookie signing, change-password endpoint)
// through the real route handler, with synthetic multi-session persistence.
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), getMongoClient: vi.fn(), findOne: vi.fn(), owner: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./mongodb", () => ({ getDb: mocks.getDb, getMongoClient: mocks.getMongoClient }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("./dal", () => ({ requireOwnerAccount: mocks.owner }));

let auth: Awaited<ReturnType<typeof import("./auth")["getAuth"]>>;
let context: Awaited<typeof auth.$context>;
let route: typeof import("../app/api/auth/[...all]/route");
let sessions: Map<string, Session>;
let account: Account;
let counter = 0;
// Loaded after resetModules so it is the same class instance the route uses.
let AppError: AppErrorClass;
const id = new ObjectId();
const oldPassword = "synthetic-old-password-123";
const newPassword = "synthetic-new-password-456";
const user: User = { id: id.toHexString(), name: "Synthetic Owner", email: "owner@example.test", emailVerified: true, createdAt: new Date(), updatedAt: new Date() };

beforeEach(async () => {
  vi.resetAllMocks(); vi.resetModules(); counter = 0;
  vi.stubEnv("BETTER_AUTH_SECRET", "synthetic-test-secret-with-entropy-0123456789");
  vi.stubEnv("BETTER_AUTH_URL", "https://parkir.example.test");
  mocks.owner.mockResolvedValue(undefined);
  mocks.getDb.mockResolvedValue({ collection: (name: string) => { if (name !== "users") throw new Error("Unexpected mock collection"); return { findOne: mocks.findOne }; } });
  mocks.getMongoClient.mockResolvedValue({ startSession: () => ({ withTransaction: async (work: () => Promise<unknown>) => work(), endSession: async () => {} }) });
  mocks.findOne.mockResolvedValue({ ...user, _id: id, status: "active" });
  auth = await (await import("./auth")).getAuth();
  context = await auth.$context;
  context.rateLimit.enabled = false; // Test instance only; production limiter stays enabled.
  sessions = new Map();
  account = { id: new ObjectId().toHexString(), userId: user.id, accountId: user.id, providerId: "credential", password: await context.password.hash(oldPassword), createdAt: new Date(), updatedAt: new Date() };
  const adapter = context.internalAdapter;
  vi.spyOn(adapter, "findUserByEmail").mockImplementation(async (email) => (email === user.email ? { user, accounts: [account] } : null));
  vi.spyOn(adapter, "createSession").mockImplementation(async (userId) => {
    const session: Session = { id: new ObjectId().toHexString(), userId, token: `synthetic-session-token-${++counter}`, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000), createdAt: new Date(), updatedAt: new Date() };
    sessions.set(session.token, session);
    return session;
  });
  vi.spyOn(adapter, "findSession").mockImplementation(async (token) => { const session = sessions.get(token); return session ? { session, user } : null; });
  vi.spyOn(adapter, "updateSession").mockImplementation(async (token, update) => { const session = sessions.get(token); if (!session) return null; Object.assign(session, update); return session; });
  vi.spyOn(adapter, "deleteSession").mockImplementation(async (token) => { sessions.delete(token); });
  vi.spyOn(adapter, "deleteUserSessions").mockImplementation(async (userId) => { for (const [token, session] of sessions) if (session.userId === userId) sessions.delete(token); });
  vi.spyOn(adapter, "findAccounts").mockImplementation(async () => [account]);
  vi.spyOn(adapter, "findCredentialAccount").mockImplementation(async () => account);
  vi.spyOn(adapter, "updateAccount").mockImplementation(async (_id, data) => { Object.assign(account, data); return account; });
  route = await import("../app/api/auth/[...all]/route");
  AppError = (await import("./errors")).AppError;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function request(path: string, method = "GET", cookie?: string, body?: unknown) {
  return new Request(`https://parkir.example.test/api/auth/${path}`, {
    method,
    headers: { origin: "https://parkir.example.test", ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const sessionCookie = (response: Response) => response.headers.getSetCookie().find((value) => value.includes(".session_token=") && !value.includes("Max-Age=0"))?.split(";")[0];
async function login(password = oldPassword) {
  const response = await route.POST(request("sign-in/email", "POST", undefined, { email: user.email, password }));
  return { status: response.status, cookie: sessionCookie(response) };
}
const change = (cookie: string | undefined, body: unknown) => route.POST(request("change-password", "POST", cookie, body));
const currentSession = async (cookie: string) => (await route.GET(request("get-session", "GET", cookie))).status;

describe("rejections never change the password or sessions", () => {
  test("wrong current password is a field error on currentPassword", async () => {
    const { cookie } = await login(); const hash = account.password;
    const response = await change(cookie, { currentPassword: "wrong-current-password", newPassword });
    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors).toEqual([{ field: "currentPassword", code: "INVALID", message: expect.any(String) }]);
    expect(account.password).toBe(hash); expect(sessions.size).toBe(1);
    expect(await currentSession(cookie!)).toBe(200);
  });
  test.each([
    ["too short (5 characters)", "abcde", "TOO_SMALL"],
    ["too long", "x".repeat(129), "TOO_LARGE"],
    ["same as current", oldPassword, "INVALID"],
  ])("weak or invalid new password (%s) is rejected before Better Auth runs", async (_case, candidate, code) => {
    const { cookie } = await login(); const hash = account.password;
    const response = await change(cookie, { currentPassword: oldPassword, newPassword: candidate });
    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors).toEqual([{ field: "newPassword", code, message: expect.any(String) }]);
    expect(context.internalAdapter.updateAccount).not.toHaveBeenCalled();
    expect(account.password).toBe(hash);
  });
  test("requests without a session are unauthenticated (route guard and native middleware)", async () => {
    mocks.owner.mockRejectedValueOnce(new AppError("UNAUTHENTICATED"));
    expect((await change(undefined, { currentPassword: oldPassword, newPassword })).status).toBe(401);
    expect((await change(undefined, { currentPassword: oldPassword, newPassword })).status).toBe(401);
    expect(context.internalAdapter.updateAccount).not.toHaveBeenCalled();
  });
  test("authenticated users without Owner access are forbidden", async () => {
    const { cookie } = await login();
    mocks.owner.mockRejectedValueOnce(new AppError("FORBIDDEN"));
    expect((await change(cookie, { currentPassword: oldPassword, newPassword })).status).toBe(403);
    expect(context.internalAdapter.updateAccount).not.toHaveBeenCalled();
  });
});

describe("password policy 6–128 (route + real Better Auth config)", () => {
  test("Better Auth is configured with the app policy instead of its default of 8", () => {
    expect(context.password.config).toMatchObject({ minPasswordLength: 6, maxPasswordLength: 128 });
  });
  test.each([["exactly 6 characters", "abcdef"], ["7 characters (below Better Auth default 8)", "abcdefg"], ["a longer password", "a-much-longer-password-1234"], ["exactly 128 characters", "x".repeat(128)]])("accepts %s end to end", async (_case, candidate) => {
    const { cookie } = await login();
    const response = await change(cookie, { currentPassword: oldPassword, newPassword: candidate });
    expect(response.status).toBe(200);
    expect(await context.password.verify({ hash: account.password!, password: candidate })).toBe(true);
    expect((await login(candidate)).status).toBe(200);
  });
});

describe("rate limiting is preserved for change-password", () => {
  test("Better Auth limits change-password attempts (3 per 10 s) behind the route; blocked attempts change nothing", async () => {
    const { cookie } = await login();
    const hash = account.password;
    // Test instance only: enable the built-in limiter with in-memory storage
    // (production keeps it enabled with database storage).
    context.rateLimit.enabled = true;
    context.rateLimit.storage = "memory";
    const statuses = [];
    for (let attempt = 0; attempt < 3; attempt++) statuses.push((await change(cookie, { currentPassword: "wrong-current-password", newPassword })).status);
    const blocked = await change(cookie, { currentPassword: oldPassword, newPassword });
    expect(statuses).toEqual([400, 400, 400]);
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error.code).toBe("RATE_LIMITED");
    expect(account.password).toBe(hash);
    expect(context.internalAdapter.updateAccount).not.toHaveBeenCalled();
  });
});

describe("successful change", () => {
  test("verifies the current password, stores only a hash, revokes other sessions and keeps this browser signed in", async () => {
    const browser = await login(); const otherDevice = await login();
    expect(sessions.size).toBe(2);
    // Even if a client asks not to revoke, the server forces revocation.
    const response = await change(browser.cookie, { currentPassword: oldPassword, newPassword, revokeOtherSessions: false });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true });
    expect(JSON.stringify(body)).not.toMatch(/token|password/);
    expect(response.headers.get("set-auth-token")).toBeNull();
    expect(account.password).not.toBe(newPassword);
    expect(await context.password.verify({ hash: account.password!, password: newPassword })).toBe(true);
    const fresh = sessionCookie(response);
    expect(fresh).toBeDefined();
    expect(sessions.size).toBe(1);
    expect(await currentSession(fresh!)).toBe(200);
    expect(await currentSession(otherDevice.cookie!)).toBe(401);
    expect(await currentSession(browser.cookie!)).toBe(401);
    expect((await login(oldPassword)).status).toBe(401);
    expect((await login(newPassword)).status).toBe(200);
  });
});
