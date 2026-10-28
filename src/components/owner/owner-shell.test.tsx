import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../auth/logout-button", () => ({ LogoutButton: () => "[Keluar]" }));
import { OwnerShell, type OwnerChrome } from "./owner-shell";
import { OwnerDashboard } from "./owner-dashboard";

const chrome: OwnerChrome = { tenantName: "Parkir Sentosa", locationName: "Lokasi Utara", role: "owner", canSwitch: true, userName: "Budi Santoso", userEmail: "budi@example.test" };
const render = (props: Partial<OwnerChrome> = {}, section: Parameters<typeof OwnerShell>[0]["section"] = "dashboard") => renderToStaticMarkup(<OwnerShell section={section} chrome={{ ...chrome, ...props }}>[Konten]</OwnerShell>);
const anchors = (markup: string) => [...markup.matchAll(/<a [^>]*>/g)].map(([tag]) => tag);

describe("navigation", () => {
  it("links only built modules; unbuilt ones are non-focusable, marked Segera and announced as unavailable", () => {
    const markup = render();
    const hrefs = anchors(markup).map((tag) => /href="([^"]+)"/.exec(tag)?.[1]);
    const linkContents = [...markup.matchAll(/<a [^>]*>(.*?)<\/a>/g)].map((match) => match[1]);
    expect(hrefs).toEqual(expect.arrayContaining(["/app", "/app/kendaraan", "/app/pengaturan", "/app/pilih-lokasi"]));
    // Sidebar "Kendaraan" opens the list, not the entry form.
    expect(hrefs).not.toContain("/app/kendaraan/masuk");
    expect(markup).toContain(">Beranda<"); expect(markup).not.toContain(">Dashboard<");
    for (const label of ["Transaksi", "Prabayar", "Laporan"]) {
      expect(markup).toMatch(new RegExp(`<span aria-disabled="true"[^>]*>.*?${label}.*?Segera.*?\\(belum tersedia\\)`));
      expect(linkContents.some((content) => content.includes(`>${label}<`))).toBe(false);
    }
  });
  it("marks the current section with aria-current", () => {
    const current = (markup: string) => anchors(markup).filter((tag) => tag.includes('aria-current="page"')).map((tag) => /href="([^"]+)"/.exec(tag)?.[1]);
    expect(current(render())).toEqual(["/app"]);
    expect(current(render({}, "pengaturan"))).toEqual(["/app/pengaturan"]);
    expect(current(render({}, "kendaraan"))).toEqual(["/app/kendaraan"]);
  });
  it("hides Owner-only vehicle entry and settings from non-Owner roles", () => {
    for (const role of ["admin", "staff"] as const) { const markup = render({ role }); expect(markup).not.toContain("/app/pengaturan"); expect(markup).not.toContain('href="/app/kendaraan"'); }
  });
  it("is responsive: sidebar from lg up, menu trigger below lg", () => {
    const markup = render();
    expect(markup).toMatch(/<aside[^>]*class="[^"]*\bhidden\b[^"]*\blg:flex\b/);
    expect(markup).toMatch(/<button[^>]*class="[^"]*\blg:hidden\b[^"]*"[^>]*aria-label="Buka menu navigasi"|<button[^>]*aria-label="Buka menu navigasi"[^>]*class="[^"]*\blg:hidden\b/);
  });
});

describe("header and identity", () => {
  it("shows business, active location, profile and a location switch only when several locations exist", () => {
    const markup = render();
    for (const text of ["Parkir Sentosa", "Lokasi aktif: Lokasi Utara", "Budi Santoso", "Ganti lokasi aktif", "[Konten]", "[Keluar]"]) expect(markup).toContain(text);
    expect(render({ canSwitch: false })).not.toContain("/app/pilih-lokasi");
  });
});

describe("dashboard", () => {
  const overview = { activeCount: 12, entriesToday: 34, exitsToday: 3, revenueToday: 25_000, timeZone: "Asia/Jakarta", recent: [{ plateNumber: "B 1234 XYZ", vehicleType: "mobil" as const, entryAt: "2026-10-26T03:15:00.000Z", status: "active" as const }] };
  const dash = (props: Partial<Parameters<typeof OwnerDashboard>[0]> = {}) => renderToStaticMarkup(<OwnerDashboard locationName="Lokasi Utara" role="owner" overview={overview} {...props} />);
  const kpis = (markup: string) => [...markup.matchAll(/<p class="text-3xl[^"]*"[^>]*>([^<]*)<\/p>/g)].map((match) => match[1]);
  it("shows real active/entered/exited counts and revenue from completed payments (Rupiah)", () => {
    const markup = dash();
    expect(kpis(markup)).toEqual(["12", "34", "3", "Rp25.000"]);
    expect(markup).toContain("Pembayaran tunai selesai hari ini");
    expect(markup).not.toContain("Segera"); expect(markup).not.toContain("belum aktif");
    expect(markup).toContain(">Beranda<");
  });
  it("shows a load failure instead of numbers when the overview is unavailable", () => {
    const markup = dash({ overview: null });
    expect(kpis(markup)).toEqual(["—", "—", "—", "—"]);
    expect(markup).toContain("Tidak dapat dimuat"); expect(markup).toContain("Aktivitas tidak dapat dimuat");
  });
  it("lists recent entries in the tenant time zone, or an empty state", () => {
    const markup = dash();
    expect(markup).toContain("B 1234 XYZ"); expect(markup).toMatch(/Mobil · masuk 10[.:]15/); expect(markup).toContain("Parkir");
    expect(dash({ overview: { ...overview, recent: [] } })).toContain("Belum ada aktivitas");
  });
  it("Aksi Cepat: Kendaraan Masuk and Kendaraan Keluar both open their flows", () => {
    const markup = dash();
    expect(markup).toContain(">Aksi Cepat<");
    // Opened from Beranda, so the entry form's "Kembali" returns here.
    expect(markup).toMatch(/<a [^>]*href="\/app\/kendaraan\/masuk\?returnTo=%2Fapp"[^>]*>.*?Kendaraan Masuk/);
    expect(markup).toMatch(/<a [^>]*href="\/app\/kendaraan\/keluar"[^>]*>.*?Kendaraan Keluar/);
    expect(markup).not.toContain('aria-disabled="true"');
  });
  it("non-Owners do not get the entry or exit quick actions", () => {
    const staff = dash({ role: "staff" });
    expect(staff).not.toContain("/app/kendaraan/masuk"); expect(staff).not.toContain("/app/kendaraan/keluar");
    expect(staff.match(/Saat ini hanya untuk Owner\./g)).toHaveLength(2);
  });
});
