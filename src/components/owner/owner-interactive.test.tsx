// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ logout: vi.fn(), replace: vi.fn(), refresh: vi.fn(), toastError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("../../lib/auth-client", () => ({ logoutCurrentSession: mocks.logout }));
vi.mock("../auth/logout-button", () => ({ LogoutButton: () => <button type="button">Keluar</button> }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
import { OwnerMobileNav } from "./owner-mobile-nav";
import { OwnerProfileMenu } from "./owner-profile-menu";

beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("mobile navigation drawer", () => {
  const renderNav = (role: "owner" | "staff" = "owner") => render(<OwnerMobileNav active="dashboard" role={role} tenantName="Parkir Sentosa" locationName="Lokasi Utara" switchHref="/app/pilih-lokasi" />);
  it("opens from the menu button with business, location and the same navigation", async () => {
    renderNav(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Buka menu navigasi" }));
    const drawer = await screen.findByRole("dialog");
    expect(drawer.textContent).toContain("Parkir Sentosa"); expect(drawer.textContent).toContain("Lokasi Utara");
    const nav = within(drawer).getByRole("navigation", { name: "Navigasi utama" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Beranda", "Kendaraan", "Pengaturan"]);
    expect(within(nav).getByRole("link", { name: "Beranda" }).getAttribute("aria-current")).toBe("page");
    for (const label of ["Transaksi", "Prabayar", "Laporan"]) expect(within(nav).getByText(label).closest("[aria-disabled=true]")).not.toBeNull();
    expect(within(drawer).getByRole("link", { name: "Ganti lokasi aktif" }).getAttribute("href")).toBe("/app/pilih-lokasi");
  });
  it("closes after choosing a destination and with Escape, returning focus to the trigger", async () => {
    renderNav(); const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Buka menu navigasi" });
    await user.click(trigger);
    await user.click(within(await screen.findByRole("dialog")).getByRole("link", { name: "Beranda" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(trigger);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
  it("does not offer Owner-only vehicle entry or settings to staff", async () => {
    renderNav("staff"); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Buka menu navigasi" }));
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).queryByRole("link", { name: "Pengaturan" })).toBeNull();
    expect(within(drawer).queryByRole("link", { name: "Kendaraan" })).toBeNull();
  });
});

describe("profile menu", () => {
  const open = async (role: "owner" | "staff" = "owner") => {
    render(<OwnerProfileMenu name="Budi Santoso" email="budi@example.test" role={role} />); const user = userEvent.setup();
    screen.getByRole("button", { name: "Profil Budi Santoso" }).focus();
    await user.keyboard("{Enter}");
    return { user, menu: await screen.findByRole("menu") };
  };
  it("shows identity and role, with account security for Owners only", async () => {
    const { menu } = await open();
    for (const text of ["Budi Santoso", "budi@example.test", "Peran: Pemilik"]) expect(menu.textContent).toContain(text);
    expect(within(menu).getByRole("menuitem", { name: "Keamanan akun" }).getAttribute("href")).toBe("/app/pengaturan/keamanan");
    cleanup();
    const staff = await open("staff");
    expect(within(staff.menu).queryByRole("menuitem", { name: "Keamanan akun" })).toBeNull();
  });
  it("navigates to login only after the server confirms logout", async () => {
    mocks.logout.mockResolvedValue({ ok: true });
    const { user, menu } = await open();
    await user.click(within(menu).getByRole("menuitem", { name: "Keluar" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(mocks.logout).toHaveBeenCalledTimes(1);
  });
  it("stays signed in and shows an error toast when logout is not confirmed", async () => {
    mocks.logout.mockResolvedValue({ ok: false, message: "Keluar belum dapat dikonfirmasi. Silakan coba lagi." });
    const { user, menu } = await open();
    await user.click(within(menu).getByRole("menuitem", { name: "Keluar" }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
