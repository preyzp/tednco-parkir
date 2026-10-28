import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, KeyRound, MapPin, Receipt, type LucideIcon } from "lucide-react";
import { AppError } from "../../lib/errors";
import { LOGIN_PATH, SECURITY_SETTINGS_PATH, SELECT_WORKSPACE_PATH } from "../../lib/login";
import { TARIFF_SETTINGS_PATH } from "../../lib/owner-navigation";
import { resolveActiveWorkspace, type WorkspaceState } from "../../lib/workspace";
import { WorkspaceEmpty, WorkspaceForbidden, WorkspaceUnavailable } from "../workspace/workspace-status";
import { Card, CardContent } from "../ui/card";

function HubLink({ href, icon: Icon, title, description }: { href: string; icon: LucideIcon; title: string; description: string }) {
  return (
    <Link href={href} className="group flex min-h-20 items-center gap-4 rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon aria-hidden="true" className="size-5" /></span>
      <span className="min-w-0 flex-1"><span className="block text-base font-semibold">{title}</span><span className="block text-sm text-muted-foreground">{description}</span></span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

// Settings hub (main sidebar page: no back button). Owner-only in this phase;
// each linked page re-checks its own server guard.
export async function SettingsHubContent() {
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
    return <Card><CardContent className="space-y-2"><h1 className="text-xl font-semibold">Pengaturan belum tersedia</h1><p className="text-sm text-muted-foreground">Saat ini pengaturan hanya tersedia untuk Owner.</p></CardContent></Card>;
  }
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pengaturan</h1>
        <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="size-4 text-primary" />Lokasi aktif: <span className="font-medium text-foreground">{state.workspace.locationName}</span></p>
      </div>
      <nav aria-label="Menu pengaturan" className="grid gap-3">
        <HubLink href={TARIFF_SETTINGS_PATH} icon={Receipt} title="Tarif & Jam Operasional" description="Tarif Reguler dan Menginap per jenis kendaraan, serta jam buka dan tutup lokasi aktif." />
        <HubLink href={SECURITY_SETTINGS_PATH} icon={KeyRound} title="Keamanan Akun" description="Ganti password akun Owner Anda." />
      </nav>
    </div>
  );
}
