import "server-only";
import { redirect } from "next/navigation";
import { MapPin } from "lucide-react";
import { AppError } from "../../lib/errors";
import { LOGIN_PATH, SELECT_WORKSPACE_PATH } from "../../lib/login";
import { resolveActiveWorkspace, type WorkspaceState } from "../../lib/workspace";
import { WorkspaceEmpty, WorkspaceForbidden, WorkspaceUnavailable } from "../workspace/workspace-status";
import { vehicleEntryBackLabel, vehicleEntryReturnPath } from "../../lib/vehicle-list";
import { BackLink } from "../back-link";
import { Card, CardContent } from "../ui/card";
import { VehicleEntryForm } from "./vehicle-entry-form";

// Server guard on every request (session → membership → active tenant →
// active location). Owner-only in this phase; the Server Action and the
// repository re-check everything on submit. `returnTo` only picks the back
// link (allowlisted internal path; fallback: vehicle list).
export async function VehicleEntryContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const backHref = vehicleEntryReturnPath((await searchParams).returnTo);
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
    return <Card><CardContent className="space-y-2"><h1 className="text-xl font-semibold">Pencatatan kendaraan belum tersedia</h1><p className="text-sm text-muted-foreground">Saat ini pencatatan kendaraan masuk hanya tersedia untuk Owner.</p></CardContent></Card>;
  }
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <BackLink href={backHref} to={vehicleEntryBackLabel(backHref)} />
        <h1 className="text-2xl font-semibold tracking-tight">Kendaraan Masuk</h1>
        <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="size-4 text-primary" />Dicatat untuk lokasi <span className="font-medium text-foreground">{state.workspace.locationName}</span></p>
      </div>
      <VehicleEntryForm />
    </div>
  );
}
