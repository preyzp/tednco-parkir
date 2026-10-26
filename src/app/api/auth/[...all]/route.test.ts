import { beforeEach, expect, test, vi } from "vitest";
import { ObjectId } from "mongodb";
const mocks = vi.hoisted(() => ({ getAuth: vi.fn(), handler: vi.fn(), getSession: vi.fn(), getDb: vi.fn(), findOne: vi.fn() }));
vi.mock("../../../../lib/auth", () => ({ getAuth: mocks.getAuth }));
vi.mock("../../../../lib/mongodb", () => ({ getDb: mocks.getDb }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
import { GET, POST } from "./route";

const id = new ObjectId();
const user = { id: id.toHexString(), name: "Synthetic", email: "synthetic@example.test", emailVerified: true };
function sessionPayload() {
  return { user, session: { id: new ObjectId().toHexString(), userId: user.id, token: "synthetic-secret", expiresAt: new Date(Date.now() + 60_000).toISOString() } };
}
function request(path: string, method = "GET") {
  return new Request(`https://parkir.example.test/api/auth/${path}`, { method, headers: { cookie: "synthetic=cookie" } });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAuth.mockResolvedValue({ handler: mocks.handler, api: { getSession: mocks.getSession } });
  mocks.getDb.mockResolvedValue({ collection: () => ({ findOne: mocks.findOne }) });
  mocks.findOne.mockResolvedValue({ _id: id, ...user });
});

test("login forwards the request and preserves secure cookies while stripping tokens and claims", async () => {
  const nativeHeaders = new Headers({ "x-test": "preserved", "set-auth-token": "synthetic-secret" });
  nativeHeaders.append("set-cookie", "session=synthetic; HttpOnly; Secure; SameSite=Lax");
  nativeHeaders.append("set-cookie", "other=synthetic; HttpOnly; Secure");
  mocks.handler.mockResolvedValueOnce(Response.json({ token: "synthetic-secret", user: { ...user, passwordHash: "synthetic-hash", role: "platform_admin", tenantId: "untrusted" }, account: { password: "synthetic-hash" } }, { headers: nativeHeaders }));
  const incoming = request("sign-in/email", "POST");
  const response = await POST(incoming);
  expect(mocks.handler).toHaveBeenCalledWith(incoming);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, user });
  expect(response.headers.getSetCookie()).toEqual(nativeHeaders.getSetCookie());
  expect(response.headers.get("set-auth-token")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("current session returns only safe identity/expiry after checking active persisted user", async () => {
  const payload = sessionPayload();
  mocks.handler.mockResolvedValueOnce(Response.json(payload));
  const response = await GET(request("get-session?role=platform_admin&tenantId=untrusted"));
  expect(await response.json()).toEqual({ ok: true, user, session: { expiresAt: payload.session.expiresAt } });
  expect(mocks.findOne.mock.calls[0][0]).toEqual({ _id: id, status: "active" });
});

test.each([null, { user, session: { id: new ObjectId().toHexString(), userId: user.id, expiresAt: "2000-01-01T00:00:00Z" } }])("missing/expired session uses the standard unauthenticated error (%#)", async (payload) => {
  mocks.handler.mockResolvedValueOnce(Response.json(payload));
  const response = await GET(request("get-session"));
  expect(response.status).toBe(401);
  expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
  expect(mocks.getDb).not.toHaveBeenCalled();
});

test("logout verifies revocation, forwards cookie deletion and is idempotent", async () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    mocks.handler.mockResolvedValueOnce(Response.json({ success: true }, { headers: { "set-cookie": "session=; Max-Age=0; HttpOnly; Secure" } }));
    mocks.getSession.mockResolvedValueOnce(null);
    const incoming = request("sign-out", "POST");
    const response = await POST(incoming);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(mocks.getSession).toHaveBeenLastCalledWith({ headers: incoming.headers, query: { disableCookieCache: true, disableRefresh: true } });
  }
});

test("logout never claims success when native signOut swallowed a persistence failure", async () => {
  mocks.handler.mockResolvedValueOnce(Response.json({ success: true }));
  mocks.getSession.mockResolvedValueOnce(sessionPayload());
  expect((await POST(request("sign-out", "POST"))).status).toBe(503);
});

test.each([[400, "VALIDATION_ERROR"], [401, "UNAUTHENTICATED"], [403, "FORBIDDEN"], [429, "RATE_LIMITED"], [500, "SERVICE_UNAVAILABLE"]])("native error %s is sanitized using the app contract", async (status, code) => {
  mocks.handler.mockResolvedValueOnce(Response.json({ message: "synthetic secret record", token: "synthetic-secret" }, { status: Number(status), headers: { "x-retry-after": "10" } }));
  const response = await POST(request("sign-in/email", "POST"));
  expect((await response.json()).error.code).toBe(code);
  expect(response.status).toBe(status === 500 ? 503 : status);
  expect(response.headers.get("x-retry-after")).toBe("10");
});

test("init/handler/revocation-check failures return fixed unavailable errors", async () => {
  mocks.getAuth.mockRejectedValueOnce(new Error("synthetic credential failure"));
  expect((await GET(request("get-session"))).status).toBe(503);
  mocks.handler.mockRejectedValueOnce(new Error("synthetic credential failure"));
  expect((await POST(request("sign-in/email", "POST"))).status).toBe(503);
  mocks.handler.mockResolvedValueOnce(Response.json({ success: true }));
  mocks.getSession.mockRejectedValueOnce(new Error("synthetic credential failure"));
  expect((await POST(request("sign-out", "POST"))).status).toBe(503);
});

test("unimplemented record endpoints/wrong methods are unavailable without auth initialization", async () => {
  expect((await GET(request("list-sessions"))).status).toBe(404);
  expect((await GET(request("list-accounts"))).status).toBe(404);
  expect((await GET(request("sign-in/email"))).status).toBe(404);
  expect(mocks.getAuth).not.toHaveBeenCalled();
});
