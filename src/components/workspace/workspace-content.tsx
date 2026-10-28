import "server-only";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppError } from "../../lib/errors";
import { getCurrentSession } from "../../lib/auth-session";
import { LOGIN_PATH, PLATFORM_PATH, SELECT_WORKSPACE_PATH } from "../../lib/login";
import type { OwnerSection } from "../../lib/owner-navigation";
import { getLocationParkingOverview, type LocationParkingOverview } from "../../lib/dal";
import { resolveActiveWorkspace, type WorkspaceState } from "../../lib/workspace";
import { Card, CardContent } from "../ui/card";
import { OwnerDashboard } from "../owner/owner-dashboard";
import { OwnerShell, type OwnerChrome } from "../owner/owner-shell";
import { LocationPicker } from "./location-picker";
import { WorkspaceFrame } from "./workspace-frame";
import { WorkspaceEmpty, WorkspaceForbidden, WorkspaceUnavailable } from "./workspace-status";

// null = verification unavailable; never render data without a resolved state.
async function loadWorkspace(): Promise<WorkspaceState | null> {
  let unauthenticated = false;
  try { return await resolveActiveWorkspace(); }
  catch (error) { unauthenticated = error instanceof AppError && error.code === "UNAUTHENTICATED"; }
  if (unauthenticated) redirect(LOGIN_PATH);
  return null;
}

// Profile comes from the verified session of this request; the workspace
// (tenant/location/role) was just authorized by resolveActiveWorkspace.
async function ownerChrome(state: Extract<WorkspaceState, { status: "active" }>): Promise<OwnerChrome | null> {
  let session;
  try { session = await getCurrentSession(); } catch { return null; }
  if (!session) redirect(LOGIN_PATH);
  const { workspace, canSwitch } = state;
  return { tenantName: workspace.tenantName, locationName: workspace.locationName, role: workspace.role, canSwitch, userName: session.user.name, userEmail: session.user.email };
}

export async function WorkspaceHome() {
  const state = await loadWorkspace();
  if (!state) return <WorkspaceFrame><WorkspaceUnavailable /></WorkspaceFrame>;
  // platform_admin without an explicit membership has no tenant access here.
  if (state.status === "empty" && state.platformAdmin) redirect(PLATFORM_PATH);
  if (state.status === "empty") return <WorkspaceFrame><WorkspaceEmpty /></WorkspaceFrame>;
  if (state.status === "forbidden") return <WorkspaceFrame><WorkspaceForbidden /></WorkspaceFrame>;
  if (state.status === "selection_required") redirect(SELECT_WORKSPACE_PATH);
  const chrome = await ownerChrome(state);
  if (!chrome) return <WorkspaceFrame><WorkspaceUnavailable /></WorkspaceFrame>;
  // Location-scoped reads; the repository re-runs the permission guard.
  let overview: LocationParkingOverview | null = null;
  try { overview = await getLocationParkingOverview({ tenantId: state.workspace.tenantId, locationId: state.workspace.locationId }); } catch { overview = null; }
  return <OwnerShell section="dashboard" chrome={chrome}><OwnerDashboard locationName={chrome.locationName} role={chrome.role} overview={overview} /></OwnerShell>;
}

// Wraps other Owner App pages (e.g. Keamanan akun) in the shell when a
// workspace is active; otherwise falls back to the plain frame. The wrapped
// page keeps its own server guard — this wrapper authorizes nothing.
export async function OwnerAppFrame({ section, children }: { section: OwnerSection; children: ReactNode }) {
  let state: WorkspaceState | null = null;
  try { state = await resolveActiveWorkspace(); } catch { state = null; }
  const chrome = state?.status === "active" ? await ownerChrome(state) : null;
  if (!chrome) return <WorkspaceFrame>{children}</WorkspaceFrame>;
  return <OwnerShell section={section} chrome={chrome}>{children}</OwnerShell>;
}

export async function WorkspacePicker() {
  const state = await loadWorkspace();
  if (!state) return <WorkspaceUnavailable />;
  if (state.status === "empty" && state.platformAdmin) redirect(PLATFORM_PATH);
  if (state.status === "empty") return <WorkspaceEmpty />;
  // Only display strings cross to the client; the trusted context stays here.
  return (
    <Card className="rounded-2xl">
      <CardContent>
        <LocationPicker workspaces={state.workspaces} activeLocationId={state.status === "active" ? state.workspace.locationId : undefined} staleSelection={state.status === "forbidden"} />
      </CardContent>
    </Card>
  );
}
