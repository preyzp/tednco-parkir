// @vitest-environment jsdom
import { cleanup, configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Typing-heavy jsdom dialogs: generous limits for loaded parallel runs (logic unchanged).
vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 5_000 });
const mocks = vi.hoisted(() => ({ owner: vi.fn(), create: vi.fn(), update: vi.fn(), status: vi.fn() }));
vi.mock("../../lib/platform-actions", () => ({
  renameOwnerAction: mocks.owner, createLocationAction: mocks.create, updateLocationAction: mocks.update, changeLocationStatusAction: mocks.status,
  renameTenantAction: vi.fn(), changeTenantStatusAction: vi.fn(),
}));
import { LocationDialog, LocationStatusDialog, RenameOwnerDialog } from "./tenant-resources";

const tenantId = "a".repeat(24); const userId = "b".repeat(24); const locationId = "c".repeat(24);
const location = { id: locationId, name: "Lokasi Utara", address: "Jl. Mawar 1", status: "active" as const };
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const fields = (call: unknown[]) => Object.fromEntries(call[1] as FormData);

describe("Owner", () => {
  it("edits only the display name and explains what stays unchanged", async () => {
    mocks.owner.mockResolvedValue({ status: "error", message: "Akun ini tidak dapat diubah dari halaman tenant." });
    render(<RenameOwnerDialog tenantId={tenantId} userId={userId} currentName="Budi" />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Ubah nama Owner" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Email, password, dan peran Owner tetap sama");
    expect(dialog.querySelectorAll("input:not([type=hidden])")).toHaveLength(1);
    expect(dialog.querySelector("input[type=password], input[type=email]")).toBeNull();
    const input = within(dialog).getByLabelText(/^Nama Owner/);
    expect((within(dialog).getByRole("button", { name: "Simpan nama" }) as HTMLButtonElement).disabled).toBe(true);
    await user.clear(input); await user.type(input, "Budi Santoso");
    await user.click(within(dialog).getByRole("button", { name: "Simpan nama" }));
    await waitFor(() => expect(mocks.owner).toHaveBeenCalledOnce());
    expect(fields(mocks.owner.mock.calls[0])).toEqual({ tenantId, userId, name: "Budi Santoso" });
    expect((await within(dialog).findByRole("alert")).textContent).toContain("tidak dapat diubah");
  });
});

describe("locations", () => {
  it("creates a location with name and optional address, marking the name as mandatory", async () => {
    mocks.create.mockResolvedValue({ status: "error", message: "Nama lokasi sudah dipakai di tenant ini. Gunakan nama lain." });
    render(<LocationDialog tenantId={tenantId} />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Tambah lokasi" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector("label[for=location-new-name]")!.textContent).toMatch(/\*$/);
    expect(dialog.querySelector("label[for=location-new-address]")!.textContent).toBe("Alamat (opsional)");
    expect((within(dialog).getByRole("button", { name: "Buat lokasi" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(within(dialog).getByLabelText(/^Nama lokasi/), "Lokasi Timur");
    await user.dblClick(within(dialog).getByRole("button", { name: "Buat lokasi" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(fields(mocks.create.mock.calls[0])).toEqual({ tenantId, name: "Lokasi Timur", address: "" });
    expect((await within(dialog).findByRole("alert")).textContent).toContain("sudah dipakai");
  });
  it("edits name/address of an existing location and blocks unchanged saves", async () => {
    mocks.update.mockResolvedValue({ status: "idle" });
    render(<LocationDialog tenantId={tenantId} location={location} />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Ubah lokasi Lokasi Utara" }));
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText(/^Nama lokasi/) as HTMLInputElement).value).toBe("Lokasi Utara");
    expect((within(dialog).getByRole("button", { name: "Simpan lokasi" }) as HTMLButtonElement).disabled).toBe(true);
    await user.clear(within(dialog).getByLabelText("Alamat (opsional)"));
    await user.click(within(dialog).getByRole("button", { name: "Simpan lokasi" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    expect(fields(mocks.update.mock.calls[0])).toEqual({ tenantId, locationId, name: "Lokasi Utara", address: "" });
  });
  it("confirms deactivation with its impact, submits once and stays open while pending", async () => {
    const pending = deferred<{ status: "error"; message: string }>();
    mocks.status.mockReturnValue(pending.promise);
    render(<LocationStatusDialog tenantId={tenantId} location={location} />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Nonaktifkan lokasi Lokasi Utara" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Aktif → Nonaktif");
    expect(dialog.textContent).toContain("termasuk sesi yang sedang aktif");
    expect(dialog.textContent).toContain("tidak dihapus");
    await user.dblClick(within(dialog).getByRole("button", { name: "Ya, nonaktifkan" }));
    await waitFor(() => expect(mocks.status).toHaveBeenCalledTimes(1));
    expect(fields(mocks.status.mock.calls[0])).toEqual({ tenantId, locationId, toStatus: "inactive", expectedStatus: "active" });
    expect((within(dialog).getByRole("button", { name: "Batal" }) as HTMLButtonElement).disabled).toBe(true);
    pending.resolve({ status: "error", message: "Data tenant sudah berubah. Muat ulang halaman, lalu periksa kembali sebelum mencoba lagi." });
    expect(await within(dialog).findByText(/sudah berubah/)).toBeTruthy();
  });
  it("offers reactivation for an inactive location", async () => {
    render(<LocationStatusDialog tenantId={tenantId} location={{ ...location, status: "inactive" }} />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Aktifkan lokasi Lokasi Utara" }));
    expect((await screen.findByRole("alertdialog")).textContent).toContain("Nonaktif → Aktif");
  });
});
