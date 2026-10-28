// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, configure } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
// Typing-heavy jsdom form: generous limits for loaded parallel runs (logic unchanged).
vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 5_000 });
const mocks = vi.hoisted(() => ({ action: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));
vi.mock("../../lib/platform-actions", () => ({ createTenantAction: mocks.action }));
import { CreateTenantForm } from "./create-tenant-form";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const password = "synthetic-initial-password";
// Labels of mandatory fields end with a visual "*"; match the label text without it.
const field = (label: string) => screen.getByLabelText(new RegExp(`^${label.replace(/[()]/g, "\\$&")}\\*?$`));
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(field("Nama usaha"), "Parkir Sentosa Jaya");
  await user.type(field("Nama lokasi"), "Lokasi Utara");
  await user.type(field("Nama Owner"), "Budi");
  await user.type(field("Email Owner"), "budi@example.test");
  await user.type(field("Password awal"), password);
  await user.type(field("Konfirmasi password awal"), password);
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

it("labels every field and suggests a slug from the business name until edited", async () => {
  render(<CreateTenantForm />); const user = userEvent.setup();
  for (const label of ["Nama usaha", "Slug unik", "Zona waktu", "Nama lokasi", "Alamat (opsional)", "Nama Owner", "Email Owner", "Password awal", "Konfirmasi password awal"]) expect(field(label)).toBeTruthy();
  await user.type(field("Nama usaha"), "Parkir Sentosa Jaya");
  expect((field("Slug unik") as HTMLInputElement).value).toBe("parkir-sentosa-jaya");
  await user.clear(field("Slug unik")); await user.type(field("Slug unik"), "sentosa");
  await user.type(field("Nama usaha"), " Baru");
  expect((field("Slug unik") as HTMLInputElement).value).toBe("sentosa");
  expect((field("Password awal") as HTMLInputElement).type).toBe("password");
});

it("marks every mandatory field with an asterisk and leaves the optional address unmarked", () => {
  render(<CreateTenantForm />);
  const labelText = (id: string) => document.querySelector(`label[for="${id}"]`)!.textContent;
  for (const id of ["tenantName", "slug", "timezone", "locationName", "ownerName", "ownerEmail", "ownerPassword", "ownerPasswordConfirm"]) expect(labelText(id)).toMatch(/\*$/);
  expect(labelText("locationAddress")).toBe("Alamat (opsional)");
  expect(document.body.textContent).toContain("wajib diisi");
  for (const id of ["tenantName", "slug", "locationName", "ownerName", "ownerEmail", "ownerPassword", "ownerPasswordConfirm"]) expect((document.getElementById(id) as HTMLInputElement).required).toBe(true);
  expect((document.getElementById("locationAddress") as HTMLInputElement).required).toBe(false);
});

it("each password field has its own eye toggle that reveals and hides the value", async () => {
  render(<CreateTenantForm />); const user = userEvent.setup();
  await user.type(field("Password awal"), password);
  const toggles = screen.getAllByRole("button", { name: "Tampilkan password" });
  expect(toggles).toHaveLength(2);
  await user.click(toggles[0]);
  expect((field("Password awal") as HTMLInputElement).type).toBe("text");
  expect((field("Password awal") as HTMLInputElement).value).toBe(password);
  expect((field("Konfirmasi password awal") as HTMLInputElement).type).toBe("password");
  const hide = screen.getByRole("button", { name: "Sembunyikan password" });
  expect(hide.getAttribute("aria-pressed")).toBe("true");
  hide.focus(); await user.keyboard("{Enter}");
  expect((field("Password awal") as HTMLInputElement).type).toBe("password");
  expect(screen.getAllByRole("button", { name: "Tampilkan password" })).toHaveLength(2);
});

it("submits once, disables the form while the server works, and sends the default time zone", async () => {
  const pending = deferred<{ status: "error"; message: string }>();
  mocks.action.mockReturnValue(pending.promise);
  render(<CreateTenantForm />); const user = userEvent.setup();
  await fill(user);
  await user.dblClick(screen.getByRole("button", { name: "Buat tenant" }));
  await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(1));
  const data = mocks.action.mock.calls[0][1] as FormData;
  expect(Object.fromEntries(data)).toMatchObject({ tenantName: "Parkir Sentosa Jaya", slug: "parkir-sentosa-jaya", timezone: "Asia/Jakarta", ownerEmail: "budi@example.test", ownerPassword: password });
  const button = await screen.findByRole("button", { name: "Membuat tenant..." });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("status").textContent).toContain("Membuat tenant");
  await user.click(button);
  expect(mocks.action).toHaveBeenCalledTimes(1);
  pending.resolve({ status: "error", message: "Periksa kembali isian yang ditandai." });
  await screen.findByRole("button", { name: "Buat tenant" });
});

it("announces server errors, marks invalid fields, keeps text input and clears passwords", async () => {
  mocks.action.mockResolvedValue({ status: "error", message: "Slug sudah digunakan tenant lain.", fieldErrors: { slug: "Slug sudah digunakan. Pilih slug lain." } });
  render(<CreateTenantForm />); const user = userEvent.setup();
  await fill(user);
  await user.click(screen.getByRole("button", { name: "Buat tenant" }));
  // The toast fires inside the action, slightly before React commits the new
  // state, so wait for the inline field error itself rather than the toast.
  const slug = field("Slug unik");
  await waitFor(() => expect(slug.getAttribute("aria-invalid")).toBe("true"));
  // Outcome → exactly one error toast; the field error stays inline.
  expect(mocks.toastError).toHaveBeenCalledTimes(1);
  expect(mocks.toastError).toHaveBeenCalledWith("Tenant belum dibuat.", { id: "create-tenant-error", description: "Slug sudah digunakan tenant lain." });
  expect(mocks.toastSuccess).not.toHaveBeenCalled();
  expect(document.getElementById(slug.getAttribute("aria-describedby")!)?.textContent).toContain("Pilih slug lain");
  expect((field("Nama usaha") as HTMLInputElement).value).toBe("Parkir Sentosa Jaya");
  expect((field("Email Owner") as HTMLInputElement).value).toBe("budi@example.test");
  await waitFor(() => expect((field("Password awal") as HTMLInputElement).value).toBe(""));
  expect((field("Konfirmasi password awal") as HTMLInputElement).value).toBe("");
  expect(document.body.textContent).not.toContain(password);
});
