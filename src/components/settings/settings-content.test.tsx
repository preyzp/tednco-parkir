import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppError } from "../../lib/errors";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), read: vi.fn(), redirect: vi.fn((path: string) => { throw new Error("redirect:" + path); }) }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/workspace", () => ({ resolveActiveWorkspace: mocks.resolve }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../../lib/dal", () => ({ getLocationSettings: mocks.read }));
vi.mock("../../lib/settings-actions", () => ({ saveLocationSettingsAction: vi.fn() }));
vi.mock("./location-settings-form", () => ({ LocationSettingsForm: ({ settings }: { settings: { revision: number } }) => `[Form revision=${settings.revision}]` }));
import { SettingsHubContent } from "./settings-hub";
import { LocationSettingsContent } from "./location-settings-content";

const scope = { tenantId: "a".repeat(24), locationId: "b".repeat(24) };
const active = (role = "owner", canSwitch = false) => ({ status: "active", canSwitch, workspaces: [], workspace: { ...scope, tenantName: "Parkir Sentosa", locationName: "Lokasi Utara", role } });
const settings = { locationName: "Lokasi Utara", revision: 2, tariffsConsistent: true, activeVehicleCount: 0, tariffs: {}, operatingHours: { openTime: "05:00", closeTime: "00:00", source: "default" } };
const hub = async () => renderToStaticMarkup(await SettingsHubContent());
const page = async () => renderToStaticMarkup(await LocationSettingsContent());
beforeEach(() => { vi.clearAllMocks(); mocks.resolve.mockResolvedValue(active()); mocks.read.mockResolvedValue(settings); });

describe("settings hub (/app/pengaturan)", () => {
  it("links Tarif & Jam Operasional and Keamanan Akun, shows the active location, and has no back button (main page)", async () => {
    const markup = await hub();
    expect(markup).toContain('href="/app/pengaturan/tarif"'); expect(markup).toContain("Tarif &amp; Jam Operasional");
    expect(markup).toContain('href="/app/pengaturan/keamanan"'); expect(markup).toContain("Keamanan Akun");
    expect(markup).toContain("Lokasi Utara");
    expect(markup).not.toContain("Kembali");
  });
  it("guards: unauthenticated → login, unselected → picker, non-Owner/forbidden/empty → no links", async () => {
    mocks.resolve.mockRejectedValueOnce(new AppError("UNAUTHENTICATED"));
    await expect(hub()).rejects.toThrow("redirect:/login");
    mocks.resolve.mockResolvedValueOnce({ status: "selection_required", workspaces: [] });
    await expect(hub()).rejects.toThrow("redirect:/app/pilih-lokasi");
    for (const state of [active("staff"), active("admin"), { status: "forbidden", workspaces: [] }, { status: "empty", platformAdmin: false }]) {
      mocks.resolve.mockResolvedValueOnce(state);
      expect(await hub()).not.toContain('href="/app/pengaturan/tarif"');
    }
  });
});

describe("tariff & hours page (/app/pengaturan/tarif)", () => {
  it("loads settings for the guarded workspace only and renders the form keyed by revision", async () => {
    const markup = await page();
    expect(mocks.read).toHaveBeenCalledWith(scope);
    expect(markup).toContain("[Form revision=2]");
    expect(markup).toContain("Tarif &amp; Jam Operasional"); expect(markup).toContain("Lokasi Utara");
    expect(markup).toContain("hanya berlaku untuk lokasi di atas");
  });
  it("Kembali goes to the hub above the title; 'Ganti lokasi' only when the Owner can switch", async () => {
    const markup = await page();
    expect(markup).toMatch(/aria-label="Kembali ke Pengaturan"[^>]*href="\/app\/pengaturan"/);
    expect(markup.indexOf("Kembali")).toBeLessThan(markup.indexOf("<h1"));
    expect(markup).not.toContain("Ganti lokasi");
    mocks.resolve.mockResolvedValueOnce(active("owner", true));
    expect(await page()).toMatch(/href="\/app\/pilih-lokasi"[^>]*>.*?Ganti lokasi/);
  });
  it("guards: unauthenticated, unselected, non-Owner, suspended/forbidden", async () => {
    mocks.resolve.mockRejectedValueOnce(new AppError("UNAUTHENTICATED"));
    await expect(page()).rejects.toThrow("redirect:/login");
    mocks.resolve.mockResolvedValueOnce({ status: "selection_required", workspaces: [] });
    await expect(page()).rejects.toThrow("redirect:/app/pilih-lokasi");
    mocks.resolve.mockResolvedValueOnce(active("staff"));
    expect(await page()).toContain("hanya dapat diatur oleh Owner");
    mocks.resolve.mockResolvedValueOnce({ status: "forbidden", workspaces: [] });
    expect(await page()).toContain("Akses lokasi ditolak");
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("a repository denial shows forbidden; a failure shows a safe state without the form", async () => {
    mocks.read.mockRejectedValueOnce(new AppError("FORBIDDEN"));
    expect(await page()).toContain("Akses lokasi ditolak");
    mocks.read.mockRejectedValueOnce(new Error("synthetic secret mongodb://x"));
    const markup = await page();
    expect(markup).toContain("Pengaturan tidak dapat dimuat"); expect(markup).not.toContain("[Form"); expect(markup).not.toMatch(/synthetic|mongodb/);
  });
});
