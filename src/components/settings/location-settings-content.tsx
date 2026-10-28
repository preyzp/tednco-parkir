import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftRight, MapPin } from "lucide-react";
import { AppError } from "../../lib/errors";
import { getLocationSettings, type LocationSettingsView } from "../../lib/dal";
import { LOGIN_PATH, SELECT_WORKSPACE_PATH } from "../../lib/login";
import { SETTINGS_PATH } from "../../lib/owner-navigation";
import { resolveActiveWorkspace, type WorkspaceState } from "../../lib/workspace";
import { BackLink } from "../back-link";
import { WorkspaceEmpty, WorkspaceForbidden, WorkspaceUnavailable } from "../workspace/workspace-status";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { LocationSettingsForm } from "./location-settings-form";

export function LocationSettingsLoading() {
  return <div className="mx-auto max-w-3xl space-y-4" role="status" aria-label="Memuat pengaturan"><Skeleton className="h-8 w-64" /><Skeleton className="h-56 w-full" /><Skeleton className="h-40 w-full" /><span className="sr-only">Memuat pengaturan...</span></div>;
}

// Server guard on every request (session → membership → active tenant →
// active location), Owner-only. Only the active workspace's location is shown
// and saved; another location requires switching the workspace first.
export async function LocationSettingsContent() {
  let state: WorkspaceState | null = null;
  let unauthenticated = false;
  try { state = await resolveActiveWorkspace(); }
  catch (error) { unauthenticated = error instanceof AppError && error.code === "UNAUTHENTICATED"; }
  if (unauthenticated) redirect(LOGIN_PATH);
  if (!state) return <WorkspaceUnavailable />;
  if (state.status === "selection_required") redirect(SELECT_WORKSPACE_PATH);
  if (state.status === "empty") return <WorkspaceEmpty />;
  if (state.status === "forbidden") return <WorkspaceForbidden />;
  if (state.workspace.role !== "owner") {
    return <Card><CardContent className="space-y-2"><h1 className="text-xl font-semibold">Pengaturan tarif belum tersedia</h1><p className="text-sm text-muted-foreground">Saat ini tarif dan jam operasional hanya dapat diatur oleh Owner.</p></CardContent></Card>;
  }
  let settings: LocationSettingsView | null = null;
  let failure: "forbidden" | "unavailable" | null = null;
  try { settings = await getLocationSettings({ tenantId: state.workspace.tenantId, locationId: state.workspace.locationId }); }
  catch (error) { failure = error instanceof AppError && error.code === "FORBIDDEN" ? "forbidden" : "unavailable"; }
  if (failure === "forbidden") return <WorkspaceForbidden />;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <BackLink href={SETTINGS_PATH} to="Pengaturan" />
        <h1 className="text-2xl font-semibold tracking-tight">Tarif & Jam Operasional</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <p className="flex items-center gap-1"><MapPin aria-hidden="true" className="size-4 text-primary" />Lokasi: <span className="font-medium text-foreground">{settings?.locationName ?? state.workspace.locationName}</span></p>
          {state.canSwitch && <Button asChild variant="link" className="h-11 px-0"><Link href={SELECT_WORKSPACE_PATH}><ArrowLeftRight aria-hidden="true" />Ganti lokasi</Link></Button>}
        </div>
        <p className="text-sm text-muted-foreground">Pengaturan ini hanya berlaku untuk lokasi di atas.</p>
      </div>
      {!settings
        ? <Card><CardContent className="space-y-2"><h2 className="text-lg font-semibold">Pengaturan tidak dapat dimuat</h2><p className="text-sm text-muted-foreground">Muat ulang halaman sebentar lagi.</p></CardContent></Card>
        : <LocationSettingsForm key={settings.revision} settings={settings} />}
    </div>
  );
}
