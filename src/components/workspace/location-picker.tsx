"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { AlertCircle, Building2, CheckCircle2, LoaderCircle, MapPin, ShieldAlert } from "lucide-react";
import { selectWorkspace, type SelectWorkspaceState } from "../../lib/workspace-actions";
import { roleLabel } from "../../lib/workspace-labels";
import { AUTHENTICATED_PATH } from "../../lib/login";
import type { TenantRole } from "../../types";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";

export interface PickerWorkspace {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly role: TenantRole;
  readonly locations: readonly { readonly locationId: string; readonly name: string }[];
}
const initialState: SelectWorkspaceState = {};

// Options are display-only; the Server Action revalidates every submission.
export function LocationPicker({ workspaces, activeLocationId, staleSelection = false }: { workspaces: readonly PickerWorkspace[]; activeLocationId?: string; staleSelection?: boolean }) {
  const [state, action, pending] = useActionState(selectWorkspace, initialState);
  const [chosen, setChosen] = useState("");
  return (
    <form action={action} aria-busy={pending} className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Pilih lokasi kerja</h1>
        <p className="text-sm leading-6 text-muted-foreground">Hanya lokasi aktif yang diizinkan untuk akun Anda yang ditampilkan.</p>
      </div>
      {staleSelection && <Alert><ShieldAlert aria-hidden="true" /><AlertTitle>Akses lokasi ditolak</AlertTitle><AlertDescription>Lokasi yang terakhir dipilih tidak aktif, tidak ditemukan, atau di luar izin Anda. Pilih lokasi lain.</AlertDescription></Alert>}
      {state.error && <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>Lokasi belum dapat dipilih</AlertTitle><AlertDescription>{state.error}</AlertDescription></Alert>}
      {workspaces.map((workspace) => (
        <section key={workspace.tenantId} aria-labelledby={`tenant-${workspace.tenantId}`} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={`tenant-${workspace.tenantId}`} className="flex min-w-0 items-center gap-2 text-base font-semibold"><Building2 aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" /><span className="break-words">{workspace.tenantName}</span></h2>
            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">Peran: {roleLabel(workspace.role)}</span>
          </div>
          <ul className="space-y-2">
            {workspace.locations.map((location) => {
              const value = `${workspace.tenantId}:${location.locationId}`;
              const active = location.locationId === activeLocationId;
              return (
                <li key={location.locationId}>
                  <Button type="submit" name="selection" value={value} variant="outline" disabled={pending} aria-current={active ? "true" : undefined} onClick={() => setChosen(value)} className="h-auto min-h-12 w-full justify-start gap-3 px-4 py-3 text-left whitespace-normal">
                    {pending && chosen === value ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <MapPin aria-hidden="true" />}
                    <span className="min-w-0 flex-1 break-words">{location.name}</span>
                    {active && <span className="inline-flex items-center gap-1 text-xs font-medium text-primary"><CheckCircle2 aria-hidden="true" className="size-4" />Aktif</span>}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p role="status" className="sr-only">{pending ? "Memeriksa izin lokasi..." : ""}</p>
      {activeLocationId && <Button asChild variant="ghost" className="h-12 w-full"><Link href={AUTHENTICATED_PATH}>Kembali ke ruang kerja</Link></Button>}
    </form>
  );
}
