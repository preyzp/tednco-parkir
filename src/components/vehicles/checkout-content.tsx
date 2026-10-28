import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Ban, Info, LogOut, MapPin, SearchX } from "lucide-react";
import { AppError } from "../../lib/errors";
import { getParkingCheckout, type CheckoutView } from "../../lib/dal";
import { LOGIN_PATH, SELECT_WORKSPACE_PATH } from "../../lib/login";
import { VEHICLE_EXIT_PATH } from "../../lib/owner-navigation";
import { vehicleCheckoutBackLabel, vehicleCheckoutReturnPath } from "../../lib/vehicle-list";
import { resolveActiveWorkspace, type WorkspaceState } from "../../lib/workspace";
import { BackLink } from "../back-link";
import { WorkspaceEmpty, WorkspaceForbidden, WorkspaceUnavailable } from "../workspace/workspace-status";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { CheckoutForm } from "./checkout-form";
import { CheckoutReceiptDetails } from "./checkout-receipt";

export function CheckoutLoading() {
  return <div className="mx-auto max-w-2xl space-y-4" role="status" aria-label="Memuat data kendaraan"><Skeleton className="h-8 w-56" /><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /><span className="sr-only">Memuat data kendaraan...</span></div>;
}

function Notice({ icon: Icon, title, text, children }: { icon: typeof Info; title: string; text: string; children?: React.ReactNode }) {
  return <Card className="rounded-2xl"><CardContent className="space-y-4"><Icon aria-hidden="true" className="size-8 text-muted-foreground" /><div className="space-y-1"><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{text}</p></div>{children}</CardContent></Card>;
}

// Server guard on every request (session → membership → active tenant →
// active location), Owner-only. The session id in the URL is only a selection:
// the repository re-scopes it to the guarded tenant/location.
export async function CheckoutContent({ params, searchParams, now: nowOverride }: { params: Promise<{ sessionId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>; now?: Date }) {
  const { sessionId } = await params;
  const backHref = vehicleCheckoutReturnPath((await searchParams).returnTo);
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
    return <Card><CardContent className="space-y-2"><h1 className="text-xl font-semibold">Proses keluar belum tersedia</h1><p className="text-sm text-muted-foreground">Saat ini proses kendaraan keluar hanya tersedia untuk Owner.</p></CardContent></Card>;
  }
  // Read the clock only after request data (params/searchParams/cookies).
  const now = nowOverride ?? new Date();
  let view: CheckoutView | null = null;
  let failure: "forbidden" | "unavailable" | null = null;
  try { view = await getParkingCheckout({ tenantId: state.workspace.tenantId, locationId: state.workspace.locationId }, sessionId, now); }
  catch (error) { failure = error instanceof AppError && error.code === "FORBIDDEN" ? "forbidden" : "unavailable"; }
  if (failure === "forbidden") return <WorkspaceForbidden />;
  const exitButton = <Button asChild className="h-11"><Link href={VEHICLE_EXIT_PATH}><LogOut aria-hidden="true" />Cari kendaraan lain</Link></Button>;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <BackLink href={backHref} to={vehicleCheckoutBackLabel(backHref)} />
        <h1 className="text-2xl font-semibold tracking-tight">Kendaraan Keluar</h1>
        <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="size-4 text-primary" />{state.workspace.locationName}</p>
      </div>
      {!view || failure
        ? <Notice icon={Info} title="Data kendaraan tidak dapat dimuat" text="Muat ulang halaman sebentar lagi. Jangan menerima pembayaran sebelum data tampil." />
        : view.kind === "active" ? <CheckoutForm quote={view.quote} backHref={backHref} />
        : view.kind === "completed"
          ? (view.receipt
            ? <Card className="rounded-2xl"><CardContent className="space-y-5"><CheckoutReceiptDetails receipt={view.receipt} title="Kendaraan sudah keluar" /><p className="text-sm text-muted-foreground">Sesi yang selesai bersifat read-only dan tidak dapat diproses keluar ulang.</p>{exitButton}</CardContent></Card>
            : <Notice icon={Info} title="Kendaraan sudah keluar" text="Sesi ini sudah selesai dan tidak dapat diproses ulang. Rincian transaksi tidak dapat ditampilkan.">{exitButton}</Notice>)
        : view.kind === "canceled" ? <Notice icon={Ban} title="Sesi parkir dibatalkan" text={`Sesi ${view.plateNumber} sudah dibatalkan dan tidak dapat diproses keluar.`}>{exitButton}</Notice>
        : view.kind === "not_found" ? <Notice icon={SearchX} title="Sesi parkir tidak ditemukan" text="Sesi ini tidak ada di lokasi aktif Anda atau tautannya tidak valid.">{exitButton}</Notice>
        : view.kind === "not_ready"
          ? <Alert><Info aria-hidden="true" /><AlertTitle>Proses keluar belum siap</AlertTitle><AlertDescription>Penyimpanan transaksi pembayaran di server belum disiapkan. Hubungi pengelola platform. Tidak ada pembayaran yang dicatat.</AlertDescription></Alert>
          : <Alert variant="destructive"><Info aria-hidden="true" /><AlertTitle>Tarif belum konsisten</AlertTitle><AlertDescription>Tarif aktif lokasi ini tidak dapat dipastikan. Hubungi pengelola sebelum memproses keluar.</AlertDescription></Alert>}
    </div>
  );
}
