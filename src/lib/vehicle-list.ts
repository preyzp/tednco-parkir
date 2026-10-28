import { AUTHENTICATED_PATH } from "./login";
import { VEHICLES_PATH, VEHICLE_ENTRY_PATH, VEHICLE_EXIT_PATH } from "./owner-navigation";

// Display helpers for /app/kendaraan. No IO and no scope: tenant/location come
// from the server guard, never from these URLs.
export const vehicleStatusFilters = [
  { value: "active", label: "Parkir Aktif" },
  { value: "completed", label: "Sudah Keluar" },
  { value: "all", label: "Semua" },
] as const;
export const vehicleTypeFilters = [
  { value: "all", label: "Semua" },
  { value: "motor", label: "Motor" },
  { value: "mobil", label: "Mobil" },
] as const;
export const sessionStatusLabels = { active: "Parkir", completed: "Selesai", canceled: "Dibatalkan" } as const;

// Defaults (status=active, type=all, page=1) are omitted from the URL.
export function vehicleListHref(current: { q?: string; status?: string; type?: string; page?: number }, change: { q?: string; status?: string; type?: string; page?: number } = {}): string {
  const next = { ...current, ...change };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status && next.status !== "active") params.set("status", next.status);
  if (next.type && next.type !== "all") params.set("type", next.type);
  if (next.page && next.page > 1) params.set("page", String(next.page));
  const search = params.toString();
  return search ? `${VEHICLES_PATH}?${search}` : VEHICLES_PATH;
}

// Live search: the URL value (trimmed, ≤15 like the server parser) and the
// effective key the repository matches on (uppercase, no whitespace). Two inputs
// with the same key return the same rows, so no new request is needed.
export const vehicleSearchMax = 15;
export function vehicleSearchValue(raw: string): string | undefined {
  return raw.trim().slice(0, vehicleSearchMax) || undefined;
}
export function vehicleSearchKey(raw: string | undefined): string {
  return (vehicleSearchValue(raw ?? "") ?? "").toUpperCase().replace(/\s+/g, "");
}

// Checkout search (active vehicles only): q and page, defaults omitted.
export function vehicleExitSearchHref(current: { q?: string; page?: number } = {}): string {
  const params = new URLSearchParams();
  if (current.q) params.set("q", current.q);
  if (current.page && current.page > 1) params.set("page", String(current.page));
  const search = params.toString();
  return search ? `${VEHICLE_EXIT_PATH}?${search}` : VEHICLE_EXIT_PATH;
}

// Back targets (`?returnTo=`). Allowlist only: Beranda, the vehicle list or the
// checkout search, with their known parameters re-serialized from validated
// values. The raw input is never echoed, so external/protocol-relative URLs
// cannot leak through; anything else falls back.
const internalBase = "http://internal.invalid";
const listStatuses: readonly string[] = vehicleStatusFilters.map((filter) => filter.value);
const listTypes: readonly string[] = vehicleTypeFilters.map((filter) => filter.value);
type ReturnTarget = "home" | "list" | "exit";
function safeReturnPath(raw: string | string[] | undefined, allowed: readonly ReturnTarget[], fallback: string): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  let url: URL;
  try { url = new URL(value, internalBase); } catch { return fallback; }
  if (url.origin !== internalBase) return fallback;
  const q = url.searchParams.get("q")?.trim().slice(0, 15) || undefined;
  const rawPage = Number(url.searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 10_000 ? rawPage : undefined;
  if (url.pathname === AUTHENTICATED_PATH && allowed.includes("home")) return AUTHENTICATED_PATH;
  if (url.pathname === VEHICLE_EXIT_PATH && allowed.includes("exit")) return vehicleExitSearchHref({ q, page });
  if (url.pathname !== VEHICLES_PATH || !allowed.includes("list")) return fallback;
  const status = url.searchParams.get("status") ?? undefined;
  const type = url.searchParams.get("type") ?? undefined;
  return vehicleListHref({
    q,
    status: status && listStatuses.includes(status) ? status : undefined,
    type: type && listTypes.includes(type) ? type : undefined,
    page,
  });
}
// Entry form: Beranda or the vehicle list; fallback the vehicle list.
export function vehicleEntryReturnPath(raw: string | string[] | undefined): string {
  return safeReturnPath(raw, ["home", "list"], VEHICLES_PATH);
}
// The fallback (vehicle list) needs no parameter.
export function vehicleEntryHref(returnTo: string): string {
  const target = vehicleEntryReturnPath(returnTo);
  return target === VEHICLES_PATH ? VEHICLE_ENTRY_PATH : `${VEHICLE_ENTRY_PATH}?${new URLSearchParams({ returnTo: target })}`;
}
export function vehicleEntryBackLabel(target: string): string {
  return target === AUTHENTICATED_PATH ? "Beranda" : "daftar kendaraan";
}

// Checkout of one session: back to the vehicle list or the checkout search;
// fallback the checkout search. The session id is only a selection — the
// server re-scopes it to the active tenant/location.
export function vehicleCheckoutReturnPath(raw: string | string[] | undefined): string {
  return safeReturnPath(raw, ["list", "exit"], VEHICLE_EXIT_PATH);
}
export function vehicleCheckoutHref(sessionId: string, returnTo: string): string {
  const path = `${VEHICLE_EXIT_PATH}/${encodeURIComponent(sessionId)}`;
  const target = vehicleCheckoutReturnPath(returnTo);
  return target === VEHICLE_EXIT_PATH ? path : `${path}?${new URLSearchParams({ returnTo: target })}`;
}
export function vehicleCheckoutBackLabel(target: string): string {
  return target.startsWith(VEHICLE_EXIT_PATH) ? "pencarian kendaraan keluar" : "daftar kendaraan";
}
