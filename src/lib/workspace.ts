import "server-only";
import { cookies } from "next/headers";
import { AppError } from "./errors";
import { hasPlatformAccess, listAuthorizedWorkspaces, requireLocationContext, type AuthorizedWorkspace, type LocationContext } from "./dal";
import type { TenantRole } from "../types";

// Remembers the last chosen location only. It is untrusted selection input:
// every request revalidates it against the database through the guards.
export const WORKSPACE_COOKIE = "tednco_workspace";
const cookiePattern = /^([a-f\d]{24})\.([a-f\d]{24})\.([a-f\d]{24})$/;
const hexId = /^[a-f\d]{24}$/i;

export interface ActiveWorkspace {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly role: TenantRole;
}
export type WorkspaceState =
  // platformAdmin only decides where to send the user; it grants no tenant access.
  | { readonly status: "empty"; readonly platformAdmin: boolean }
  | { readonly status: "selection_required"; readonly workspaces: readonly AuthorizedWorkspace[] }
  | { readonly status: "forbidden"; readonly workspaces: readonly AuthorizedWorkspace[] }
  | { readonly status: "active"; readonly workspace: ActiveWorkspace; readonly context: LocationContext; readonly canSwitch: boolean; readonly workspaces: readonly AuthorizedWorkspace[] };

export function encodeWorkspaceSelection(context: LocationContext): string {
  return `${context.userId.toHexString()}.${context.tenantId.toHexString()}.${context.locationId.toHexString()}`;
}
function decodeWorkspaceSelection(value: string | undefined) {
  const match = value ? cookiePattern.exec(value.toLowerCase()) : null;
  return match ? { userId: match[1], tenantId: match[2], locationId: match[3] } : undefined;
}
export function parseSelectionInput(value: unknown): { tenantId: string; locationId: string } | undefined {
  if (typeof value !== "string") return undefined;
  const [tenantId, locationId, extra] = value.split(":");
  if (extra !== undefined || !tenantId || !locationId || !hexId.test(tenantId) || !hexId.test(locationId)) return undefined;
  return { tenantId: tenantId.toLowerCase(), locationId: locationId.toLowerCase() };
}
export const workspaceCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
} as const;

// Throws AppError UNAUTHENTICATED / SERVICE_UNAVAILABLE; callers map them to
// redirect or a safe unavailable state. FORBIDDEN becomes a renderable state.
export async function resolveActiveWorkspace(): Promise<WorkspaceState> {
  const { userId, workspaces } = await listAuthorizedWorkspaces();
  const options = workspaces.flatMap((workspace) => workspace.locations.map((location) => ({ workspace, location })));
  if (options.length === 0) return { status: "empty", platformAdmin: await hasPlatformAccess() };
  const stored = decodeWorkspaceSelection((await cookies()).get(WORKSPACE_COOKIE)?.value);
  // A selection remembered for another account on this browser is ignored.
  const selection = stored && stored.userId === userId.toLowerCase() ? stored : undefined;
  let chosen = options.length === 1 && !selection ? options[0] : undefined;
  if (selection) {
    chosen = options.find((option) => option.workspace.tenantId === selection.tenantId && option.location.locationId === selection.locationId);
    if (!chosen) return { status: "forbidden", workspaces };
  }
  if (!chosen) return { status: "selection_required", workspaces };
  let context: LocationContext;
  try {
    // The list is display data; the guard is the authoritative check.
    context = await requireLocationContext({ tenantId: chosen.workspace.tenantId, locationId: chosen.location.locationId });
  } catch (error) {
    if (error instanceof AppError && error.code === "FORBIDDEN") return { status: "forbidden", workspaces };
    throw error;
  }
  return {
    status: "active",
    workspace: Object.freeze({ tenantId: chosen.workspace.tenantId, tenantName: chosen.workspace.tenantName, locationId: chosen.location.locationId, locationName: chosen.location.name, role: chosen.workspace.role }),
    context,
    canSwitch: options.length > 1,
    workspaces,
  };
}
