import { safeTimeZone } from "./time";
import type { TariffType } from "../types";

// Pure parking charge rules (no IO): used by the server for the authoritative
// total and by the checkout screen for display only.

export type RateSource = "location" | "default";
export interface ParkingRates {
  readonly regular: { readonly amount: number; readonly source: RateSource };
  readonly overnight: { readonly amount: number; readonly source: RateSource };
}

// Agreed MVP default (operator decision, 2026-10-27), used ONLY when a location
// has no active tariff for the vehicle type and tariff type. Same for Motor and
// Mobil. Configured tariffs always win; this is not a production price list.
// Operating hours default: open 05:00, close 00:00 (location time), used when a
// location has no valid operating-hours setting (all locations before P4.6).
export const defaultParkingPolicy = Object.freeze({
  regularAmount: 5_000,
  overnightAmountPerNight: 10_000,
  openTime: "05:00",
  closeTime: "00:00",
});
export const maxNightCount = 999;
// Settings limits (P4.6): whole Rupiah per tariff, 24-hour "HH:MM" times.
export const tariffAmountMin = 1;
export const tariffAmountMax = 10_000_000;
export const timeOfDayPattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isTariffAmount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= tariffAmountMin && (value as number) <= tariffAmountMax;

function minutesOf(time: string): number {
  const match = timeOfDayPattern.exec(time);
  if (!match) throw new Error("Invalid time of day.");
  return Number(match[1]) * 60 + Number(match[2]);
}

export type PolicySource = "location" | "default";
export interface OperatingPolicy { readonly openTime: string; readonly closeTime: string; readonly source: PolicySource }
// Latest location setting (stored as { mode: "daily", openTime, closeTime }).
// Missing or malformed settings — including open == close, which the MVP does
// not allow — fall back to the default: the value only drives the night
// suggestion, never the charged total (the Owner chooses explicitly).
export function resolveOperatingPolicy(location: { operatingHours?: unknown } | null | undefined): OperatingPolicy {
  const hours = location?.operatingHours as { mode?: unknown; openTime?: unknown; closeTime?: unknown } | null | undefined;
  if (hours && typeof hours === "object" && hours.mode === "daily" && typeof hours.openTime === "string" && typeof hours.closeTime === "string"
    && timeOfDayPattern.test(hours.openTime) && timeOfDayPattern.test(hours.closeTime) && hours.openTime !== hours.closeTime) {
    return Object.freeze({ openTime: hours.openTime, closeTime: hours.closeTime, source: "location" as const });
  }
  return Object.freeze({ openTime: defaultParkingPolicy.openTime, closeTime: defaultParkingPolicy.closeTime, source: "default" as const });
}
function localDateParts(at: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}
function offsetAt(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at).map((part) => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)) - Math.floor(at.getTime() / 1000) * 1000;
}
// UTC instant of a local wall-clock time (two passes, like startOfLocalDay).
function localInstant(year: number, month: number, day: number, minutes: number, timeZone: string): number {
  const asUtc = Date.UTC(year, month - 1, day, 0, minutes);
  let guess = asUtc - offsetAt(new Date(asUtc), timeZone);
  guess = asUtc - offsetAt(new Date(guess), timeZone);
  return guess;
}

// Nights = local closing times passed while parked (entry < closing < exit).
// Leaving exactly at closing time does not count; entering after closing (e.g.
// 02:00) only counts the next closing. Computed in the location time zone.
export function countNights(entryAt: Date, exitAt: Date, timeZone: string, closeTime: string = defaultParkingPolicy.closeTime): number {
  const zone = safeTimeZone(timeZone);
  const close = minutesOf(closeTime);
  const entry = entryAt.getTime(); const exit = exitAt.getTime();
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || exit <= entry) return 0;
  const start = localDateParts(entryAt, zone);
  let nights = 0;
  for (let step = 0; step <= maxNightCount + 1; step++) {
    const date = new Date(Date.UTC(start.year, start.month - 1, start.day + step));
    const closing = localInstant(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), close, zone);
    if (closing >= exit) break;
    if (closing > entry) nights++;
  }
  return Math.min(nights, maxNightCount);
}

// Suggestion only: the Owner still selects Reguler or Menginap explicitly
// (BUSINESS_RULE 5.4); the system never switches the tariff by itself.
export function suggestTariff(nights: number): { tariffType: TariffType; nightCount: number } {
  return nights > 0 ? { tariffType: "overnight", nightCount: nights } : { tariffType: "regular", nightCount: 1 };
}

export type ChargeResult =
  | { readonly ok: true; readonly tariffType: TariffType; readonly amountPerUnit: number; readonly nightCount?: number; readonly totalAmount: number; readonly source: RateSource }
  | { readonly ok: false; readonly reason: "invalid_tariff" | "invalid_nights" };
// Menginap replaces Reguler (never added): total = per-night rate × nights.
export function calculateCharge(rates: ParkingRates, tariffType: unknown, nightCount?: unknown): ChargeResult {
  const validAmount = (value: number) => Number.isSafeInteger(value) && value > 0;
  if (tariffType === "regular") {
    if (!validAmount(rates.regular.amount)) return { ok: false, reason: "invalid_tariff" };
    return { ok: true, tariffType, amountPerUnit: rates.regular.amount, totalAmount: rates.regular.amount, source: rates.regular.source };
  }
  if (tariffType !== "overnight") return { ok: false, reason: "invalid_tariff" };
  if (typeof nightCount !== "number" || !Number.isInteger(nightCount) || nightCount < 1 || nightCount > maxNightCount) return { ok: false, reason: "invalid_nights" };
  if (!validAmount(rates.overnight.amount)) return { ok: false, reason: "invalid_tariff" };
  const totalAmount = rates.overnight.amount * nightCount;
  if (!Number.isSafeInteger(totalAmount)) return { ok: false, reason: "invalid_tariff" };
  return { ok: true, tariffType, amountPerUnit: rates.overnight.amount, nightCount, totalAmount, source: rates.overnight.source };
}

// Kept for existing imports; the id-ID formatting lives in ./money.
export { formatRupiah } from "./money";
