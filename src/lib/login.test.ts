import { afterEach, describe, expect, it, vi } from "vitest";
import { loginSchema, loginErrorMessage } from "./login";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

describe("login input and safe errors", () => {
  it("requires email and password and trims email only", () => {
    expect(loginSchema.safeParse({ email: "", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "invalid", password: "password" }).success).toBe(false);
    expect(loginSchema.parse({ email: " person@example.test ", password: " pass " })).toEqual({ email: "person@example.test", password: " pass " });
  });
  it.each([400, 401, 403, 429, 503, undefined])("returns Indonesian errors for %s", (status) => {
    expect(loginErrorMessage(status)).toMatch(/Anda|email|kata sandi|kembali|koneksi|layanan|Layanan|Periksa|Terlalu|Permintaan/i);
  });
});

describe("official Better Auth client transport", () => {
  it("confirms server session before reporting successful login", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ ok: true })).mockResolvedValueOnce(response({ ok: true, user: { id: "507f1f77bcf86cd799439011" }, session: { expiresAt: new Date(Date.now() + 60000).toISOString() } }));
    vi.stubGlobal("fetch", fetch);
    const { loginWithPassword } = await import("./auth-client");
    expect(await loginWithPassword({ email: "person@example.test", password: "secret" })).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0][0])).toContain("/api/auth/sign-in/email");
    expect(String(fetch.mock.calls[1][0])).toContain("/api/auth/get-session");
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", method: "POST" });
  });
  it("does not accept expired sessions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ ok: true })).mockResolvedValueOnce(response({ ok: true, user: { id: "507f1f77bcf86cd799439011" }, session: { expiresAt: "2020-01-01T00:00:00.000Z" } })));
    const { loginWithPassword } = await import("./auth-client");
    expect((await loginWithPassword({ email: "a@example.test", password: "secret" })).ok).toBe(false);
  });
  it("does not expose server error details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ message: "private database detail" }, 401)));
    const { loginWithPassword } = await import("./auth-client");
    const result = await loginWithPassword({ email: "a@example.test", password: "secret" });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private database detail");
  });
  it("requires a confirmed logout and handles network failure", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ ok: true })).mockRejectedValueOnce(new Error("private transport detail"));
    vi.stubGlobal("fetch", fetch);
    const { logoutCurrentSession } = await import("./auth-client");
    expect(await logoutCurrentSession()).toEqual({ ok: true });
    const failure = await logoutCurrentSession();
    expect(failure.ok).toBe(false);
    expect(JSON.stringify(failure)).not.toContain("private transport detail");
  });
});
