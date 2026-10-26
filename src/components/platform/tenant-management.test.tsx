// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rename: vi.fn(), status: vi.fn() }));
vi.mock("../../lib/platform-actions", () => ({ renameTenantAction: mocks.rename, changeTenantStatusAction: mocks.status }));
import { RenameTenantDialog, TenantStatusActions } from "./tenant-management";

const id = "a".repeat(24);
beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);
const buttons = () => screen.getAllByRole("button").map((button) => button.textContent);
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("status actions", () => {
  it.each([
    ["active", ["Tangguhkan", "Arsipkan"]],
    ["suspended", ["Aktifkan kembali", "Arsipkan"]],
    ["archived", ["Pulihkan dari arsip"]],
  ] as const)("offers only the allowed transitions from %s", (status, expected) => {
    render(<TenantStatusActions tenantId={id} status={status} />);
    expect(buttons()).toEqual(expected);
  });

  it("shows the impact before confirming a suspension and submits exactly once while staying open", async () => {
    const pending = deferred<{ status: "error"; message: string }>();
    mocks.status.mockReturnValue(pending.promise);
    render(<TenantStatusActions tenantId={id} status="active" />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Tangguhkan" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Tangguhkan tenant ini?")).toBeTruthy();
    expect(dialog.textContent).toContain("Aktif → Ditangguhkan");
    expect(dialog.textContent).toContain("termasuk sesi yang sedang aktif");
    expect(dialog.textContent).toContain("Tidak ada data yang dihapus");
    await user.dblClick(within(dialog).getByRole("button", { name: "Ya, tangguhkan" }));
    await waitFor(() => expect(mocks.status).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(mocks.status.mock.calls[0][1] as FormData)).toEqual({ tenantId: id, toStatus: "suspended", expectedStatus: "active" });
    expect((within(dialog).getByRole("button", { name: "Memproses..." }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole("button", { name: "Batal" }) as HTMLButtonElement).disabled).toBe(true);
    pending.resolve({ status: "error", message: "Data tenant sudah berubah. Muat ulang halaman, lalu periksa kembali sebelum mencoba lagi." });
    expect(await within(dialog).findByText(/sudah berubah/)).toBeTruthy();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("archive warns that only an explicit restore can undo it; cancel does nothing", async () => {
    render(<TenantStatusActions tenantId={id} status="suspended" />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Arsipkan" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Pulihkan dari arsip");
    await user.click(within(dialog).getByRole("button", { name: "Batal" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it("restoring an archived tenant is its own explicit, non-destructive confirmation", async () => {
    mocks.status.mockResolvedValue({ status: "idle" });
    render(<TenantStatusActions tenantId={id} status="archived" />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Pulihkan dari arsip" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Ya, pulihkan" }));
    await waitFor(() => expect(mocks.status).toHaveBeenCalledOnce());
    expect(Object.fromEntries(mocks.status.mock.calls[0][1] as FormData)).toMatchObject({ toStatus: "active", expectedStatus: "archived" });
  });
});

describe("rename dialog", () => {
  it("edits only the name, blocks unchanged saves and shows server errors in the dialog", async () => {
    mocks.rename.mockResolvedValue({ status: "error", message: "Nama usaha minimal 2 karakter." });
    render(<RenameTenantDialog tenantId={id} currentName="Parkir Sentosa" />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Ubah nama" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Slug, status, lokasi, dan akun Owner tetap sama");
    const input = within(dialog).getByLabelText(/^Nama usaha/) as HTMLInputElement;
    expect(input.value).toBe("Parkir Sentosa");
    expect((within(dialog).getByRole("button", { name: "Simpan nama" }) as HTMLButtonElement).disabled).toBe(true);
    expect(dialog.querySelectorAll("input:not([type=hidden])")).toHaveLength(1);
    await user.clear(input); await user.type(input, "Parkir Sentosa Jaya");
    await user.click(within(dialog).getByRole("button", { name: "Simpan nama" }));
    await waitFor(() => expect(mocks.rename).toHaveBeenCalledOnce());
    expect(Object.fromEntries(mocks.rename.mock.calls[0][1] as FormData)).toEqual({ tenantId: id, name: "Parkir Sentosa Jaya" });
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Nama belum diubah");
  });
});
