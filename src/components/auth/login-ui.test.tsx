// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";
import { LogoutButton } from "./logout-button";

const mocks = vi.hoisted(() => ({ login: vi.fn(), logout: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("../../lib/auth-client", () => ({ loginWithPassword: mocks.login, logoutCurrentSession: mocks.logout }));
beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);
async function fill() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Alamat email"), "operator@example.test");
  await user.type(screen.getByLabelText("Kata sandi"), "test-password");
  return user;
}
function deferred() {
  let resolve!: (value: { ok: true }) => void;
  const promise = new Promise<{ ok: true }>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("login interactions", () => {
  it("announces required errors, associates descriptions and focuses first invalid field", async () => {
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));
    const email = screen.getByLabelText("Alamat email");
    expect(document.activeElement).toBe(email);
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(email.getAttribute("aria-describedby")).toBe("email-error");
    expect(screen.getAllByRole("alert").map((node) => node.textContent)).toEqual(["Masukkan alamat email Anda.", "Masukkan kata sandi Anda."]);
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it("rejects malformed email and then focuses missing password", async () => {
    render(<LoginForm />); const user = userEvent.setup();
    await user.type(screen.getByLabelText("Alamat email"), "invalid");
    await user.click(screen.getByRole("button", { name: "Masuk" }));
    expect(screen.getByText("Masukkan alamat email yang valid.")).toBeTruthy();
    await user.clear(screen.getByLabelText("Alamat email"));
    await user.type(screen.getByLabelText("Alamat email"), "a@example.test");
    await user.click(screen.getByRole("button", { name: "Masuk" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Kata sandi"));
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it("supports keyboard order and password visibility without submitting", async () => {
    render(<LoginForm />); const user = userEvent.setup();
    await user.tab(); expect(document.activeElement).toBe(screen.getByLabelText("Alamat email"));
    await user.tab(); expect(document.activeElement).toBe(screen.getByLabelText("Kata sandi"));
    await user.tab(); expect(document.activeElement).toBe(screen.getByRole("button", { name: "Tampilkan kata sandi" }));
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Kata sandi").getAttribute("type")).toBe("text");
    expect(screen.getByRole("button", { name: "Sembunyikan kata sandi" }).getAttribute("aria-pressed")).toBe("true");
    await user.keyboard(" "); expect(screen.getByLabelText("Kata sandi").getAttribute("type")).toBe("password");
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it("waits for confirmed login, blocks duplicate submits and clears password before navigation", async () => {
    const pending = deferred(); mocks.login.mockReturnValue(pending.promise);
    render(<LoginForm />); const user = await fill();
    await user.dblClick(screen.getByRole("button", { name: "Masuk" }));
    expect(mocks.login).toHaveBeenCalledTimes(1);
    expect(mocks.login).toHaveBeenCalledWith({ email: "operator@example.test", password: "test-password" });
    expect(screen.getByRole("button", { name: "Memproses..." }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Sedang memeriksa");
    expect(mocks.replace).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ ok: true }));
    expect(mocks.replace).toHaveBeenCalledWith("/app"); expect(mocks.refresh).toHaveBeenCalledOnce();
    expect((screen.getByLabelText("Kata sandi") as HTMLInputElement).value).toBe("");
  });
  it("announces credential failure without navigating and permits retry", async () => {
    mocks.login.mockResolvedValue({ ok: false, message: "Email atau kata sandi tidak sesuai." });
    render(<LoginForm />); const user = await fill(); await user.click(screen.getByRole("button", { name: "Masuk" }));
    expect(screen.getByRole("alert").textContent).toContain("Email atau kata sandi tidak sesuai.");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Masuk" }).hasAttribute("disabled")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Masuk" })); expect(mocks.login).toHaveBeenCalledTimes(2);
  });
  it("does not reveal unexpected error details", async () => {
    mocks.login.mockRejectedValue(new Error("sensitive internal details"));
    render(<LoginForm />); const user = await fill(); await user.click(screen.getByRole("button", { name: "Masuk" }));
    expect(screen.getByRole("alert").textContent).toContain("Periksa koneksi");
    expect(document.body.textContent).not.toContain("sensitive internal details"); expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("provides a retryable unavailable state without public registration", () => {
    render(<LoginForm initiallyUnavailable />);
    expect(screen.getByRole("alert").textContent).toContain("Layanan masuk sedang tidak tersedia");
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("logout interactions", () => {
  it("waits for logout confirmation and blocks duplicate requests", async () => {
    const pending = deferred(); mocks.logout.mockReturnValue(pending.promise);
    render(<LogoutButton />); await userEvent.dblClick(screen.getByRole("button", { name: "Keluar" }));
    expect(mocks.logout).toHaveBeenCalledOnce(); expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Mengakhiri sesi..." }).hasAttribute("disabled")).toBe(true);
    await act(async () => pending.resolve({ ok: true }));
    expect(mocks.replace).toHaveBeenCalledWith("/login"); expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("keeps the page on unconfirmed logout and announces failure", async () => {
    mocks.logout.mockResolvedValue({ ok: false, message: "Keluar belum dapat dikonfirmasi. Silakan coba lagi." });
    render(<LogoutButton />); await userEvent.click(screen.getByRole("button", { name: "Keluar" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("belum dapat dikonfirmasi"));
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
