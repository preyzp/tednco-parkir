import { afterEach, describe, expect, it, vi } from "vitest";
import { changePasswordErrorMessage } from "./auth-client";
// The client captures fetch when created: stub first, then import fresh.
const client = async () => (await import("./auth-client")).changeOwnerPassword;

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
const routeError = (status: number, fieldErrors?: { field: string; code: string }[]) => ({ ok: false, error: { code: "VALIDATION_ERROR", message: "x", ...(fieldErrors ? { fieldErrors } : {}) }, status });

describe("error mapping uses only status and allowlisted field codes", () => {
  it.each([
    [400, [{ field: "currentPassword", code: "INVALID" }], "currentPassword", "Password saat ini salah."],
    [400, [{ field: "newPassword", code: "TOO_SMALL" }], "newPassword", "6–128 karakter"],
    [400, [{ field: "newPassword", code: "INVALID" }], "newPassword", "harus berbeda"],
    [400, undefined, undefined, "Periksa kembali"],
    [401, undefined, undefined, "Sesi Anda berakhir"],
    [403, undefined, undefined, "hanya untuk Owner"],
    [429, undefined, undefined, "Terlalu banyak percobaan"],
    [503, undefined, undefined, "belum dapat dikonfirmasi"],
  ])("status %s %j", (status, fields, field, text) => {
    const result = changePasswordErrorMessage(status, routeError(status, fields));
    expect(result.field).toBe(field);
    expect(result.message).toContain(text);
  });
});

describe("official client transport", () => {
  it("posts to the Better Auth change-password endpoint with revocation and never puts passwords in the URL", async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    expect(await (await client())({ currentPassword: "synthetic-old-password", newPassword: "synthetic-new-password" })).toEqual({ ok: true });
    const [input, init] = fetch.mock.calls[0] as unknown as [string | URL | Request, RequestInit | undefined];
    const url = String(input instanceof Request ? input.url : input);
    expect(url).toMatch(/\/api\/auth\/change-password$/);
    expect(url).not.toContain("synthetic");
    const body = input instanceof Request ? await input.text() : String(init?.body);
    expect(JSON.parse(body)).toEqual({ currentPassword: "synthetic-old-password", newPassword: "synthetic-new-password", revokeOtherSessions: true });
  });
  it("maps a wrong-current-password response from the route", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(routeError(400, [{ field: "currentPassword", code: "INVALID" }]), { status: 400 })));
    expect(await (await client())({ currentPassword: "wrong", newPassword: "synthetic-new-password" })).toEqual({ ok: false, field: "currentPassword", message: "Password saat ini salah." });
  });
  it("network failures are reported safely", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("synthetic network secret"); }));
    const result = await (await client())({ currentPassword: "a", newPassword: "b" });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("synthetic");
  });
});
