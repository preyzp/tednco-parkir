// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, configure } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Typing-heavy jsdom form: generous limits for loaded parallel runs (logic unchanged).
vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 5_000 });
const mocks = vi.hoisted(() => ({ action: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("../../lib/parking-actions", () => ({ recordVehicleEntryAction: mocks.action }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
import { VehicleEntryForm } from "./vehicle-entry-form";

beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const plate = () => screen.getByLabelText(/^Nomor Polisi/) as HTMLInputElement;
const recorded = { plateNumber: "B 1234 XYZ", vehicleType: "mobil" as const, entryAt: "2026-10-26T03:15:00.000Z", timeZone: "Asia/Jakarta", locationName: "Lokasi Utara" };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
async function fill(user: ReturnType<typeof userEvent.setup>, value = " b  1234  xyz", type: "Motor" | "Mobil" = "Mobil") {
  await user.type(plate(), value);
  await user.click(screen.getByRole("radio", { name: type }));
}

describe("inline validation (no request)", () => {
  it("requires a plate and a vehicle type, focusing the plate", async () => {
    render(<VehicleEntryForm />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Catat Kendaraan Masuk" }));
    expect(plate().getAttribute("aria-invalid")).toBe("true");
    expect(document.body.textContent).toContain("Masukkan nomor polisi.");
    expect(document.body.textContent).toContain("Pilih jenis kendaraan.");
    expect(document.activeElement).toBe(plate());
    expect(mocks.action).not.toHaveBeenCalled();
  });
  it("marks mandatory fields and previews the normalized plate", async () => {
    render(<VehicleEntryForm />); const user = userEvent.setup();
    expect(document.querySelector("label[for=plateNumber]")!.textContent).toMatch(/\*$/);
    expect(screen.getByText(/^Jenis Kendaraan/).textContent).toMatch(/\*$/);
    expect(document.querySelector("label[for=notes]")!.textContent).toBe("Catatan (opsional)");
    await user.type(plate(), "  b   1234 xyz ");
    expect(document.getElementById("plate-hint")!.textContent).toContain("B 1234 XYZ");
  });
});

describe("server outcomes", () => {
  it("submits once with only plate/type/notes, then confirms with toast and entry details (no navigation)", async () => {
    const pending = deferred<{ status: "success"; entry: typeof recorded }>();
    mocks.action.mockReturnValue(pending.promise);
    render(<VehicleEntryForm />); const user = userEvent.setup();
    await fill(user);
    await user.type(screen.getByLabelText("Catatan (opsional)"), "helm");
    await user.dblClick(screen.getByRole("button", { name: "Catat Kendaraan Masuk" }));
    await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(mocks.action.mock.calls[0][1] as FormData)).toEqual({ plateNumber: " b  1234  xyz", vehicleType: "mobil", notes: "helm" });
    expect((await screen.findByRole("button", { name: "Mencatat..." }) as HTMLButtonElement).disabled).toBe(true);
    pending.resolve({ status: "success", entry: recorded });
    expect(await screen.findByText("Kendaraan tercatat masuk")).toBeTruthy();
    expect(document.body.textContent).toContain("B 1234 XYZ"); expect(document.body.textContent).toMatch(/10[.:]15 WIB/);
    expect(mocks.success).toHaveBeenCalledTimes(1); expect(mocks.error).not.toHaveBeenCalled();
  });
  it("starts a clean form for the next vehicle", async () => {
    mocks.action.mockResolvedValue({ status: "success", entry: recorded });
    render(<VehicleEntryForm />); const user = userEvent.setup();
    await fill(user); await user.click(screen.getByRole("button", { name: "Catat Kendaraan Masuk" }));
    expect((await screen.findByRole("link", { name: "Kembali ke Beranda" })).getAttribute("href")).toBe("/app");
    await user.click(await screen.findByRole("button", { name: "Catat kendaraan lain" }));
    expect(plate().value).toBe("");
    expect(screen.getByRole("radio", { name: "Mobil" }).getAttribute("aria-checked")).toBe("false");
  });
  it("duplicate plate: inline error on the plate plus an error toast, input kept", async () => {
    mocks.action.mockResolvedValue({ status: "error", message: "Kendaraan ini masih tercatat parkir di lokasi ini.", fieldErrors: { plateNumber: "Nomor polisi ini sudah memiliki sesi parkir aktif di lokasi ini." } });
    render(<VehicleEntryForm />); const user = userEvent.setup();
    await fill(user); await user.click(screen.getByRole("button", { name: "Catat Kendaraan Masuk" }));
    await waitFor(() => expect(plate().getAttribute("aria-invalid")).toBe("true"));
    expect(document.getElementById("plate-error")!.textContent).toContain("sudah memiliki sesi parkir aktif");
    expect(mocks.error).toHaveBeenCalledWith("Kendaraan belum dicatat.", { id: "vehicle-entry", description: "Kendaraan ini masih tercatat parkir di lokasi ini." });
    expect(plate().value).toBe(" b  1234  xyz");
  });
  it.each([["access denied", { status: "error", message: "Anda tidak memiliki akses untuk mencatat kendaraan di lokasi ini." }]])("%s: error toast, no confirmation", async (_case, result) => {
    mocks.action.mockResolvedValue(result);
    render(<VehicleEntryForm />); const user = userEvent.setup();
    await fill(user); await user.click(screen.getByRole("button", { name: "Catat Kendaraan Masuk" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Kendaraan tercatat masuk")).toBeNull();
  });
  it("network failure: error toast advising to check before retrying", async () => {
    mocks.action.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<VehicleEntryForm />); const user = userEvent.setup();
    await fill(user); await user.click(screen.getByRole("button", { name: "Catat Kendaraan Masuk" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(1));
    expect(mocks.error.mock.calls[0][1].description).toContain("Tidak dapat terhubung");
    expect(screen.queryByText("Kendaraan tercatat masuk")).toBeNull();
  });
});
