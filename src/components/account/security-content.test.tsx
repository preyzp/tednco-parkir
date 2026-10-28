import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppError } from "../../lib/errors";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), redirect: vi.fn((path: string) => { throw new Error("redirect:" + path); }) }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/dal", () => ({ requireOwnerAccount: mocks.owner }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../auth/logout-button", () => ({ LogoutButton: () => "[Keluar]" }));
vi.mock("./change-password-form", () => ({ ChangePasswordForm: () => "[FormPassword]" }));
import { SecuritySettingsContent } from "./security-content";

const render = async () => renderToStaticMarkup(await SecuritySettingsContent());
beforeEach(() => vi.clearAllMocks());

it("renders the form only after the server Owner gate passes", async () => {
  mocks.owner.mockResolvedValue(undefined);
  const markup = await render();
  expect(mocks.owner).toHaveBeenCalledOnce();
  expect(markup).toContain("Keamanan akun"); expect(markup).toContain("[FormPassword]");
});
it("redirects visitors without a session to login", async () => {
  mocks.owner.mockRejectedValue(new AppError("UNAUTHENTICATED"));
  await expect(SecuritySettingsContent()).rejects.toThrow("redirect:/login");
});
it("denies non-Owner accounts (staff, admin, platform admin, inactive tenant) without the form", async () => {
  mocks.owner.mockRejectedValue(new AppError("FORBIDDEN"));
  const markup = await render();
  expect(markup).toContain("Pengaturan keamanan tidak tersedia");
  expect(markup).not.toContain("[FormPassword]");
});
it("shows a safe unavailable state", async () => {
  mocks.owner.mockRejectedValue(new Error("synthetic secret"));
  const markup = await render();
  expect(markup).toContain("Layanan belum tersedia");
  expect(markup).not.toContain("synthetic"); expect(markup).not.toContain("[FormPassword]");
});
it("offers 'Kembali' to the Pengaturan hub above the title", async () => {
  mocks.owner.mockResolvedValue(undefined);
  const markup = await render();
  expect(markup).toMatch(/<a[^>]*aria-label="Kembali ke Pengaturan"[^>]*href="\/app\/pengaturan"[^>]*>.*?Kembali<\/a>/);
  expect(markup.indexOf("Kembali")).toBeLessThan(markup.indexOf("<h1"));
});
