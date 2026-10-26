import { beforeEach, expect, test, vi } from "vitest";
import { ObjectId } from "mongodb";
import { APIError } from "better-auth/api";
const mocks = vi.hoisted(() => ({ getAuth: vi.fn(), getSession: vi.fn(), getDb: vi.fn(), findOne: vi.fn(), headers: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./auth", () => ({ getAuth: mocks.getAuth }));
vi.mock("./mongodb", () => ({ getDb: mocks.getDb }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
import { getCurrentSession, requireAuthenticatedSession } from "./auth-session";
import { normalizeError } from "./errors";

const id = new ObjectId();
const incoming = new Headers({ cookie: "synthetic=untrusted-cookie", role: "platform_admin", tenantId: "untrusted" });
function payload() {
  return { user: { id: id.toHexString(), role: "platform_admin", tenantId: "untrusted" }, session: { id: new ObjectId().toHexString(), userId: id.toHexString(), token: "synthetic-secret", expiresAt: new Date(Date.now() + 60_000) } };
}
const persistedUser = { _id: id, name: "Synthetic", email: "synthetic@example.test", emailVerified: true, passwordHash: "synthetic-hash", platformRole: "platform_admin", tenantId: "untrusted" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.headers.mockResolvedValue(incoming);
  mocks.getAuth.mockResolvedValue({ api: { getSession: mocks.getSession } });
  mocks.getDb.mockResolvedValue({ collection: () => ({ findOne: mocks.findOne }) });
  mocks.getSession.mockResolvedValue(payload());
  mocks.findOne.mockResolvedValue(persistedUser);
});

test("valid session uses official verification and returns only safe current-user fields", async () => {
  const result = await requireAuthenticatedSession();
  expect(mocks.getSession).toHaveBeenCalledWith({ headers: incoming, query: { disableCookieCache: true, disableRefresh: true } });
  expect(mocks.findOne.mock.calls[0][0]).toEqual({ _id: id, status: "active" });
  expect(result.user).toEqual({ id: id.toHexString(), name: "Synthetic", email: "synthetic@example.test", emailVerified: true });
  expect(JSON.stringify(result)).not.toMatch(/token|password|platformRole|tenantId|locationId/);
  expect(mocks.headers).toHaveBeenCalledOnce();
});

test("missing cookies rejects protected access without DB/init", async () => {
  expect(await getCurrentSession(new Headers())).toBeNull();
  await expect(requireAuthenticatedSession(new Headers())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(mocks.getAuth).not.toHaveBeenCalled();
  expect(mocks.getDb).not.toHaveBeenCalled();
});

test.each([null, {}, { user: { id: "invalid" }, session: {} }])("invalid/revoked session is rejected before user lookup (%#)", async (value) => {
  mocks.getSession.mockResolvedValueOnce(value);
  expect(await getCurrentSession(incoming)).toBeNull();
  expect(mocks.getDb).not.toHaveBeenCalled();
});

test.each(["expired", "mismatched", "invalid-expiry"])("%s session cannot authenticate", async (scenario) => {
  const value = payload();
  if (scenario === "expired") value.session.expiresAt = new Date(Date.now() - 1);
  if (scenario === "mismatched") value.session.userId = new ObjectId().toHexString();
  mocks.getSession.mockResolvedValueOnce(scenario === "invalid-expiry" ? { ...value, session: { ...value.session, expiresAt: "not-a-date" } } : value);
  expect(await getCurrentSession(incoming)).toBeNull();
  expect(mocks.getDb).not.toHaveBeenCalled();
});

test("removed/inactive/locked users cannot use an otherwise valid session", async () => {
  mocks.findOne.mockResolvedValue(null); // The active-status query excludes these users.
  await expect(requireAuthenticatedSession(incoming)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(mocks.findOne.mock.calls[0][0].status).toBe("active");
});

test("authoritative session reads are not cached across requests", async () => {
  expect(await getCurrentSession(incoming)).not.toBeNull();
  mocks.getSession.mockResolvedValueOnce(null);
  expect(await getCurrentSession(incoming)).toBeNull();
  expect(mocks.getSession).toHaveBeenCalledTimes(2);
});

test("official unauthorized API errors reject identity; spoofed status properties do not", async () => {
  mocks.getSession.mockRejectedValueOnce(new APIError("UNAUTHORIZED", { message: "synthetic error" }));
  expect(await getCurrentSession(incoming)).toBeNull();
  mocks.getSession.mockRejectedValueOnce({ statusCode: 401, message: "synthetic secret" });
  await expect(getCurrentSession(incoming)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
});

test("auth/DB failures use sanitized unavailable errors without implying success", async () => {
  mocks.getSession.mockRejectedValueOnce(new Error("synthetic secret"));
  try { await requireAuthenticatedSession(incoming); throw new Error("Expected rejection"); }
  catch (error) { expect(normalizeError(error)).toMatchObject({ status: 503, body: { error: { code: "SERVICE_UNAVAILABLE" } } }); }
  mocks.findOne.mockRejectedValueOnce(new Error("synthetic database secret"));
  await expect(getCurrentSession(incoming)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
});
