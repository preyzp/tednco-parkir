// Display helpers shared by platform Server Components. No IO, no server-only data.
export type TenantStatusValue = "active" | "suspended" | "archived" | "unknown";

const statusLabels: Record<TenantStatusValue, string> = { active: "Aktif", suspended: "Ditangguhkan", archived: "Diarsipkan", unknown: "Tidak dikenal" };
export function tenantStatusLabel(status: TenantStatusValue): string {
  return statusLabels[status];
}

const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
export function formatTenantDate(iso: string | null): string {
  return iso ? dateFormat.format(new Date(iso)) : "—";
}

const numberFormat = new Intl.NumberFormat("id-ID");
export function formatCount(value: number): string {
  return numberFormat.format(value);
}

export const PLATFORM_TENANTS_PATH = "/platform/tenants";
export const PLATFORM_NEW_TENANT_PATH = "/platform/tenants/new";

// Allowed tenant status transitions (server-enforced; the UI only mirrors them).
// Archived tenants return only through the explicit restore (→ active).
export type TenantLifecycleStatus = "active" | "suspended" | "archived";
export const tenantStatusTransitions: Record<TenantLifecycleStatus, readonly TenantLifecycleStatus[]> = {
  active: ["suspended", "archived"],
  suspended: ["active", "archived"],
  archived: ["active"],
};
export function canTransitionTenant(from: string, to: string): boolean {
  return Object.hasOwn(tenantStatusTransitions, from) && (tenantStatusTransitions[from as TenantLifecycleStatus] as readonly string[]).includes(to);
}

// Single source for server validation and the form options.
export const tenantTimezones = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"] as const;
export const tenantTimezoneLabels: Record<(typeof tenantTimezones)[number], string> = { "Asia/Jakarta": "WIB (Asia/Jakarta)", "Asia/Makassar": "WITA (Asia/Makassar)", "Asia/Jayapura": "WIT (Asia/Jayapura)" };

// Client-side convenience only; the server validates the final slug.
export function suggestSlug(name: string): string {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "");
}
// Builds a list URL from the current query; unset/default values are omitted.
export function tenantListHref(current: { q?: string; status?: string; page?: number }, change: { q?: string; status?: string; page?: number } = {}): string {
  const next = { ...current, ...change };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status) params.set("status", next.status);
  if (next.page && next.page > 1) params.set("page", String(next.page));
  const search = params.toString();
  return search ? `${PLATFORM_TENANTS_PATH}?${search}` : PLATFORM_TENANTS_PATH;
}
