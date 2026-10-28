import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppError } from "../../lib/errors";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), view: vi.fn(), list: vi.fn(), redirect: vi.fn((path: string) => { throw new Error("redirect:" + path); }) }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/workspace", () => ({ resolveActiveWorkspace: mocks.resolve }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../lib/parking-actions", () => ({ confirmCheckoutAction: vi.fn() }));
vi.mock("./checkout-form", () => ({ CheckoutForm: ({ backHref }: { backHref: string }) => `[CheckoutForm back=${backHref}]` }));
vi.mock("../../lib/dal", async () => {
  const actual = await vi.importActual<typeof import("../../lib/dal/parking-sessions")>("../../lib/dal/parking-sessions");
  return { getParkingCheckout: mocks.view, listLocationVehicles: mocks.list, parseVehicleListQuery: actual.parseVehicleListQuery };
});
vi.mock("../../lib/mongodb", () => ({ getDb: vi.fn(), getMongoClient: vi.fn() }));
vi.mock("../../lib/dal/authorization", () => ({ requirePermission: vi.fn() }));
import { CheckoutContent } from "./checkout-content";
import { CheckoutSearchContent } from "./checkout-search-content";

const now = new Date("2026-10-27T01:00:00Z");
const scope = { tenantId: "a".repeat(24), locationId: "b".repeat(24) };
const active = (role = "owner") => ({ status: "active", canSwitch: false, workspaces: [], workspace: { ...scope, tenantName: "Parkir Sentosa", locationName: "Lokasi Utara", role } });
const sid = "1".repeat(24);
const detail = async (params: Record<string, string> = {}) => renderToStaticMarkup(await CheckoutContent({ params: Promise.resolve({ sessionId: sid }), searchParams: Promise.resolve(params), now }));
const search = async (params: Record<string, string> = {}) => renderToStaticMarkup(await CheckoutSearchContent({ searchParams: Promise.resolve(params), now }));
const receipt = { plateNumber: "B 1234 XYZ", vehicleType: "mobil", locationName: "Lokasi Utara", entryAt: "2026-10-26T03:00:00.000Z", exitAt: "2026-10-27T01:00:00.000Z", timeZone: "Asia/Jakarta", tariffType: "overnight", nightCount: 1, amountPerUnit: 10_000, totalAmount: 10_000, paymentMethod: "cash" };
const row = (id: string, plate: string) => ({ id, plateNumber: plate, vehicleType: "motor", entryAt: "2026-10-26T23:00:00.000Z", exitAt: null, status: "active" });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue(active());
  mocks.view.mockResolvedValue({ kind: "active", quote: {} });
  mocks.list.mockResolvedValue({ rows: [row("2".repeat(24), "F 9 Z")], total: 1, page: 1, pageSize: 20, pageCount: 1, timeZone: "Asia/Jakarta", ready: true });
});

describe("checkout detail guards", () => {
  it("loads the session with the guarded scope and server time; URL tenant/location are ignored", async () => {
    await detail({ tenantId: "c".repeat(24), locationId: "d".repeat(24) });
    expect(mocks.view).toHaveBeenCalledWith(scope, sid, now);
  });
  it("redirects unauthenticated users and unselected locations; denies non-Owners without loading", async () => {
    mocks.resolve.mockRejectedValueOnce(new AppError("UNAUTHENTICATED"));
    await expect(detail()).rejects.toThrow("redirect:/login");
    mocks.resolve.mockResolvedValueOnce({ status: "selection_required", workspaces: [] });
    await expect(detail()).rejects.toThrow("redirect:/app/pilih-lokasi");
    for (const role of ["admin", "staff"]) { mocks.resolve.mockResolvedValueOnce(active(role)); expect(await detail()).toContain("hanya tersedia untuk Owner"); }
    expect(mocks.view).not.toHaveBeenCalled();
  });
  it.each([[{ status: "forbidden", workspaces: [] }, "Akses lokasi ditolak"], [{ status: "empty", platformAdmin: false }, "Belum ada akses lokasi"]])("suspended tenant / inactive location %j", async (state, text) => {
    mocks.resolve.mockResolvedValue(state);
    expect(await detail()).toContain(text); expect(mocks.view).not.toHaveBeenCalled();
  });
  it("a repository denial shows the forbidden state; a failure never shows the form", async () => {
    mocks.view.mockRejectedValueOnce(new AppError("FORBIDDEN"));
    expect(await detail()).toContain("Akses lokasi ditolak");
    mocks.view.mockRejectedValueOnce(new Error("synthetic secret"));
    const markup = await detail();
    expect(markup).toContain("Data kendaraan tidak dapat dimuat"); expect(markup).not.toContain("[CheckoutForm"); expect(markup).not.toContain("synthetic");
  });
});

describe("checkout detail views", () => {
  it("active: the form, with a validated back target (list with filters, search, or fallback)", async () => {
    expect(await detail({ returnTo: "/app/kendaraan?status=all" })).toContain("[CheckoutForm back=/app/kendaraan?status=all]");
    expect(await detail({ returnTo: "/app/kendaraan/keluar?q=B1" })).toContain("[CheckoutForm back=/app/kendaraan/keluar?q=B1]");
    for (const returnTo of ["https://evil.example", "//evil.example", "/platform", "/app"]) expect(await detail({ returnTo })).toContain("[CheckoutForm back=/app/kendaraan/keluar]");
    expect(await detail()).toMatch(/aria-label="Kembali ke pencarian kendaraan keluar"/);
  });
  it("completed: read-only receipt, no form", async () => {
    mocks.view.mockResolvedValue({ kind: "completed", receipt });
    const markup = await detail();
    expect(markup).toContain("Kendaraan sudah keluar"); expect(markup).toContain("Rp10.000"); expect(markup).toContain("read-only");
    expect(markup).not.toContain("[CheckoutForm");
  });
  it.each([
    [{ kind: "canceled", plateNumber: "B 1" }, "Sesi parkir dibatalkan"],
    [{ kind: "not_found" }, "Sesi parkir tidak ditemukan"],
    [{ kind: "not_ready" }, "Proses keluar belum siap"],
    [{ kind: "tariff_unavailable" }, "Tarif belum konsisten"],
    [{ kind: "completed", receipt: null }, "Kendaraan sudah keluar"],
  ])("%j shows a clear state without the form", async (view, text) => {
    mocks.view.mockResolvedValue(view);
    const markup = await detail();
    expect(markup).toContain(text); expect(markup).not.toContain("[CheckoutForm");
  });
});

describe("checkout search (from Beranda)", () => {
  it("lists active vehicles only with the guarded scope, ignoring status/type/tenant from the URL", async () => {
    await search({ q: "f 9", status: "completed", type: "mobil", tenantId: "c".repeat(24), page: "2" });
    expect(mocks.list).toHaveBeenCalledWith(scope, { q: "f 9", status: "active", type: "all", page: 2 });
  });
  it("links each vehicle to the shared checkout flow with this search as returnTo, and goes back to Beranda", async () => {
    const markup = await search({ q: "f 9" });
    expect(markup).toContain(`href="/app/kendaraan/keluar/${"2".repeat(24)}?returnTo=%2Fapp%2Fkendaraan%2Fkeluar%3Fq%3Df%2B9"`);
    expect(markup).toMatch(/aria-label="Kembali ke Beranda"[^>]*href="\/app"/);
    expect(markup).toContain('action="/app/kendaraan/keluar"');
  });
  it("empty and not-found states, plus guards", async () => {
    mocks.list.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 20, pageCount: 0, timeZone: "Asia/Jakarta", ready: true });
    expect(await search()).toContain("Tidak ada kendaraan yang sedang parkir");
    expect(await search({ q: "zzz" })).toContain("Kendaraan tidak ditemukan");
    mocks.resolve.mockResolvedValueOnce(active("staff"));
    expect(await search()).toContain("hanya tersedia untuk Owner");
    mocks.list.mockRejectedValueOnce(new Error("synthetic"));
    const failed = await search();
    expect(failed).toContain("tidak dapat dimuat"); expect(failed).not.toContain("synthetic");
  });
});
