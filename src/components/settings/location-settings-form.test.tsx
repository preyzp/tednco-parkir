// @vitest-environment jsdom
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Dialog/typing-heavy jsdom form: generous limits for loaded parallel runs (logic unchanged).
vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 5_000 });
const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn(), success: vi.fn() }));
vi.mock("../../lib/settings-actions", () => ({ saveLocationSettingsAction: mocks.save }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: vi.fn() } }));
import { LocationSettingsForm } from "./location-settings-form";

const tariff = (amount: number, source: "location" | "default" = "default") => ({ amount, source });
const defaults = {
  locationName: "Lokasi Utara", revision: 0, tariffsConsistent: true, activeVehicleCount: 0,
  tariffs: { motor: { regular: tariff(5_000), overnight: tariff(10_000) }, mobil: { regular: tariff(5_000), overnight: tariff(10_000) } },
  operatingHours: { openTime: "05:00", closeTime: "00:00", source: "default" as const },
};
const configured = {
  ...defaults, revision: 3,
  tariffs: { motor: { regular: tariff(2_000, "location"), overnight: tariff(4_000, "location") }, mobil: { regular: tariff(6_000, "location"), overnight: tariff(12_000, "location") } },
  operatingHours: { openTime: "06:00", closeTime: "22:00", source: "location" as const },
};
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
const submit = () => screen.getByRole("button", { name: /Simpan Pengaturan|Menyimpan/ }) as HTMLButtonElement;
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("rendering", () => {
  it("unconfigured location: defaults, 'Belum diatur — memakai default' and Default badges; saving defaults is allowed", () => {
    render(<LocationSettingsForm settings={defaults} />);
    expect(screen.getByText("Belum diatur — memakai default")).toBeTruthy();
    for (const [label, value] of [["Motor Reguler", "5.000"], ["Motor Menginap per malam", "10.000"], ["Mobil Reguler", "5.000"], ["Mobil Menginap per malam", "10.000"]]) expect(field(label).value).toBe(value);
    expect(field("Jam buka").value).toBe("05:00"); expect(field("Jam tutup").value).toBe("00:00");
    expect(screen.getAllByText("Default")).toHaveLength(5);
    expect(screen.getAllByText("Rp10.000 per malam")).toHaveLength(2);
    expect(submit().disabled).toBe(false);
  });
  it("configured location: no default banner/badges; Save waits for a change", () => {
    render(<LocationSettingsForm settings={configured} />);
    expect(screen.queryByText("Belum diatur — memakai default")).toBeNull(); expect(screen.queryByText("Default")).toBeNull();
    expect(submit().disabled).toBe(true); expect(screen.getByText("Tidak ada perubahan.")).toBeTruthy();
    type("Motor Reguler", "2.500");
    expect(submit().disabled).toBe(false); expect(screen.getByText("Rp2.500")).toBeTruthy();
  });
  it("warns about active vehicles and inconsistent stored tariffs", () => {
    render(<LocationSettingsForm settings={{ ...configured, activeVehicleCount: 2, tariffsConsistent: false }} />);
    expect(screen.getByText("2 kendaraan sedang parkir")).toBeTruthy();
    expect(screen.getByText("Tarif tersimpan tidak konsisten")).toBeTruthy();
  });
  it("is responsive: two-column vehicle grid from md, stacked on mobile", () => {
    const { container } = render(<LocationSettingsForm settings={configured} />);
    expect(container.querySelector(".grid.gap-4.md\\:grid-cols-2")?.querySelectorAll("fieldset")).toHaveLength(2);
  });
});

describe("client validation (server stays authoritative)", () => {
  it.each(["0", "10.000.001", "abc", "", "1,5"])("amount %j blocks saving", (value) => {
    render(<LocationSettingsForm settings={configured} />);
    type("Mobil Reguler", value);
    expect(screen.getByRole("alert").textContent).toContain("Rp1–Rp10.000.000");
    expect(submit().disabled).toBe(true);
  });
  it("open == close blocks saving; past-midnight closing is allowed", () => {
    render(<LocationSettingsForm settings={configured} />);
    type("Jam tutup", "06:00");
    expect(screen.getByRole("alert").textContent).toContain("Jam tutup harus berbeda dari jam buka");
    expect(submit().disabled).toBe(true);
    type("Jam buka", "18:00"); type("Jam tutup", "02:00");
    expect(screen.queryByRole("alert")).toBeNull(); expect(submit().disabled).toBe(false);
  });
});

describe("Indonesian number input (id-ID)", () => {
  it.each([["1", "1", 1], ["5000", "5.000", 5_000], ["10000", "10.000", 10_000], ["1000000", "1.000.000", 1_000_000], ["10000000", "10.000.000", 10_000_000], ["10.000.000", "10.000.000", 10_000_000]])("typing %j shows %j and sends the number %i", async (typed, shown, sent) => {
    mocks.save.mockResolvedValue({ status: "error", message: "x" });
    render(<LocationSettingsForm settings={configured} />);
    type("Mobil Menginap per malam", typed);
    expect(field("Mobil Menginap per malam").value).toBe(shown);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(submit());
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0].tariffs.mobil.overnight).toBe(sent);
    expect(typeof mocks.save.mock.calls[0][0].tariffs.mobil.overnight).toBe("number");
  });
  it.each([["", ""], ["10000001", "10.000.001"], ["abc", "abc"], ["1,5", "1,5"], ["0", "0"]])("%j (shown %j) is rejected without sending", (typed, shown) => {
    render(<LocationSettingsForm settings={configured} />);
    type("Motor Reguler", typed);
    expect(field("Motor Reguler").value).toBe(shown);
    expect(screen.getByRole("alert").textContent).toContain("Rp1–Rp10.000.000");
    expect(submit().disabled).toBe(true);
  });
  it("deleting a digit regroups without changing other digits", () => {
    render(<LocationSettingsForm settings={configured} />);
    type("Mobil Reguler", "6.00");
    expect(field("Mobil Reguler").value).toBe("600");
  });
});

describe("saving", () => {
  it("sends parsed numbers + revision; shows success only after the server confirms, then the saved values", async () => {
    const pending = deferred<unknown>();
    mocks.save.mockReturnValue(pending.promise);
    render(<LocationSettingsForm settings={configured} />);
    type("Motor Reguler", "2.500"); type("Jam tutup", "02:00");
    fireEvent.click(submit()); fireEvent.click(submit());
    await waitFor(() => expect(submit().disabled).toBe(true));
    expect(submit().textContent).toContain("Menyimpan"); expect(field("Motor Reguler").disabled).toBe(true);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledWith({ tariffs: { motor: { regular: 2_500, overnight: 4_000 }, mobil: { regular: 6_000, overnight: 12_000 } }, operatingHours: { openTime: "06:00", closeTime: "02:00" }, expectedRevision: 3 });
    expect(mocks.success).not.toHaveBeenCalled();
    const saved = { ...configured, revision: 4, tariffs: { ...configured.tariffs, motor: { regular: tariff(2_500, "location"), overnight: tariff(4_000, "location") } }, operatingHours: { openTime: "06:00", closeTime: "02:00", source: "location" as const } };
    pending.resolve({ status: "success", settings: saved });
    await waitFor(() => expect(mocks.success).toHaveBeenCalledTimes(1));
    expect(field("Motor Reguler").value).toBe("2.500"); expect(field("Jam tutup").value).toBe("02:00");
    expect(screen.getByText("Tidak ada perubahan.")).toBeTruthy();
  });
  it("with active vehicles, asks for confirmation first; Batal saves nothing", async () => {
    mocks.save.mockResolvedValue({ status: "success", settings: { ...configured, activeVehicleCount: 1, revision: 4 } });
    render(<LocationSettingsForm settings={{ ...configured, activeVehicleCount: 1 }} />);
    type("Mobil Menginap per malam", "15000");
    fireEvent.click(submit());
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("1 kendaraan sedang parkir di Lokasi Utara");
    fireEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(submit());
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Ya, Simpan" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledTimes(1));
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it.each([
    [{ status: "conflict", message: "Pengaturan sudah diubah di tempat lain. Muat ulang halaman, periksa nilai terbaru, lalu simpan lagi." }, "Pengaturan sudah berubah", true],
    [{ status: "unknown", message: "Pengaturan belum dapat dipastikan. Muat ulang halaman sebelum mencoba lagi." }, "Status penyimpanan belum pasti", true],
    [{ status: "error", message: "Penyimpanan pengaturan belum siap di server. Hubungi pengelola platform." }, "Pengaturan belum tersimpan", false],
  ])("server %j: clear message, never success", async (result, title, reload) => {
    mocks.save.mockResolvedValue(result);
    render(<LocationSettingsForm settings={configured} />);
    type("Motor Reguler", "3000"); fireEvent.click(submit());
    expect(await screen.findByText(title)).toBeTruthy(); expect(screen.getByText(result.message)).toBeTruthy();
    expect(mocks.success).not.toHaveBeenCalled();
    const button = screen.queryByRole("button", { name: /Muat ulang pengaturan/ });
    expect(Boolean(button)).toBe(reload);
    if (button) { fireEvent.click(button); expect(mocks.refresh).toHaveBeenCalledTimes(1); }
  });
  it("shows server field errors under the matching field", async () => {
    mocks.save.mockResolvedValue({ status: "error", message: "Periksa kembali isian yang ditandai.", fieldErrors: { "tariffs.mobil.overnight": "Nominal tarif maksimal Rp10.000.000." } });
    render(<LocationSettingsForm settings={configured} />);
    type("Motor Reguler", "3000"); fireEvent.click(submit());
    expect(await screen.findByText("Nominal tarif maksimal Rp10.000.000.")).toBeTruthy();
    expect(field("Mobil Menginap per malam").getAttribute("aria-invalid")).toBe("true");
  });
  it("a network failure is an unknown outcome with a reload option", async () => {
    mocks.save.mockRejectedValue(new Error("offline"));
    render(<LocationSettingsForm settings={configured} />);
    type("Motor Reguler", "3000"); fireEvent.click(submit());
    expect(await screen.findByText("Status penyimpanan belum pasti")).toBeTruthy();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});

describe("slow server (P4.7)", () => {
  afterEach(() => vi.useRealTimers());
  it("after 10 s shows a still-processing hint (no resubmit advice); it disappears with the reply", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = deferred<unknown>();
    mocks.save.mockReturnValue(pending.promise);
    render(<LocationSettingsForm settings={configured} />);
    type("Motor Reguler", "2.500"); fireEvent.click(submit());
    await act(async () => {});
    expect(screen.queryByText(/Server masih memproses/)).toBeNull();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByText(/Server masih memproses/).textContent).not.toMatch(/coba lagi|ulangi/i);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve({ status: "unknown", message: "Pengaturan belum dapat dipastikan." }); });
    expect(screen.queryByText(/Server masih memproses/)).toBeNull();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
