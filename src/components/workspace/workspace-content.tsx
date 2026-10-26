import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftRight, MapPin } from "lucide-react";
import { AppError } from "../../lib/errors";
import { LOGIN_PATH, PLATFORM_PATH, SELECT_WORKSPACE_PATH } from "../../lib/login";
import { resolveActiveWorkspace, type WorkspaceState } from "../../lib/workspace";
import { roleLabel } from "../../lib/workspace-labels";
import { LogoutButton } from "../auth/logout-button";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { LocationPicker } from "./location-picker";
import { WorkspaceEmpty, WorkspaceForbidden, WorkspaceUnavailable } from "./workspace-status";

// null = verification unavailable; never render data without a resolved state.
async function loadWorkspace(): Promise<WorkspaceState | null> {
  let unauthenticated = false;
  try { return await resolveActiveWorkspace(); }
  catch (error) { unauthenticated = error instanceof AppError && error.code === "UNAUTHENTICATED"; }
  if (unauthenticated) redirect(LOGIN_PATH);
  return null;
}

export async function WorkspaceHome() {
  const state = await loadWorkspace();
  if (!state) return <WorkspaceUnavailable />;
  // platform_admin without an explicit membership has no tenant access here.
  if (state.status === "empty" && state.platformAdmin) redirect(PLATFORM_PATH);
  if (state.status === "empty") return <WorkspaceEmpty />;
  if (state.status === "forbidden") return <WorkspaceForbidden />;
  if (state.status === "selection_required") redirect(SELECT_WORKSPACE_PATH);
  const { workspace, canSwitch } = state;
  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium text-primary"><MapPin aria-hidden="true" className="size-4" />Lokasi aktif</p>
          <h1 className="text-2xl font-semibold tracking-tight break-words">{workspace.locationName}</h1>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="space-y-1"><dt className="text-muted-foreground">Usaha</dt><dd className="font-medium break-words">{workspace.tenantName}</dd></div>
          <div className="space-y-1"><dt className="text-muted-foreground">Peran</dt><dd className="font-medium">{roleLabel(workspace.role)}</dd></div>
        </dl>
        <p className="text-sm leading-6 text-muted-foreground">Modul operasional parkir akan tersedia pada tahap berikutnya.</p>
        <div className="space-y-3">
          {canSwitch && <Button asChild variant="outline" className="h-12 w-full"><Link href={SELECT_WORKSPACE_PATH}><ArrowLeftRight aria-hidden="true" />Ganti lokasi</Link></Button>}
          <LogoutButton />
        </div>
      </CardContent>
    </Card>
  );
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
