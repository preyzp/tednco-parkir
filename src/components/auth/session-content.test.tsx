import { beforeEach, expect, it, vi } from "vitest";
import { LoginContent } from "./session-content";
const mocks = vi.hoisted(() => ({ current: vi.fn(), redirect: vi.fn((path: string) => { throw new Error("redirect:" + path); }) }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/auth-session", () => ({ getCurrentSession: mocks.current }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./login-form", () => ({ LoginForm: () => null }));
beforeEach(() => vi.clearAllMocks());
it("redirects an authenticated visitor from login to the guarded workspace", async () => {
  mocks.current.mockResolvedValue({ user: { name: "Operator" } });
  await expect(LoginContent()).rejects.toThrow("redirect:/app");
});
it("renders the login form for anonymous visitors and when verification is unavailable", async () => {
  mocks.current.mockResolvedValue(null);
  await expect(LoginContent()).resolves.toBeTruthy();
  mocks.current.mockRejectedValue(new Error("sensitive connection detail"));
  await expect(LoginContent()).resolves.toMatchObject({ props: { initiallyUnavailable: true } });
  expect(mocks.redirect).not.toHaveBeenCalled();
});
