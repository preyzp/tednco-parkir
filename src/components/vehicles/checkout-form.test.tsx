// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Dialog-heavy jsdom form: generous limits for loaded parallel runs (logic unchanged).
vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 5_000 });
const mocks = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn(), success: vi.fn() }));
vi.mock("../../lib/parking-actions", () => ({ confirmCheckoutAction: mocks.action }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: vi.fn() } }));
import { CheckoutForm } from "./checkout-form";

const quote = {
  sessionId: "1".repeat(24), plateNumber: "B 1234 XYZ", vehicleType: "mobil" as const, locationName: "Lokasi Utara",
  entryAt: "2026-10-26T03:00:00.000Z", quotedAt: "2026-10-27T01:00:00.000Z", timeZone: "Asia/Jakarta", nights: 1,
  suggestion: { tariffType: "overnight" as const, nightCount: 1 },
  rates: { regular: { amount: 5_000, source: "default" as const }, overnight: { amount: 10_000, source: "default" as const } },
  policy: { openTime: "05:00", closeTime: "00:00" },
};
const receipt = { plateNumber: "B 1234 XYZ", vehicleType: "mobil" as const, locationName: "Lokasi Utara", entryAt: quote.entryAt, exitAt: "2026-10-27T01:01:00.000Z", timeZone: "Asia/Jakarta", tariffType: "overnight" as const, nightCount: 1, amountPerUnit: 10_000, totalAmount: 10_000, paymentMethod: "cash" as const };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
const total = () => screen.getByText("Total yang harus dibayar").nextElementSibling?.textContent;
const openDialog = () => fireEvent.click(screen.getByRole("button", { name: "Konfirmasi Pembayaran & Keluar" }));
const confirmButton = () => within(screen.getByRole("alertdialog")).getByRole("button", { name: /Uang Diterima, Konfirmasi|Menyimpan/ });
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe("details and calculation (display only)", () => {
  it("shows the session, the explicit suggestion and the Rupiah total", () => {
    render(<CheckoutForm quote={quote} backHref="/app/kendaraan" />);
    for (const text of ["B 1234 XYZ", "Mobil", "Lokasi Utara", "1 malam", "Tunai"]) expect(screen.getAllByText(text, { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText(/Saran sistem: Menginap 1 malam/)).toBeTruthy();
    expect((screen.getByRole("radio", { name: /Menginap/ }) as HTMLButtonElement).getAttribute("aria-checked")).toBe("true");
    expect(total()).toBe("Rp10.000");
  });
  it("Reguler is Rp5.000; Menginap replaces it at nights × rate", () => {
    render(<CheckoutForm quote={quote} backHref="/app/kendaraan" />);
    fireEvent.click(screen.getByRole("radio", { name: /Reguler/ }));
    expect(total()).toBe("Rp5.000");
    expect(screen.queryByLabelText(/Jumlah malam/)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Menginap/ }));
    fireEvent.change(screen.getByLabelText(/Jumlah malam/), { target: { value: "3" } });
    expect(total()).toBe("Rp30.000"); expect(screen.getByText("3 malam × Rp10.000")).toBeTruthy();
  });
  it.each(["0", "-1", "1.5", "abc", ""])("invalid night count %j blocks confirmation", (value) => {
    render(<CheckoutForm quote={quote} backHref="/app/kendaraan" />);
    fireEvent.change(screen.getByLabelText(/Jumlah malam/), { target: { value } });
    expect(screen.getByRole("alert").textContent).toContain("bilangan bulat");
    expect((screen.getByRole("button", { name: "Konfirmasi Pembayaran & Keluar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(total()).toBe("—");
  });
});

describe("confirmation", () => {
  it("sends only the selection, the shown total and an idempotency key; success only after the server confirms", async () => {
    const pending = deferred<{ status: "success"; receipt: typeof receipt }>();
    mocks.action.mockReturnValue(pending.promise);
    render(<CheckoutForm quote={quote} backHref="/app/kendaraan" />);
    openDialog();
    expect(screen.getByRole("alertdialog").textContent).toContain("Rp10.000");
    fireEvent.click(confirmButton());
    await waitFor(() => expect((confirmButton() as HTMLButtonElement).disabled).toBe(true));
    expect(screen.queryByText("Pembayaran tercatat")).toBeNull(); expect(mocks.success).not.toHaveBeenCalled();
    const [payload] = mocks.action.mock.calls[0];
    expect(payload).toEqual({ sessionId: quote.sessionId, tariffType: "overnight", nightCount: 1, expectedTotal: 10_000, idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    pending.resolve({ status: "success", receipt });
    expect(await screen.findByText("Pembayaran tercatat")).toBeTruthy();
    expect(mocks.success).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /Proses kendaraan lain/ }).getAttribute("href")).toBe("/app/kendaraan/keluar");
    expect(screen.getByRole("link", { name: "Kembali" }).getAttribute("href")).toBe("/app/kendaraan");
  });
  it("double-click sends one request", async () => {
    const pending = deferred<{ status: "success"; receipt: typeof receipt }>();
    mocks.action.mockReturnValue(pending.promise);
    render(<CheckoutForm quote={quote} backHref="/app/kendaraan" />);
    openDialog();
    const button = confirmButton(); fireEvent.click(button); fireEvent.click(button);
    expect(mocks.action).toHaveBeenCalledTimes(1);
    pending.resolve({ status: "success", receipt });
    await screen.findByText("Pembayaran tercatat");
  });
  it("an unknown outcome offers a status check, and a retry reuses the same idempotency key", async () => {
    mocks.action.mockResolvedValueOnce({ status: "unknown", message: "Status pembayaran belum dapat dipastikan. Periksa status transaksi sebelum mencoba lagi." });
    render(<CheckoutForm quote={quote} backHref="/app/kendaraan" />);
    openDialog(); fireEvent.click(confirmButton());
    expect((await screen.findAllByText(/belum dapat dipastikan/)).length).toBeGreaterThan(0);
    expect(screen.queryByText("Pembayaran tercatat")).toBeNull();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Batal" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Periksa status transaksi/ }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    mocks.action.mockResolvedValueOnce({ status: "success", receipt });
    openDialog(); fireEvent.click(confirmButton());
    await screen.findByText("Pembayaran tercatat");
    expect(mocks.action.mock.calls[1][0].idempotencyKey).toBe(mocks.action.mock.calls[0][0].idempotencyKey);
  });
  it("a network failure is an unknown outcome, never a success", async () => {
    mocks.action.mockRejectedValueOnce(new Error("offline"));
    render(<CheckoutForm quote={quote} backHref="/app/kendaraan" />);
    openDialog(); fireEvent.click(confirmButton());
    expect((await screen.findAllByText(/Status pembayaran belum dapat dipastikan/)).length).toBeGreaterThan(0);
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it("price changed / already completed: closes the dialog, explains and reloads the server view", async () => {
    mocks.action.mockResolvedValueOnce({ status: "error", refresh: true, message: "Total pembayaran berubah menjadi Rp20.000. Periksa kembali sebelum menerima uang." });
    render(<CheckoutForm quote={quote} backHref="/app/kendaraan" />);
    openDialog(); fireEvent.click(confirmButton());
    expect(await screen.findByText(/berubah menjadi Rp20.000/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
