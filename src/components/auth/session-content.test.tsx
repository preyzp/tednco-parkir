import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppError } from "../../lib/errors";
import { LoginContent, AuthenticatedContent } from "./session-content";
const mocks = vi.hoisted(() => ({ current: vi.fn(), required: vi.fn(), redirect: vi.fn((path: string) => { throw new Error("redirect:" + path); }) }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/auth-session", () => ({ getCurrentSession: mocks.current, requireAuthenticatedSession: mocks.required }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./login-form", () => ({ LoginForm: () => null }));
vi.mock("./logout-button", () => ({ LogoutButton: () => null }));
vi.mock("./auth-status", () => ({ AuthUnavailable: () => "Layanan tidak tersedia" }));
beforeEach(() => vi.clearAllMocks());
it("redirects an authenticated visitor from login to the guarded placeholder", async () => {
  mocks.current.mockResolvedValue({ user: { name: "Operator" } });
  await expect(LoginContent()).rejects.toThrow("redirect:/app");
});
it("redirects anonymous access to the placeholder back to login", async () => {
  mocks.required.mockRejectedValue(new AppError("UNAUTHENTICATED"));
  await expect(AuthenticatedContent()).rejects.toThrow("redirect:/login");
});
it("renders no user or tenant data when session verification fails", async () => {
  mocks.required.mockRejectedValue(new Error("sensitive connection detail"));
  expect(renderToStaticMarkup(await AuthenticatedContent())).toBe("Layanan tidak tersedia");
});
it("projects only the own name even if a session contains tenant or role claims", async () => {
  mocks.required.mockResolvedValue({ user: { name: "Operator", tenantId: "private-tenant", role: "owner", password: "private-hash" }, session: { token: "private-token" } });
  const html = renderToStaticMarkup(await AuthenticatedContent());
  expect(html).toContain("Operator"); expect(html).toContain("Ruang kerja belum tersedia");
  for (const secret of ["private-tenant", "private-hash", "private-token", "owner"]) expect(html).not.toContain(secret);
});
