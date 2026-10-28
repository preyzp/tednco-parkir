// Persistence is always UTC (Date). Business days and display use the tenant's
// IANA time zone, independent of the server's own zone.
export const DEFAULT_TIME_ZONE = "Asia/Jakarta";

function isValidTimeZone(timeZone: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone }); return true; } catch { return false; }
}
export function safeTimeZone(timeZone: unknown): string {
  return typeof timeZone === "string" && timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
}

// Offset (ms) of `timeZone` from UTC at instant `at`.
function offsetAt(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

// UTC instant of 00:00 local time on the local calendar day containing `now`.
export function startOfLocalDay(now: Date, timeZone: string): Date {
  const zone = safeTimeZone(timeZone);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((part) => [part.type, part.value]));
  const localMidnightAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  // Two passes handle zones whose offset differs at midnight (DST); Indonesian zones have none.
  let guess = localMidnightAsUtc - offsetAt(new Date(localMidnightAsUtc), zone);
  guess = localMidnightAsUtc - offsetAt(new Date(guess), zone);
  return new Date(guess);
}

const zoneLabels: Record<string, string> = { "Asia/Jakarta": "WIB", "Asia/Makassar": "WITA", "Asia/Jayapura": "WIT" };
export function formatLocalDateTime(iso: string, timeZone: string): string {
  const zone = safeTimeZone(timeZone);
  const text = new Intl.DateTimeFormat("id-ID", { timeZone: zone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  return `${text} ${zoneLabels[zone] ?? zone}`;
}
export function formatLocalTime(iso: string, timeZone: string): string {
  const zone = safeTimeZone(timeZone);
  return new Intl.DateTimeFormat("id-ID", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

// Parking duration in Indonesian, e.g. "2 jam 15 menit", "1 hari 3 jam".
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60_000) return "kurang dari 1 menit";
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440); const hours = Math.floor((minutes % 1440) / 60); const rest = minutes % 60;
  if (days > 0) return hours > 0 ? `${days} hari ${hours} jam` : `${days} hari`;
  if (hours > 0) return rest > 0 ? `${hours} jam ${rest} menit` : `${hours} jam`;
  return `${rest} menit`;
}
