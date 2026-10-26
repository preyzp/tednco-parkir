import type { TenantRole } from "../types";

const roleLabels: Record<TenantRole, string> = { owner: "Pemilik", admin: "Admin", staff: "Staf" };
export function roleLabel(role: TenantRole): string {
  return roleLabels[role];
}
