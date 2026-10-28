import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppError } from "../../lib/errors";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), redirect: vi.fn((path: string) => { throw new Error("redirect:" + path); }) }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/workspace", () => ({ resolveActiveWorkspace: mocks.resolve }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../auth/logout-button", () => ({ LogoutButton: () => "[Keluar]" }));
vi.mock("./vehicle-entry-form", () => ({ VehicleEntryForm: () => "[FormMasuk]" }));
import { VehicleEntryContent } from "./vehicle-entry-content";

const active = (role = "owner") => ({ status: "active", canSwitch: false, workspaces: [], workspace: { tenantId: "a".repeat(24), tenantName: "Parkir Sentosa", locationId: "b".repeat(24), locationName: "Lokasi Utara", role } });
const props = (params: Record<string, string | string[] | undefined> = {}) => ({ searchParams: Promise.resolve(params) });
const html = async (params: Record<string, string | string[] | undefined> = {}) => renderToStaticMarkup(await VehicleEntryContent(props(params)));
beforeEach(() => vi.clearAllMocks());

it("renders the form for an Owner with the active location, without identifiers", async () => {
  mocks.resolve.mockResolvedValue(active());
  const markup = await html();
  expect(markup).toContain("[FormMasuk]"); expect(markup).toContain("Lokasi Utara");
  expect(markup).not.toContain("a".repeat(24)); expect(markup).not.toContain("b".repeat(24));
});
it.each(["admin", "staff"])("does not render the form for %s (Owner-only phase)", async (role) => {
  mocks.resolve.mockResolvedValue(active(role));
  const markup = await html();
  expect(markup).not.toContain("[FormMasuk]"); expect(markup).toContain("hanya tersedia untuk Owner");
});
it("redirects unauthenticated users to login and unselected locations to the picker", async () => {
  mocks.resolve.mockRejectedValueOnce(new AppError("UNAUTHENTICATED"));
  await expect(VehicleEntryContent(props())).rejects.toThrow("redirect:/login");
  mocks.resolve.mockResolvedValueOnce({ status: "selection_required", workspaces: [] });
  await expect(VehicleEntryContent(props())).rejects.toThrow("redirect:/app/pilih-lokasi");
});
it.each([
  [{ status: "forbidden", workspaces: [] }, "Akses lokasi ditolak"],
  [{ status: "empty", platformAdmin: false }, "Belum ada akses lokasi"],
])("suspended/archived tenant or inactive location yields %j without the form", async (state, text) => {
  mocks.resolve.mockResolvedValue(state);
  const markup = await html();
  expect(markup).toContain(text); expect(markup).not.toContain("[FormMasuk]");
});
it("fails safely when verification is unavailable", async () => {
  mocks.resolve.mockRejectedValue(new Error("synthetic secret"));
  const markup = await html();
  expect(markup).toContain("Layanan belum tersedia"); expect(markup).not.toContain("synthetic"); expect(markup).not.toContain("[FormMasuk]");
});

describe("back navigation", () => {
  const back = (markup: string) => markup.match(/<a[^>]*aria-label="(Kembali ke [^"]+)"[^>]*href="([^"]*)"|<a[^>]*href="([^"]*)"[^>]*aria-label="(Kembali ke [^"]+)"/);
  const target = (markup: string) => { const m = back(markup); return m ? { label: m[1] ?? m[4], href: (m[2] ?? m[3]).replaceAll("&amp;", "&") } : null; };
  beforeEach(() => mocks.resolve.mockResolvedValue(active()));
  it("shows 'Kembali' above the title, falling back to the vehicle list", async () => {
    const markup = await html();
    expect(target(markup)).toEqual({ label: "Kembali ke daftar kendaraan", href: "/app/kendaraan" });
    expect(markup.indexOf("Kembali")).toBeLessThan(markup.indexOf("<h1"));
  });
  it("returns to Beranda or the filtered list when opened from there", async () => {
    expect(target(await html({ returnTo: "/app" }))).toEqual({ label: "Kembali ke Beranda", href: "/app" });
    expect(target(await html({ returnTo: "/app/kendaraan?status=all&type=motor&q=b12" }))?.href).toBe("/app/kendaraan?q=b12&status=all&type=motor");
  });
  it.each(["https://evil.example/app", "//evil.example", "/\evil.example", "/platform", "javascript:alert(1)"])("ignores unsafe returnTo %s", async (returnTo) => {
    expect(target(await html({ returnTo }))?.href).toBe("/app/kendaraan");
  });
});
