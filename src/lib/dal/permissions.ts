import "server-only";
import type { Permission, TenantRole } from "../../types";

export const permissions = [
  "vehicle.create", "vehicle.read", "vehicle.update_active", "parking.checkout", "parking.cancel", "parking.read_history",
  "tariff.read", "tariff.manage", "prepaid.read", "prepaid.register", "prepaid.deposit", "prepaid.toggle_status",
  "prepaid.refund", "prepaid.adjust_balance", "reports.read_operational", "reports.read_financial", "transactions.correct",
  "memberships.manage", "locations.manage", "subscription.manage",
] as const satisfies readonly Permission[];
const operational: readonly Permission[] = ["vehicle.create", "vehicle.read", "vehicle.update_active", "parking.checkout", "parking.read_history", "tariff.read", "prepaid.read", "reports.read_operational"];
const staffExtras: readonly Permission[] = ["parking.cancel", "prepaid.register", "prepaid.deposit", "prepaid.toggle_status"];
const adminExtras: readonly Permission[] = [...staffExtras, "tariff.manage", "prepaid.refund", "prepaid.adjust_balance", "reports.read_financial", "transactions.correct"];

// Extra grants can never promote a role or expand its location scope.
export function effectivePermissions(role: TenantRole, extra: readonly Permission[]): readonly Permission[] {
  if (role === "owner") return Object.freeze([...permissions]);
  const allowed = role === "admin" ? adminExtras : staffExtras;
  return Object.freeze([...new Set([...operational, ...extra.filter((permission) => allowed.includes(permission))])]);
}
