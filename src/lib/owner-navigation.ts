import { AUTHENTICATED_PATH, SECURITY_SETTINGS_PATH } from "./login";
import type { TenantRole } from "../types";

// Owner App navigation. Items without `href` are modules that are not built
// yet: they render as disabled ("Segera"), never as working links.
export type OwnerSection = "dashboard" | "kendaraan" | "transaksi" | "prabayar" | "laporan" | "pengaturan";
export interface OwnerNavItem {
  readonly key: OwnerSection;
  readonly label: string;
  readonly href?: string;
  readonly ownerOnly?: boolean;
}
export const VEHICLES_PATH = "/app/kendaraan";
export const VEHICLE_ENTRY_PATH = "/app/kendaraan/masuk";
// Checkout: active-vehicle search; one session at `${VEHICLE_EXIT_PATH}/<sessionId>`.
export const VEHICLE_EXIT_PATH = "/app/kendaraan/keluar";
export const ownerNavigation: readonly OwnerNavItem[] = [
  // "Beranda" is the dashboard and home of the quick actions (entry/exit).
  { key: "dashboard", label: "Beranda", href: AUTHENTICATED_PATH },
  // Vehicle list/management (entry form lives at VEHICLE_ENTRY_PATH). Owner-only in this phase.
  { key: "kendaraan", label: "Kendaraan", href: VEHICLES_PATH, ownerOnly: true },
  { key: "transaksi", label: "Transaksi" },
  { key: "prabayar", label: "Prabayar" },
  { key: "laporan", label: "Laporan" },
  // Only "Keamanan akun" exists so far, and it is Owner-only (server-guarded).
  { key: "pengaturan", label: "Pengaturan", href: SECURITY_SETTINGS_PATH, ownerOnly: true },
];
export function visibleOwnerNavigation(role: TenantRole): readonly OwnerNavItem[] {
  return ownerNavigation.filter((item) => !item.ownerOnly || role === "owner");
}
