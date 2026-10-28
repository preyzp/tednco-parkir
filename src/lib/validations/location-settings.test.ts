import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { locationSettingsSchema } from "./location-settings";

const valid = () => ({
  tariffs: { motor: { regular: 2_000, overnight: 5_000 }, mobil: { regular: 5_000, overnight: 10_000 } },
  operatingHours: { openTime: "05:00", closeTime: "00:00" },
  expectedRevision: 0,
});
const issues = (input: unknown) => { const result = locationSettingsSchema.safeParse(input); return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`); };

describe("location settings validation", () => {
  it("accepts integer amounts within Rp1–Rp10.000.000 and distinct HH:MM times (incl. past midnight)", () => {
    expect(issues(valid())).toEqual([]);
    expect(issues({ ...valid(), tariffs: { motor: { regular: 1, overnight: 10_000_000 }, mobil: { regular: 1, overnight: 1 } } })).toEqual([]);
    expect(issues({ ...valid(), operatingHours: { openTime: "18:00", closeTime: "02:00" } })).toEqual([]);
    expect(issues({ ...valid(), operatingHours: { openTime: "00:00", closeTime: "23:59" } })).toEqual([]);
  });
  it.each([0, -1, 10_000_001, 2_500.5, Number.NaN, "5000", null])("rejects tariff amount %j", (amount) => {
    expect(issues({ ...valid(), tariffs: { ...valid().tariffs, mobil: { regular: amount, overnight: 10_000 } } })[0]).toMatch(/^tariffs\.mobil\.regular: /);
  });
  it.each(["5:00", "24:00", "12:60", "0500", "05.00", "", "05:00:00"])("rejects time %j", (time) => {
    expect(issues({ ...valid(), operatingHours: { openTime: time, closeTime: "22:00" } })[0]).toMatch(/^operatingHours\.openTime: .*24 jam/);
  });
  it("rejects open == close (24-hour locations are out of MVP scope)", () => {
    expect(issues({ ...valid(), operatingHours: { openTime: "05:00", closeTime: "05:00" } })).toEqual(["operatingHours.closeTime: Jam tutup harus berbeda dari jam buka."]);
  });
  it("requires both vehicle types and both tariff types (MVP: Motor and Mobil only)", () => {
    expect(issues({ ...valid(), tariffs: { motor: valid().tariffs.motor } }).join()).toContain("tariffs.mobil");
    expect(issues({ ...valid(), tariffs: { ...valid().tariffs, truk: { regular: 1, overnight: 1 } } }).length).toBeGreaterThan(0);
    expect(issues({ ...valid(), tariffs: { ...valid().tariffs, motor: { regular: 2_000 } } }).join()).toContain("tariffs.motor.overnight");
  });
  it("is strict: tenant/location/status/revision tampering is rejected", () => {
    for (const extra of [{ tenantId: "a".repeat(24) }, { locationId: "b".repeat(24) }, { status: "active" }]) expect(issues({ ...valid(), ...extra }).length).toBeGreaterThan(0);
    expect(issues({ ...valid(), operatingHours: { ...valid().operatingHours, mode: "weekly" } }).length).toBeGreaterThan(0);
    for (const revision of [-1, 1.5, "0", undefined]) expect(issues({ ...valid(), expectedRevision: revision }).length).toBeGreaterThan(0);
  });
});
