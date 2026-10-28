import { describe, expect, it } from "vitest";
import { calculateCharge, countNights, defaultParkingPolicy, formatRupiah, isTariffAmount, maxNightCount, resolveOperatingPolicy, suggestTariff, type ParkingRates } from "./parking-tariff";

const rates: ParkingRates = { regular: { amount: 5_000, source: "default" }, overnight: { amount: 10_000, source: "default" } };
// Asia/Jakarta = UTC+7: local 00:00 on 27 Oct = 2026-10-26T17:00Z.
const wib = (local: string) => new Date(`${local}+07:00`);
const nights = (entry: string, exit: string, zone = "Asia/Jakarta") => countNights(wib(entry), wib(exit), zone);

describe("agreed default policy", () => {
  it("is Rp5.000 regular, Rp10.000 per night, open 05:00, close 00:00", () => {
    expect(defaultParkingPolicy).toEqual({ regularAmount: 5_000, overnightAmountPerNight: 10_000, openTime: "05:00", closeTime: "00:00" });
  });
});

describe("night count (closing times passed, location time zone)", () => {
  it.each([
    ["same operational day", "2026-10-26T08:00", "2026-10-26T23:59", 0],
    ["across one closing (23:00 → 00:30)", "2026-10-26T23:00", "2026-10-27T00:30", 1],
    ["overnight to next morning", "2026-10-26T10:00", "2026-10-27T09:00", 1],
    ["two nights", "2026-10-26T10:00", "2026-10-28T09:00", 2],
    ["three nights", "2026-10-26T10:00", "2026-10-29T07:00", 3],
    ["entered after closing (02:00 → 06:00)", "2026-10-27T02:00", "2026-10-27T06:00", 0],
    ["exactly at closing does not count", "2026-10-26T20:00", "2026-10-27T00:00", 0],
    ["one second after closing counts", "2026-10-26T20:00", "2026-10-27T00:00:01", 1],
    ["entering exactly at closing does not count that closing", "2026-10-27T00:00", "2026-10-27T10:00", 0],
    ["month and year boundary", "2026-12-31T12:00", "2027-01-01T08:00", 1],
  ])("%s", (_label, entry, exit, expected) => {
    expect(nights(entry, exit)).toBe(expected);
  });
  it("uses the location zone, not the server's: the same instants differ per zone", () => {
    // 2026-10-26T16:30Z → 2026-10-26T17:30Z crosses 00:00 WIB (17:00Z) but not 00:00 WITA (16:00Z, before entry).
    const entry = new Date("2026-10-26T16:30:00Z"); const exit = new Date("2026-10-26T17:30:00Z");
    expect(countNights(entry, exit, "Asia/Jakarta")).toBe(1);
    expect(countNights(entry, exit, "Asia/Makassar")).toBe(0);
    expect(countNights(entry, exit, "Asia/Jayapura")).toBe(0);
  });
  it("falls back to Asia/Jakarta for an invalid zone and returns 0 for non-positive/invalid ranges", () => {
    expect(countNights(wib("2026-10-26T23:00"), wib("2026-10-27T01:00"), "Mars/Base")).toBe(1);
    expect(nights("2026-10-27T10:00", "2026-10-27T09:00")).toBe(0);
    expect(countNights(new Date(Number.NaN), new Date(), "Asia/Jakarta")).toBe(0);
  });
  it("supports another closing time and caps very long stays", () => {
    expect(countNights(wib("2026-10-26T21:00"), wib("2026-10-26T23:00"), "Asia/Jakarta", "22:00")).toBe(1);
    expect(countNights(wib("2020-01-01T10:00"), wib("2026-01-01T10:00"), "Asia/Jakarta")).toBe(maxNightCount);
  });
});

describe("suggestion (never final: the Owner selects explicitly)", () => {
  it("suggests Reguler for 0 nights and Menginap with the counted nights otherwise", () => {
    expect(suggestTariff(0)).toEqual({ tariffType: "regular", nightCount: 1 });
    expect(suggestTariff(2)).toEqual({ tariffType: "overnight", nightCount: 2 });
  });
});

describe("charge (server-authoritative total)", () => {
  it("regular is the flat rate", () => {
    expect(calculateCharge(rates, "regular")).toEqual({ ok: true, tariffType: "regular", amountPerUnit: 5_000, totalAmount: 5_000, source: "default" });
  });
  it.each([[1, 10_000], [2, 20_000], [3, 30_000]])("Menginap %i malam replaces Reguler: Rp%i", (count, total) => {
    expect(calculateCharge(rates, "overnight", count)).toMatchObject({ ok: true, tariffType: "overnight", amountPerUnit: 10_000, nightCount: count, totalAmount: total });
  });
  it.each([0, -1, 1.5, Number.NaN, "2", undefined, maxNightCount + 1])("rejects night count %j", (count) => {
    expect(calculateCharge(rates, "overnight", count)).toEqual({ ok: false, reason: "invalid_nights" });
  });
  it.each(["menginap", "", undefined, "prepaid"])("rejects tariff type %j", (type) => {
    expect(calculateCharge(rates, type)).toEqual({ ok: false, reason: "invalid_tariff" });
  });
  it("rejects non-positive or fractional configured amounts and keeps the rate source", () => {
    expect(calculateCharge({ ...rates, regular: { amount: 0, source: "location" } }, "regular")).toEqual({ ok: false, reason: "invalid_tariff" });
    expect(calculateCharge({ ...rates, overnight: { amount: 2_500.5, source: "location" } }, "overnight", 1)).toEqual({ ok: false, reason: "invalid_tariff" });
    expect(calculateCharge({ ...rates, overnight: { amount: 12_000, source: "location" } }, "overnight", 2)).toMatchObject({ totalAmount: 24_000, source: "location" });
  });
});

it("formats Rupiah without decimals", () => {
  expect(formatRupiah(5_000)).toBe("Rp5.000");
  expect(formatRupiah(120_000)).toBe("Rp120.000");
});

describe("location closing time (Asia/Jakarta, P4.6)", () => {
  const n = (entry: string, exit: string, close: string) => countNights(wib(entry), wib(exit), "Asia/Jakarta", close);
  it.each([
    // close, entry, exit just before / exactly at / just after the closing time
    ["00:00", "2026-10-26T20:00", "2026-10-26T23:59:59", 0],
    ["00:00", "2026-10-26T20:00", "2026-10-27T00:00:00", 0],
    ["00:00", "2026-10-26T20:00", "2026-10-27T00:00:01", 1],
    ["22:00", "2026-10-26T08:00", "2026-10-26T21:59:59", 0],
    ["22:00", "2026-10-26T08:00", "2026-10-26T22:00:00", 0],
    ["22:00", "2026-10-26T08:00", "2026-10-26T22:00:01", 1],
    ["02:00", "2026-10-26T19:00", "2026-10-27T01:59:59", 0],
    ["02:00", "2026-10-26T19:00", "2026-10-27T02:00:00", 0],
    ["02:00", "2026-10-26T19:00", "2026-10-27T02:00:01", 1],
    ["23:59", "2026-10-26T10:00", "2026-10-26T23:58:59", 0],
    ["23:59", "2026-10-26T10:00", "2026-10-26T23:59:00", 0],
    ["23:59", "2026-10-26T10:00", "2026-10-27T00:00:00", 1],
  ])("close %s: %s → %s = %i", (close, entry, exit, expected) => {
    expect(n(entry, exit, close)).toBe(expected);
  });
  it.each([
    ["22:00", "2026-10-26T08:00", "2026-10-28T23:00", 3],
    ["02:00", "2026-10-26T19:00", "2026-10-29T03:00", 3], // past-midnight closing: 27, 28, 29 at 02:00
    ["23:59", "2026-10-30T12:00", "2026-11-02T09:00", 3], // month boundary
    ["22:00", "2026-12-31T21:00", "2027-01-01T23:00", 2], // year boundary: 31 Dec 22:00 and 1 Jan 22:00
    ["02:00", "2026-12-31T23:00", "2027-01-01T03:00", 1],
  ])("several nights (close %s): %s → %s = %i", (close, entry, exit, expected) => {
    expect(n(entry, exit, close)).toBe(expected);
  });
  it("entering after the closing time only counts the next closing (close 22:00)", () => {
    expect(n("2026-10-26T23:00", "2026-10-27T21:00", "22:00")).toBe(0);
    expect(n("2026-10-26T23:00", "2026-10-27T22:30", "22:00")).toBe(1);
  });
  it("the latest closing time applies to the whole stay of an active vehicle", () => {
    // Same stay, closing changed from 00:00 to 22:00 before checkout.
    expect(n("2026-10-26T21:00", "2026-10-26T23:00", "00:00")).toBe(0);
    expect(n("2026-10-26T21:00", "2026-10-26T23:00", "22:00")).toBe(1);
  });
});

describe("resolveOperatingPolicy", () => {
  it("uses a valid daily location setting", () => {
    expect(resolveOperatingPolicy({ operatingHours: { mode: "daily", openTime: "18:00", closeTime: "02:00" } })).toEqual({ openTime: "18:00", closeTime: "02:00", source: "location" });
  });
  it.each([
    ["no setting (older location)", {}],
    ["null location", null],
    ["legacy per-day shape", { operatingHours: { monday: { open: "05:00", close: "22:00", isClosed: false } } }],
    ["open equals close", { operatingHours: { mode: "daily", openTime: "05:00", closeTime: "05:00" } }],
    ["invalid time", { operatingHours: { mode: "daily", openTime: "5:00", closeTime: "24:00" } }],
    ["unknown mode", { operatingHours: { mode: "weekly", openTime: "05:00", closeTime: "22:00" } }],
  ])("falls back to the default 05:00–00:00: %s", (_label, location) => {
    expect(resolveOperatingPolicy(location)).toEqual({ openTime: "05:00", closeTime: "00:00", source: "default" });
  });
});

it("tariff amount bounds: integer Rp1–Rp10.000.000", () => {
  for (const ok of [1, 5_000, 10_000_000]) expect(isTariffAmount(ok)).toBe(true);
  for (const bad of [0, -1, 10_000_001, 2_500.5, Number.NaN, "5000", undefined]) expect(isTariffAmount(bad)).toBe(false);
});
