import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppError } from "../../lib/errors";
const mocks = vi.hoisted(() => ({ overview: vi.fn(), list: vi.fn(), detail: vi.fn(), guard: vi.fn(), redirect: vi.fn((path: string) => { throw new Error("redirect:" + path); }) }));
vi.mock("server-only", () => ({}));
vi.mock("./create-tenant-form", () => ({ CreateTenantForm: () => "[FormTenant]" }));
vi.mock("./tenant-management", () => ({
  RenameTenantDialog: ({ currentName }: { currentName: string }) => `[Rename:${currentName}]`,
  TenantStatusActions: ({ status }: { status: string }) => `[Status:${status}]`,
}));
vi.mock("./tenant-resources", () => ({
  RenameOwnerDialog: ({ currentName }: { currentName: string }) => `[OwnerRename:${currentName}]`,
  LocationDialog: ({ location }: { location?: { name: string } }) => (location ? `[LocationEdit:${location.name}]` : "[LocationCreate]"),
  LocationStatusDialog: ({ location }: { location: { name: string; status: string } }) => `[LocationStatus:${location.name}:${location.status}]`,
}));
vi.mock("../../lib/dal", () => ({
  getPlatformOverview: mocks.overview,
  listPlatformTenants: mocks.list,
  getPlatformTenantDetail: mocks.detail,
  requirePlatformAccess: mocks.guard,
  parseTenantListQuery: (params: Record<string, string | undefined>) => ({ ...(params.q ? { q: params.q } : {}), ...(params.status ? { status: params.status } : {}), page: Number(params.page ?? 1) }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../auth/logout-button", () => ({ LogoutButton: () => "[Keluar]" }));
vi.mock("../theme-switcher", () => ({ ThemeSwitcher: () => "[Tema]" }));
import { NewTenantContent, PlatformDashboard, TenantDetailContent, TenantDirectory } from "./platform-content";
import { PlatformFrame } from "./platform-frame";

const row = (name: string, status: string, locationCount: number) => ({ id: name.padEnd(24, "0").slice(0, 24), name, status, locationCount, createdAt: "2026-01-04T00:00:00.000Z" });
const overview = { totalTenants: 4, activeTenants: 2, inactiveTenants: 2, totalLocations: 3, recentTenants: [row("Parkir Pusat", "active", 1), row("Parkir Mitra", "suspended", 0)] };
const list = (rows = [row("Parkir Pusat", "active", 1)], extra = {}) => ({ rows, total: rows.length, page: 1, pageSize: 20, pageCount: 1, ...extra });
const render = async (node: Promise<React.ReactElement>) => renderToStaticMarkup(await node);
const directory = (params: Record<string, string> = {}) => TenantDirectory({ searchParams: Promise.resolve(params) });
beforeEach(() => vi.clearAllMocks());

const detail = (tenantId = "a".repeat(24), params: Record<string, string> = {}) => TenantDetailContent({ params: Promise.resolve({ tenantId }), searchParams: Promise.resolve(params) });
const rejectAll = (error: unknown) => { for (const fn of [mocks.overview, mocks.list, mocks.detail, mocks.guard]) fn.mockRejectedValue(error); };

describe("guarded states (every /platform page)", () => {
  const pages = [["dashboard", () => PlatformDashboard()], ["tenants", () => directory()], ["new tenant form", () => NewTenantContent()], ["tenant detail", () => detail()]] as const;
  it.each(pages)("%s redirects unauthenticated visitors to login", async (_name, page) => {
    rejectAll(new AppError("UNAUTHENTICATED"));
    await expect(page()).rejects.toThrow("redirect:/login");
  });
  it.each(pages)("%s denies Owner/Admin/Staff without rendering platform data or the form", async (_name, page) => {
    rejectAll(new AppError("FORBIDDEN"));
    const markup = await render(page());
    expect(markup).toContain("Akses Platform Admin ditolak");
    expect(markup).toContain('href="/app"');
    expect(markup).not.toMatch(/Ringkasan Platform|Daftar Tenant|FormTenant|Profil usaha/);
  });
  it.each(pages)("%s shows a safe unavailable state", async (_name, page) => {
    rejectAll(new Error("synthetic secret"));
    const markup = await render(page());
    expect(markup).toContain("Layanan belum tersedia");
    expect(markup).not.toContain("synthetic");
  });
});

describe("dashboard", () => {
  it("renders database-backed stats and recent tenants with a link to the tenant list", async () => {
    mocks.overview.mockResolvedValue(overview);
    const markup = await render(PlatformDashboard());
    for (const text of ["Ringkasan Platform", "Total Tenant", "Tenant Aktif", "Tenant Nonaktif", "Total Lokasi", "Parkir Pusat", "Ditangguhkan", 'href="/platform/tenants"']) expect(markup).toContain(text);
    expect(markup).toMatch(/Total Lokasi<\/p><p[^>]*>3</);
    // The id appears only inside the detail link, never as visible text.
    const id = overview.recentTenants[0].id;
    expect(markup.split(id).length - 1).toBe(markup.split(`href="/platform/tenants/${id}"`).length - 1);
    expect(markup).toContain(`href="/platform/tenants/${id}"`);
  });
  it("shows an empty state when no tenants exist", async () => {
    mocks.overview.mockResolvedValue({ ...overview, totalTenants: 0, activeTenants: 0, inactiveTenants: 0, totalLocations: 0, recentTenants: [] });
    expect(await render(PlatformDashboard())).toContain("Belum ada tenant");
  });
});

describe("tenant directory", () => {
  it("passes the parsed URL query to the server repository and renders a table with all columns", async () => {
    mocks.list.mockResolvedValue(list());
    const markup = await render(directory({ q: "pusat", status: "active" }));
    expect(mocks.list).toHaveBeenCalledWith({ q: "pusat", status: "active", page: 1 });
    for (const text of ["Nama Usaha", "Status", "Jumlah Lokasi", "Tanggal Dibuat", "Parkir Pusat", "Aktif", 'value="pusat"', 'name="status" value="active"']) expect(markup).toContain(text);
    const current = [...markup.matchAll(/<a [^>]*aria-current="page"[^>]*>([^<]*)</g)].map((match) => match[1]);
    expect(current).toEqual(["Aktif"]);
  });
  it("offers status filters that preserve the search and reset paging", async () => {
    mocks.list.mockResolvedValue(list());
    const markup = await render(directory({ q: "pusat", page: "1" }));
    for (const href of ["/platform/tenants?q=pusat", "/platform/tenants?q=pusat&amp;status=active", "/platform/tenants?q=pusat&amp;status=suspended", "/platform/tenants?q=pusat&amp;status=archived"]) expect(markup).toContain(`href="${href}"`);
  });
  it("renders server-side pagination links", async () => {
    mocks.list.mockResolvedValue(list([row("Parkir Pusat", "active", 1)], { total: 45, page: 2, pageCount: 3 }));
    const markup = await render(directory({ page: "2" }));
    expect(markup).toContain("Halaman 2 dari 3");
    expect(markup).toContain('href="/platform/tenants"'); // page 1 omits the param
    expect(markup).toContain('href="/platform/tenants?page=3"');
  });
  it("distinguishes an empty platform from an empty filter result", async () => {
    mocks.list.mockResolvedValue(list([]));
    expect(await render(directory())).toContain("Belum ada tenant");
    const filtered = await render(directory({ q: "tidak-ada" }));
    expect(filtered).toContain("Tidak ada tenant yang cocok");
    expect(filtered).toContain("Hapus filter");
  });
});

describe("create tenant pages", () => {
  it("renders the form only after the server platform guard passes, with a link from the list", async () => {
    mocks.guard.mockResolvedValue(undefined);
    const markup = await render(NewTenantContent());
    expect(mocks.guard).toHaveBeenCalledOnce();
    expect(markup).toContain("Buat Tenant Baru"); expect(markup).toContain("[FormTenant]");
    mocks.list.mockResolvedValue(list());
    expect(await render(directory())).toContain('href="/platform/tenants/new"');
  });
  const tenant = { id: "a".repeat(24), name: "Parkir Sentosa", slug: "parkir-sentosa", status: "active", timezone: "Asia/Makassar", createdAt: "2026-01-04T00:00:00.000Z", locations: [{ id: "c".repeat(24), name: "Lokasi Utara", address: "Jl. Mawar 1", status: "active" }], owners: [{ userId: "d".repeat(24), name: "Budi", email: "budi@example.test", accountStatus: "active", membershipStatus: "active" }] };
  it("detail shows the stored profile, Owner status and first location", async () => {
    mocks.detail.mockResolvedValue(tenant);
    const markup = await render(detail());
    expect(mocks.detail).toHaveBeenCalledWith("a".repeat(24));
    for (const text of ["Parkir Sentosa", "parkir-sentosa", "Asia/Makassar", "Budi", "budi@example.test", "Akun dan membership aktif", "Lokasi Utara", "Jl. Mawar 1"]) expect(markup).toContain(text);
    expect(markup).not.toContain("berhasil dibuat");
  });
  it("after creation confirms success only when the database shows an active Owner", async () => {
    mocks.detail.mockResolvedValue(tenant);
    expect(await render(detail(undefined, { dibuat: "1" }))).toContain("Tenant dan akun Owner berhasil dibuat");
    mocks.detail.mockResolvedValue({ ...tenant, owners: [] });
    const missing = await render(detail(undefined, { dibuat: "1" }));
    expect(missing).toContain("Status Owner perlu diperiksa");
    expect(missing).not.toContain("berhasil dibuat");
  });
  it("detail offers rename and status management driven by the stored status", async () => {
    mocks.detail.mockResolvedValue(tenant);
    const markup = await render(detail());
    expect(markup).toContain("Status Tenant"); expect(markup).toContain("[Rename:Parkir Sentosa]"); expect(markup).toContain("[Status:active]");
    expect(markup).not.toContain("tidak dapat mengakses operasional");
  });
  it.each(["suspended", "archived"])("a %s tenant shows an access warning and its own transitions", async (status) => {
    mocks.detail.mockResolvedValue({ ...tenant, status });
    const markup = await render(detail());
    expect(markup).toContain("tidak dapat mengakses operasional");
    expect(markup).toContain(`[Status:${status}]`);
  });
  it("groups the detail into business info, Owner account, parking locations and tenant status", async () => {
    mocks.detail.mockResolvedValue({ ...tenant, locations: [...tenant.locations, { id: "e".repeat(24), name: "Lokasi Barat", status: "inactive" }] });
    const markup = await render(detail());
    const order = ["Informasi Usaha", "Akun Owner", "Lokasi Parkir", "Status Tenant"].map((heading) => markup.indexOf(heading));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(markup).toContain("Slug (tidak dapat diubah)");
    for (const text of ["[Rename:Parkir Sentosa]", "[OwnerRename:Budi]", "[LocationCreate]", "[LocationEdit:Lokasi Utara]", "[LocationStatus:Lokasi Utara:active]", "[LocationStatus:Lokasi Barat:inactive]", "[Status:active]"]) expect(markup).toContain(text);
    expect(markup).toMatch(/Nonaktif/);
  });
  it("keeps Owner email changes disabled and explains the secure password path", async () => {
    mocks.detail.mockResolvedValue(tenant);
    const markup = await render(detail());
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>.*?Ubah email<\/button>/);
    expect(markup).toContain("Ubah email belum tersedia");
    expect(markup).toContain("perubahan password harus melalui alur reset yang aman");
    expect(markup).not.toMatch(/type="password"/);
  });
  it.each([["owner", "Nama Owner diperbarui"], ["lokasi-baru", "Lokasi baru ditambahkan"], ["lokasi", "Lokasi diperbarui"], ["status-lokasi", "Status lokasi diperbarui"]])("confirms the %s update", async (notice, text) => {
    mocks.detail.mockResolvedValue(tenant);
    expect(await render(detail(undefined, { diperbarui: notice }))).toContain(text);
  });
  it("disables status changes for an unknown stored status", async () => {
    mocks.detail.mockResolvedValue({ ...tenant, status: "unknown" });
    const markup = await render(detail());
    expect(markup).not.toContain("[Status:"); expect(markup).toContain("perubahan status dinonaktifkan");
  });
  it.each([["nama", "Nama usaha diperbarui"], ["status", "Status tenant diperbarui"]])("confirms a %s update from the server-rendered state", async (notice, text) => {
    mocks.detail.mockResolvedValue({ ...tenant, status: "suspended" });
    const markup = await render(detail(undefined, { diperbarui: notice }));
    expect(markup).toContain(text);
    if (notice === "status") expect(markup).toContain("Status saat ini: Ditangguhkan");
  });
  it("detail of an unknown tenant shows not found", async () => {
    mocks.detail.mockResolvedValue(null);
    expect(await render(detail("zzz"))).toContain("Tenant tidak ditemukan");
  });
});

it("platform frame marks the current section for assistive technology", () => {
  const markup = renderToStaticMarkup(<PlatformFrame active="tenants">x</PlatformFrame>);
  const links = [...markup.matchAll(/<a [^>]*>/g)].map(([tag]) => tag);
  expect(links.filter((tag) => tag.includes('aria-current="page"')).map((tag) => /href="([^"]+)"/.exec(tag)?.[1])).toEqual(["/platform/tenants"]);
  expect(markup).toContain("Platform Admin");
});
