import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "./errors";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), update: vi.fn(), redirect: vi.fn((path: string) => { throw new Error("redirect:" + path); }) }));
vi.mock("server-only", () => ({}));
vi.mock("./workspace", () => ({ resolveActiveWorkspace: mocks.resolve }));
vi.mock("./dal", () => ({ updateLocationSettings: mocks.update }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { saveLocationSettingsAction } from "./settings-actions";

const scope = { tenantId: "a".repeat(24), locationId: "b".repeat(24) };
const active = { status: "active", workspace: { ...scope, tenantName: "T", locationName: "L", role: "owner" } };
const input = { tariffs: { motor: { regular: 1, overnight: 2 }, mobil: { regular: 3, overnight: 4 } }, operatingHours: { openTime: "06:00", closeTime: "22:00" }, expectedRevision: 0 };
const settings = { locationName: "L", revision: 1 };
beforeEach(() => { vi.clearAllMocks(); mocks.resolve.mockResolvedValue(active); });

describe("saveLocationSettingsAction", () => {
  it("targets the server-validated workspace and forwards only the three known fields", async () => {
    mocks.update.mockResolvedValue({ ok: true, settings });
    const result = await saveLocationSettingsAction({ ...input, tenantId: "c".repeat(24), locationId: "d".repeat(24), status: "inactive" } as typeof input);
    expect(mocks.update).toHaveBeenCalledWith(scope, input);
    expect(result).toEqual({ status: "success", settings });
  });
  it.each([
    [{ ok: false, reason: "validation", fieldErrors: { "operatingHours.closeTime": "x" } }, "error", "Periksa kembali"],
    [{ ok: false, reason: "conflict" }, "conflict", "Muat ulang halaman"],
    [{ ok: false, reason: "not_ready" }, "error", "belum siap"],
  ])("maps %j", async (outcome, status, text) => {
    mocks.update.mockResolvedValue(outcome);
    const result = await saveLocationSettingsAction(input);
    expect(result.status).toBe(status); expect(result.message).toContain(text);
    if (outcome.reason === "validation") expect(result.fieldErrors).toEqual({ "operatingHours.closeTime": "x" });
  });
  it("never claims success on storage failure, denies forbidden access and redirects unauthenticated users", async () => {
    mocks.update.mockRejectedValueOnce(new Error("synthetic secret"));
    const unknown = await saveLocationSettingsAction(input);
    expect(unknown.status).toBe("unknown"); expect(JSON.stringify(unknown)).not.toContain("synthetic");
    mocks.update.mockRejectedValueOnce(new AppError("FORBIDDEN"));
    expect(await saveLocationSettingsAction(input)).toMatchObject({ status: "error", message: expect.stringContaining("hanya dapat diubah oleh Owner") });
    mocks.resolve.mockRejectedValueOnce(new AppError("UNAUTHENTICATED"));
    await expect(saveLocationSettingsAction(input)).rejects.toThrow("redirect:/login");
    mocks.resolve.mockResolvedValueOnce({ status: "selection_required" });
    expect((await saveLocationSettingsAction(input)).message).toContain("Pilih lokasi aktif");
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });
});
