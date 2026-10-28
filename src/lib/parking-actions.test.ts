import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "./errors";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), record: vi.fn(), checkout: vi.fn(), redirect: vi.fn((path: string) => { throw new Error("redirect:" + path); }) }));
vi.mock("server-only", () => ({}));
vi.mock("./workspace", () => ({ resolveActiveWorkspace: mocks.resolve }));
vi.mock("./dal", () => ({ recordVehicleEntry: mocks.record, completeParkingCheckout: mocks.checkout }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { confirmCheckoutAction, recordVehicleEntryAction } from "./parking-actions";

const active = { status: "active", workspace: { tenantId: "a".repeat(24), locationId: "b".repeat(24), tenantName: "T", locationName: "L", role: "owner" } };
const form = (entries: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(entries)) data.set(key, value); return data; };
const submit = (entries: Record<string, string> = { plateNumber: "B 1234 XYZ", vehicleType: "mobil" }) => recordVehicleEntryAction({ status: "idle" }, form(entries));
beforeEach(() => { vi.clearAllMocks(); mocks.resolve.mockResolvedValue(active); });

it("targets the server-validated active workspace, never form-supplied ids or times", async () => {
  mocks.record.mockResolvedValue({ ok: true, entry: { plateNumber: "B 1234 XYZ", vehicleType: "mobil", entryAt: "2026-10-26T03:15:00.000Z", timeZone: "Asia/Jakarta", locationName: "L" } });
  const state = await submit({ plateNumber: "b 1234 xyz", vehicleType: "mobil", notes: "x", tenantId: "c".repeat(24), locationId: "d".repeat(24), entryAt: "2000-01-01" });
  expect(mocks.record).toHaveBeenCalledWith({ tenantId: "a".repeat(24), locationId: "b".repeat(24) }, { plateNumber: "b 1234 xyz", vehicleType: "mobil", notes: "x" });
  expect(state).toMatchObject({ status: "success", entry: { plateNumber: "B 1234 XYZ" } });
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it("refuses when no location is active, without recording", async () => {
  for (const status of ["selection_required", "forbidden", "empty"]) {
    mocks.resolve.mockResolvedValueOnce({ status });
    expect((await submit()).message).toContain("Pilih lokasi aktif");
  }
  expect(mocks.record).not.toHaveBeenCalled();
});
it.each([
  [{ ok: false, reason: "duplicate_active" }, "plateNumber", "sudah memiliki sesi parkir aktif"],
  [{ ok: false, reason: "validation", fieldErrors: { plateNumber: "Masukkan nomor polisi." } }, "plateNumber", "Masukkan nomor polisi."],
])("maps %j to an inline field error plus a message", async (result, field, text) => {
  mocks.record.mockResolvedValue(result);
  const state = await submit();
  expect(state.status).toBe("error"); expect(state.message).toBeTruthy();
  expect(state.fieldErrors?.[field as "plateNumber"]).toContain(text);
});
it("reports an unready server (missing index) without claiming success", async () => {
  mocks.record.mockResolvedValue({ ok: false, reason: "not_ready" });
  expect((await submit()).message).toContain("belum siap");
});
it("maps forbidden and unauthenticated outcomes safely", async () => {
  mocks.record.mockRejectedValueOnce(new AppError("FORBIDDEN"));
  expect((await submit()).message).toContain("tidak memiliki akses");
  mocks.resolve.mockRejectedValueOnce(new AppError("UNAUTHENTICATED"));
  await expect(submit()).rejects.toThrow("redirect:/login");
});

describe("vehicle entry when the database fails (P4.7)", () => {
  it("a definite failure before any commit says 'not recorded' and is a plain error", async () => {
    mocks.record.mockResolvedValue({ ok: false, reason: "unavailable" });
    const state = await submit();
    expect(state).toEqual({ status: "error", message: expect.stringContaining("belum dicatat") });
  });
  it("an unreachable workspace guard (before the entry is attempted) is also a definite failure", async () => {
    mocks.resolve.mockRejectedValue(new AppError("SERVICE_UNAVAILABLE"));
    const state = await submit();
    expect(state.status).toBe("error"); expect(state.message).toContain("belum dicatat");
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it.each([["SERVICE_UNAVAILABLE (ambiguous commit)", new AppError("SERVICE_UNAVAILABLE")], ["an unexpected error", new Error("synthetic secret")]])(
    "%s is unknown: never success and never 'not recorded'; asks to check the vehicle list", async (_label, error) => {
      mocks.record.mockRejectedValue(error);
      const state = await submit();
      expect(state.status).toBe("unknown");
      expect(state.message).toContain("Periksa daftar kendaraan");
      expect(state.message).not.toContain("belum dicatat"); expect(state.entry).toBeUndefined();
      expect(JSON.stringify(state)).not.toContain("synthetic");
    });
});

describe("confirmCheckoutAction", () => {
  const input = { sessionId: "e".repeat(24), tariffType: "overnight", nightCount: 2, expectedTotal: 20_000, idempotencyKey: "6f1c1d7e-2b3a-4c5d-8e9f-0a1b2c3d4e5f" };
  const receipt = { plateNumber: "B 1", vehicleType: "mobil", locationName: "L", entryAt: "2026-10-26T03:00:00.000Z", exitAt: "2026-10-28T01:00:00.000Z", timeZone: "Asia/Jakarta", tariffType: "overnight", nightCount: 2, amountPerUnit: 10_000, totalAmount: 20_000, paymentMethod: "cash" };
  it("uses the server-validated workspace and forces cash; extra browser fields are not forwarded", async () => {
    mocks.checkout.mockResolvedValue({ ok: true, receipt, replayed: false });
    const result = await confirmCheckoutAction({ ...input, tenantId: "c".repeat(24), exitAt: "2000-01-01", totalAmount: 1, paymentMethod: "qris" } as typeof input);
    expect(mocks.checkout).toHaveBeenCalledWith({ tenantId: "a".repeat(24), locationId: "b".repeat(24) }, { ...input, paymentMethod: "cash" });
    expect(result).toEqual({ status: "success", receipt });
  });
  it.each([
    [{ ok: false, reason: "price_changed", totalAmount: 30_000 }, "Rp30.000", true],
    [{ ok: false, reason: "already_completed" }, "sudah diproses keluar", true],
    [{ ok: false, reason: "not_active" }, "dibatalkan", true],
    [{ ok: false, reason: "not_found" }, "tidak ditemukan", false],
    [{ ok: false, reason: "validation" }, "jumlah malam", false],
    [{ ok: false, reason: "not_ready" }, "belum siap", false],
    [{ ok: false, reason: "tariff_unavailable" }, "Tarif", false],
  ])("maps %j to a safe error (refresh=%s)", async (outcome, text, refresh) => {
    mocks.checkout.mockResolvedValue(outcome);
    const result = await confirmCheckoutAction(input);
    expect(result.status).toBe("error"); expect(result.message).toContain(text); expect(Boolean(result.refresh)).toBe(refresh);
  });
  it("never claims success on storage failure: the outcome is reported as unknown", async () => {
    mocks.checkout.mockRejectedValue(new AppError("SERVICE_UNAVAILABLE"));
    expect(await confirmCheckoutAction(input)).toMatchObject({ status: "unknown", message: expect.stringContaining("Periksa status transaksi") });
    mocks.checkout.mockRejectedValue(new Error("synthetic secret"));
    const result = await confirmCheckoutAction(input);
    expect(result.status).toBe("unknown"); expect(JSON.stringify(result)).not.toContain("synthetic");
  });
  it("denies forbidden access and redirects unauthenticated users", async () => {
    mocks.checkout.mockRejectedValueOnce(new AppError("FORBIDDEN"));
    expect(await confirmCheckoutAction(input)).toMatchObject({ status: "error", message: expect.stringContaining("tidak memiliki akses") });
    mocks.resolve.mockRejectedValueOnce(new AppError("UNAUTHENTICATED"));
    await expect(confirmCheckoutAction(input)).rejects.toThrow("redirect:/login");
    mocks.resolve.mockResolvedValueOnce({ status: "selection_required" });
    expect((await confirmCheckoutAction(input)).message).toContain("Pilih lokasi aktif");
  });
});
