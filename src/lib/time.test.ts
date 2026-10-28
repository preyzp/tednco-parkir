import { describe, expect, it } from "vitest";
import { formatDuration, formatLocalDateTime, safeTimeZone, startOfLocalDay } from "./time";

describe("tenant-local day boundaries (stored in UTC)", () => {
  it.each([
    ["Asia/Jakarta", "2026-10-26T03:00:00Z", "2026-10-25T17:00:00.000Z"],
    ["Asia/Makassar", "2026-10-26T03:00:00Z", "2026-10-25T16:00:00.000Z"],
    ["Asia/Jayapura", "2026-10-26T03:00:00Z", "2026-10-25T15:00:00.000Z"],
    ["Asia/Jakarta", "2026-10-25T17:30:00Z", "2026-10-25T17:00:00.000Z"],
    ["Asia/Jakarta", "2026-10-25T16:59:59Z", "2026-10-24T17:00:00.000Z"],
  ])("%s at %s starts its local day at %s", (zone, now, expected) => {
    expect(startOfLocalDay(new Date(now), zone).toISOString()).toBe(expected);
  });
  it("falls back to Asia/Jakarta for unknown zones", () => {
    expect(safeTimeZone("Mars/Base")).toBe("Asia/Jakarta"); expect(safeTimeZone(undefined)).toBe("Asia/Jakarta");
  });
});

it("formats in the tenant zone with an Indonesian zone label", () => {
  expect(formatLocalDateTime("2026-10-26T03:15:00Z", "Asia/Jakarta")).toMatch(/26 Okt 2026.*10[.:]15 WIB/);
  expect(formatLocalDateTime("2026-10-26T03:15:00Z", "Asia/Makassar")).toMatch(/11[.:]15 WITA/);
});

describe("parking duration (Indonesian)", () => {
  it.each([[0, "kurang dari 1 menit"], [59_000, "kurang dari 1 menit"], [45 * 60_000, "45 menit"], [2 * 3600_000, "2 jam"], [(2 * 60 + 30) * 60_000, "2 jam 30 menit"], [26 * 3600_000, "1 hari 2 jam"], [48 * 3600_000, "2 hari"], [Number.NaN, "kurang dari 1 menit"]])("%d ms → %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});
