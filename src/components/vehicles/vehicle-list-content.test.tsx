import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppError } from "../../lib/errors";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), list: vi.fn(), overview: vi.fn(), redirect: vi.fn((path: string) => { throw new Error("redirect:" + path); }) }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/workspace", () => ({ resolveActiveWorkspace: mocks.resolve }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../lib/dal", async () => {
  const actual = await vi.importActual<typeof import("../../lib/dal/parking-sessions")>("../../lib/dal/parking-sessions");
  return { listLocationVehicles: mocks.list, getLocationParkingOverview: mocks.overview, parseVehicleListQuery: actual.parseVehicleListQuery };
});
vi.mock("../../lib/mongodb", () => ({ getDb: vi.fn(), getMongoClient: vi.fn() }));
vi.mock("../../lib/dal/authorization", () => ({ requirePermission: vi.fn() }));
import { VehicleListContent } from "./vehicle-list-content";

const now = new Date("2026-10-26T04:00:00Z");
const active = (role = "owner") => ({ status: "active", canSwitch: false, workspaces: [], workspace: { tenantId: "a".repeat(24), tenantName: "Parkir Sentosa", locationId: "b".repeat(24), locationName: "Lokasi Utara", role } });
const rows = [
  { id: "1".repeat(24), plateNumber: "B 1234 XYZ", vehicleType: "mobil", entryAt: "2026-10-26T03:15:00.000Z", exitAt: null, status: "active", notes: "helm" },
  { id: "2".repeat(24), plateNumber: "F 9 Z", vehicleType: "motor", entryAt: "2026-10-25T23:00:00.000Z", exitAt: "2026-10-26T01:30:00.000Z", status: "completed" },
];
const result = (extra = {}) => ({ rows, total: 2, page: 1, pageSize: 20, pageCount: 1, timeZone: "Asia/Jakarta", ready: true, ...extra });
const html = async (params: Record<string, string> = {}) => renderToStaticMarkup(await VehicleListContent({ searchParams: Promise.resolve(params), now }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue(active());
  mocks.list.mockResolvedValue(result());
  mocks.overview.mockResolvedValue({ activeCount: 5, entriesToday: 7, exitsToday: 0, timeZone: "Asia/Jakarta", recent: [] });
});

describe("guards and scope", () => {
  it("queries with the guarded workspace scope only, ignoring tenant/location in the URL", async () => {
    await html({ tenantId: "c".repeat(24), locationId: "d".repeat(24), q: "b 12" });
    expect(mocks.list).toHaveBeenCalledWith({ tenantId: "a".repeat(24), locationId: "b".repeat(24) }, { q: "b 12", status: "active", type: "all", page: 1 });
    expect(mocks.overview).toHaveBeenCalledWith({ tenantId: "a".repeat(24), locationId: "b".repeat(24) }, now);
  });
  it("redirects unauthenticated users and unselected locations; denies non-Owners", async () => {
    mocks.resolve.mockRejectedValueOnce(new AppError("UNAUTHENTICATED"));
    await expect(html()).rejects.toThrow("redirect:/login");
    mocks.resolve.mockResolvedValueOnce({ status: "selection_required", workspaces: [] });
    await expect(html()).rejects.toThrow("redirect:/app/pilih-lokasi");
    mocks.resolve.mockResolvedValueOnce(active("staff"));
    expect(await html()).toContain("hanya tersedia untuk Owner");
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it.each([[{ status: "forbidden", workspaces: [] }, "Akses lokasi ditolak"], [{ status: "empty", platformAdmin: false }, "Belum ada akses lokasi"]])("suspended tenant / inactive location state %j shows no list", async (state, text) => {
    mocks.resolve.mockResolvedValue(state);
    const markup = await html();
    expect(markup).toContain(text); expect(mocks.list).not.toHaveBeenCalled();
  });
  it("a guard denial raised by the repository (status changed meanwhile) shows the forbidden state", async () => {
    mocks.list.mockRejectedValue(new AppError("FORBIDDEN"));
    expect(await html()).toContain("Akses lokasi ditolak");
  });
});

describe("content", () => {
  it("shows overview, table and mobile cards with tenant-zone times, duration and status", async () => {
    const markup = await html();
    for (const text of ["Masuk Hari Ini", "Keluar Hari Ini", "Parkir Aktif", "B 1234 XYZ", "helm", "Mobil", "Parkir", "Selesai"]) expect(markup).toContain(text);
    expect(markup).toMatch(/26 Okt 2026[^<]*10[.:]15 WIB/);
    expect(markup).toContain("45 menit"); // active: now − entry
    expect(markup).toContain("2 jam 30 menit"); // completed: exit − entry
    expect(markup).toMatch(/<div class="hidden md:block">.*<table/);
    expect(markup).toMatch(/<ul class="space-y-3 md:hidden"/);
  });
  it("offers Proses Keluar (checkout with payment) only for active rows, keeping the list as returnTo; no status editing", async () => {
    const markup = await html({ status: "all", type: "mobil" });
    const links = [...markup.matchAll(/<a [^>]*href="([^"]*)"[^>]*>(?:(?!<\/a>).)*Proses Keluar<\/a>/g)].map((match) => match[1].replaceAll("&amp;", "&"));
    // Desktop table + mobile card for the one active row; the completed row has none.
    expect(links).toEqual(Array(2).fill(`/app/kendaraan/keluar/${"1".repeat(24)}?returnTo=%2Fapp%2Fkendaraan%3Fstatus%3Dall%26type%3Dmobil`));
    expect(markup).not.toContain(`/app/kendaraan/keluar/${"2".repeat(24)}`);
    expect(markup).not.toContain("Segera"); expect(markup).not.toMatch(/<button[^>]* disabled=""/);
    expect(markup).not.toMatch(/<select|role="combobox"|role="menu"/);
    expect(markup).toContain("Status kendaraan tidak dapat diubah langsung");
  });
  it("status and type filters default to Parkir Aktif / Semua and keep the search", async () => {
    const markup = await html({ q: "1234" });
    const current = [...markup.matchAll(/<a [^>]*aria-current="page"[^>]*>([^<]*)<\/a>/g)].map((match) => match[1]);
    expect(current).toEqual(["Parkir Aktif", "Semua"]);
    for (const href of ["/app/kendaraan?q=1234&amp;status=completed", "/app/kendaraan?q=1234&amp;status=all", "/app/kendaraan?q=1234&amp;type=motor", "/app/kendaraan?q=1234&amp;type=mobil"]) expect(markup).toContain(`href="${href}"`);
  });
  it("renders server-side pagination preserving filters", async () => {
    mocks.list.mockResolvedValue(result({ total: 45, page: 2, pageCount: 3 }));
    const markup = await html({ status: "all", type: "motor", page: "2" });
    expect(markup).toContain("Halaman 2 dari 3");
    expect(markup).toContain('href="/app/kendaraan?status=all&amp;type=motor"');
    expect(markup).toContain('href="/app/kendaraan?status=all&amp;type=motor&amp;page=3"');
  });
  it("distinguishes 'no parked vehicles' from 'no match', and explains a not-ready server", async () => {
    mocks.list.mockResolvedValue(result({ rows: [], total: 0 }));
    const none = await html();
    expect(none).toContain("Belum ada kendaraan terparkir"); expect(none).toContain('href="/app/kendaraan/masuk"'); // list fallback: no returnTo needed
    expect(await html({ q: "zzz" })).toContain("Tidak ada kendaraan yang cocok");
    mocks.list.mockResolvedValue(result({ rows: [], total: 0, ready: false }));
    expect(await html()).toContain("Pencatatan kendaraan belum siap");
  });
  it("shows safe error states when the list or overview cannot be loaded", async () => {
    mocks.list.mockRejectedValue(new Error("synthetic secret"));
    mocks.overview.mockRejectedValue(new Error("synthetic secret"));
    const markup = await html();
    expect(markup).toContain("Daftar kendaraan tidak dapat dimuat"); expect(markup).toContain("Tidak dapat dimuat");
    expect(markup).not.toContain("synthetic");
  });
});
