// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, configure } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Typing-heavy jsdom form: generous limits for loaded parallel runs (logic unchanged).
vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 5_000 });
const mocks = vi.hoisted(() => ({ change: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));
vi.mock("../../lib/auth-client", () => ({ changeOwnerPassword: mocks.change }));
import { ChangePasswordForm } from "./change-password-form";

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}\\*?$`)) as HTMLInputElement;
const current = "synthetic-old-password"; const next = "synthetic-new-password";
async function fill(user: ReturnType<typeof userEvent.setup>, values: { current?: string; next?: string; confirm?: string }) {
  if (values.current) await user.type(field("Password saat ini"), values.current);
  if (values.next) await user.type(field("Password baru"), values.next);
  if (values.confirm) await user.type(field("Konfirmasi password baru"), values.confirm);
}
const submit = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Ganti password" }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("client-side checks (no request sent)", () => {
  it.each([
    ["mismatched confirmation", { current, next, confirm: "synthetic-other-password" }, "Konfirmasi password baru", "Konfirmasi password tidak sama."],
    ["weak new password (5 characters)", { current, next: "abcde", confirm: "abcde" }, "Password baru", "Password baru minimal 6 karakter."],
    ["new password equal to current", { current, next: current, confirm: current }, "Password baru", "harus berbeda"],
    ["missing current password", { next, confirm: next }, "Password saat ini", "Masukkan password saat ini."],
  ])("%s", async (_case, values, label, message) => {
    render(<ChangePasswordForm />); const user = userEvent.setup();
    await fill(user, values); await submit(user);
    const input = field(label);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(input.getAttribute("aria-describedby")!)!.textContent).toContain(message);
    expect(document.activeElement).toBe(input);
    expect(mocks.change).not.toHaveBeenCalled();
  });
});

it.each([["exactly 6 characters", "abcdef"], ["a longer password", "a-much-longer-password-1234"]])("sends a new password of %s to the server", async (_case, candidate) => {
  mocks.change.mockResolvedValue({ ok: true });
  render(<ChangePasswordForm />); const user = userEvent.setup();
  await fill(user, { current, next: candidate, confirm: candidate }); await submit(user);
  await waitFor(() => expect(mocks.change).toHaveBeenCalledWith({ currentPassword: current, newPassword: candidate }));
});
it("shows the 6–128 policy in the helper text", () => {
  render(<ChangePasswordForm />);
  expect(document.body.textContent).toContain("6–128 karakter");
});

describe("server outcomes", () => {
  it("wrong current password: inline field error plus one error toast; field cleared, new password kept", async () => {
    mocks.change.mockResolvedValue({ ok: false, field: "currentPassword", message: "Password saat ini salah." });
    render(<ChangePasswordForm />); const user = userEvent.setup();
    await fill(user, { current: "wrong-password-123", next, confirm: next }); await submit(user);
    // Toasts fire in the handler, before React commits; wait for the DOM state first.
    const input = field("Password saat ini");
    await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).toHaveBeenCalledWith("Password belum diganti.", { id: "change-password", description: "Password saat ini salah." });
    expect(document.getElementById(input.getAttribute("aria-describedby")!)!.textContent).toContain("Password saat ini salah.");
    expect(input.value).toBe("");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(field("Password baru").value).toBe(next);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
  it("success: submits once, shows pending, then clears every field and shows one success toast", async () => {
    const pending = deferred<{ ok: true }>();
    mocks.change.mockReturnValue(pending.promise);
    render(<ChangePasswordForm />); const user = userEvent.setup();
    await fill(user, { current, next, confirm: next });
    await user.dblClick(screen.getByRole("button", { name: "Ganti password" }));
    expect(mocks.change).toHaveBeenCalledTimes(1);
    expect(mocks.change).toHaveBeenCalledWith({ currentPassword: current, newPassword: next });
    expect((screen.getByRole("button", { name: "Mengganti password..." }) as HTMLButtonElement).disabled).toBe(true);
    expect(field("Password baru").disabled).toBe(true);
    pending.resolve({ ok: true });
    await waitFor(() => expect(field("Password baru").value).toBe(""));
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Password berhasil diganti.", { id: "change-password", description: expect.stringContaining("perangkat lain telah diakhiri") });
    for (const label of ["Password saat ini", "Password baru", "Konfirmasi password baru"]) expect(field(label).value).toBe("");
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
  it("shows unconfirmed outcomes as an error toast without claiming success", async () => {
    mocks.change.mockResolvedValue({ ok: false, message: "Perubahan password belum dapat dikonfirmasi. Coba masuk dengan password lama; jika gagal, gunakan password baru." });
    render(<ChangePasswordForm />); const user = userEvent.setup();
    await fill(user, { current, next, confirm: next }); await submit(user);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    expect(mocks.toastError.mock.calls[0][1].description).toContain("belum dapat dikonfirmasi");
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});

it("each field has its own show/hide toggle and every field is marked mandatory", async () => {
  render(<ChangePasswordForm />); const user = userEvent.setup();
  for (const id of ["security-currentPassword", "security-newPassword", "security-confirmPassword"]) expect(document.querySelector(`label[for=${id}]`)!.textContent).toMatch(/\*$/);
  await user.click(screen.getByRole("button", { name: "Tampilkan password baru" }));
  expect(field("Password baru").type).toBe("text");
  expect(field("Password saat ini").type).toBe("password");
  await waitFor(() => expect(screen.getByRole("button", { name: "Sembunyikan password baru" }).getAttribute("aria-pressed")).toBe("true"));
});
