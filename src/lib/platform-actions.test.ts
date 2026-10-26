import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "./errors";
const mocks = vi.hoisted(() => ({ create: vi.fn(), rename: vi.fn(), status: vi.fn(), owner: vi.fn(), addLocation: vi.fn(), editLocation: vi.fn(), locationStatus: vi.fn(), redirect: vi.fn((path: string) => { throw new Error("redirect:" + path); }) }));
vi.mock("server-only", () => ({}));
vi.mock("./dal", () => ({ createTenantWithOwner: mocks.create, renameTenant: mocks.rename, changeTenantStatus: mocks.status, renameTenantOwner: mocks.owner, createTenantLocation: mocks.addLocation, updateTenantLocation: mocks.editLocation, changeTenantLocationStatus: mocks.locationStatus }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { changeLocationStatusAction, changeTenantStatusAction, createLocationAction, createTenantAction, renameOwnerAction, renameTenantAction, updateLocationAction } from "./platform-actions";

const password = "synthetic-initial-password";
function form(extra: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ tenantName: "Parkir Sentosa", slug: "parkir-sentosa", timezone: "Asia/Jakarta", locationName: "Lokasi Utara", locationAddress: "", ownerName: "Budi", ownerEmail: "budi@example.test", ownerPassword: password, ownerPasswordConfirm: password, ...extra })) data.set(key, value);
  return data;
}
const submit = (data = form()) => createTenantAction({ status: "idle" }, data);
beforeEach(() => vi.clearAllMocks());

it("forwards only known fields to the guarded repository and redirects to the new tenant", async () => {
  mocks.create.mockResolvedValue({ ok: true, tenantId: "a".repeat(24) });
  await expect(submit(form({ platformRole: "platform_admin", role: "owner", tenantId: "b".repeat(24) }))).rejects.toThrow(`redirect:/platform/tenants/${"a".repeat(24)}?dibuat=1`);
  const raw = mocks.create.mock.calls[0][0];
  expect(Object.keys(raw).sort()).toEqual(["locationAddress", "locationName", "ownerEmail", "ownerName", "ownerPassword", "ownerPasswordConfirm", "slug", "tenantName", "timezone"]);
  expect(mocks.redirect).toHaveBeenCalledTimes(1);
});
it("returns field validation messages without echoing passwords", async () => {
  mocks.create.mockResolvedValue({ ok: false, reason: "validation", fieldErrors: { slug: "Slug minimal 3 karakter." } });
  const state = await submit();
  expect(state).toEqual({ status: "error", message: "Periksa kembali isian yang ditandai.", fieldErrors: { slug: "Slug minimal 3 karakter." } });
  expect(JSON.stringify(state)).not.toContain(password);
});
it.each([
  ["slug", "slug", "Slug sudah digunakan"],
  ["email", "ownerEmail", "Email sudah terdaftar"],
] as const)("maps a %s conflict to a field error", async (field, formField, text) => {
  mocks.create.mockResolvedValue({ ok: false, reason: "conflict", field });
  const state = await submit();
  expect(state.fieldErrors?.[formField]).toContain(text);
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it("never claims success or a clean failure when the outcome is unconfirmed", async () => {
  mocks.create.mockRejectedValue(new AppError("SERVICE_UNAVAILABLE"));
  const state = await submit();
  expect(state.message).toContain("belum dapat dikonfirmasi");
  expect(state.message).toContain("Periksa daftar tenant");
  mocks.create.mockRejectedValue(new Error("synthetic secret"));
  expect(JSON.stringify(await submit())).not.toContain("synthetic");
});
it("rejects non-platform callers and sends unauthenticated callers to login", async () => {
  mocks.create.mockRejectedValue(new AppError("FORBIDDEN"));
  expect((await submit()).message).toBe("Hanya Platform Admin yang dapat membuat tenant.");
  mocks.create.mockRejectedValue(new AppError("UNAUTHENTICATED"));
  await expect(submit()).rejects.toThrow("redirect:/login");
});

describe("tenant management actions", () => {
  const id = "a".repeat(24);
  const fd = (entries: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(entries)) data.set(key, value); return data; };
  it("rename forwards only tenantId and name and redirects to the refreshed detail page", async () => {
    mocks.rename.mockResolvedValue({ ok: true, tenantId: id });
    await expect(renameTenantAction({ status: "idle" }, fd({ tenantId: id, name: "Baru", slug: "hijack", ownerEmail: "x@example.test" }))).rejects.toThrow(`redirect:/platform/tenants/${id}?diperbarui=nama`);
    expect(mocks.rename).toHaveBeenCalledWith({ tenantId: id, name: "Baru" });
  });
  it("status change forwards the target and the status the admin saw", async () => {
    mocks.status.mockResolvedValue({ ok: true, tenantId: id });
    await expect(changeTenantStatusAction({ status: "idle" }, fd({ tenantId: id, toStatus: "suspended", expectedStatus: "active" }))).rejects.toThrow(`redirect:/platform/tenants/${id}?diperbarui=status`);
    expect(mocks.status).toHaveBeenCalledWith({ tenantId: id, toStatus: "suspended", expectedStatus: "active" });
  });
  it.each([
    [{ ok: false, reason: "stale" }, "sudah berubah"],
    [{ ok: false, reason: "unchanged" }, "Tidak ada perubahan"],
    [{ ok: false, reason: "invalid_transition" }, "tidak diizinkan"],
    [{ ok: false, reason: "not_found" }, "tidak ditemukan"],
    [{ ok: false, reason: "validation", message: "Nama usaha minimal 2 karakter." }, "minimal 2"],
  ])("maps %j to a safe message without redirecting", async (result, text) => {
    mocks.status.mockResolvedValue(result);
    expect((await changeTenantStatusAction({ status: "idle" }, fd({ tenantId: id }))).message).toContain(text);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("handles unauthorized, forbidden and unconfirmed outcomes", async () => {
    mocks.rename.mockRejectedValue(new AppError("FORBIDDEN"));
    expect((await renameTenantAction({ status: "idle" }, fd({ tenantId: id, name: "Baru" }))).message).toContain("Hanya Platform Admin");
    mocks.rename.mockRejectedValue(new Error("synthetic secret"));
    const state = await renameTenantAction({ status: "idle" }, fd({ tenantId: id, name: "Baru" }));
    expect(state.message).toContain("belum dapat dikonfirmasi"); expect(JSON.stringify(state)).not.toContain("synthetic");
    mocks.status.mockRejectedValue(new AppError("UNAUTHENTICATED"));
    await expect(changeTenantStatusAction({ status: "idle" }, fd({ tenantId: id }))).rejects.toThrow("redirect:/login");
  });
});

describe("Owner and location actions", () => {
  const id = "a".repeat(24); const other = "b".repeat(24);
  const fd = (entries: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(entries)) data.set(key, value); return data; };
  it.each([
    ["owner rename", () => renameOwnerAction({ status: "idle" }, fd({ tenantId: id, userId: other, name: "Budi", email: "baru@example.test", password: "x" })), mocks.owner, { tenantId: id, userId: other, name: "Budi" }, "owner"],
    ["create location", () => createLocationAction({ status: "idle" }, fd({ tenantId: id, name: "Lokasi", address: "Jl. 1", status: "inactive" })), mocks.addLocation, { tenantId: id, name: "Lokasi", address: "Jl. 1" }, "lokasi-baru"],
    ["update location", () => updateLocationAction({ status: "idle" }, fd({ tenantId: id, locationId: other, name: "Lokasi", address: "" })), mocks.editLocation, { tenantId: id, locationId: other, name: "Lokasi", address: "" }, "lokasi"],
    ["location status", () => changeLocationStatusAction({ status: "idle" }, fd({ tenantId: id, locationId: other, toStatus: "inactive", expectedStatus: "active" })), mocks.locationStatus, { tenantId: id, locationId: other, toStatus: "inactive", expectedStatus: "active" }, "status-lokasi"],
  ] as const)("%s forwards only its known fields and redirects to the refreshed detail", async (_name, run, mock, expected, notice) => {
    mock.mockResolvedValue({ ok: true, tenantId: id });
    await expect(run()).rejects.toThrow(`redirect:/platform/tenants/${id}?diperbarui=${notice}`);
    expect(mock).toHaveBeenCalledWith(expected);
  });
  it.each([[{ ok: false, reason: "duplicate_name" }, "sudah dipakai"], [{ ok: false, reason: "protected_account" }, "tidak dapat diubah"]])("maps %j to a safe message", async (result, text) => {
    mocks.addLocation.mockResolvedValue(result);
    expect((await createLocationAction({ status: "idle" }, fd({ tenantId: id, name: "Lokasi" }))).message).toContain(text);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
