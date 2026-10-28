import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Info, LogIn, LogOut, MapPin } from "lucide-react";
import { AppError } from "../../lib/errors";
import { listLocationVehicles, parseVehicleListQuery, type VehicleListResult } from "../../lib/dal";
import { AUTHENTICATED_PATH, LOGIN_PATH, SELECT_WORKSPACE_PATH } from "../../lib/login";
import { vehicleTypeLabels } from "../../lib/plates";
import { formatCount } from "../../lib/platform-labels";
import { formatDuration, formatLocalDateTime } from "../../lib/time";
import { vehicleCheckoutHref, vehicleEntryHref, vehicleExitSearchHref } from "../../lib/vehicle-list";
import { resolveActiveWorkspace, type WorkspaceState } from "../../lib/workspace";
import { BackLink } from "../back-link";
import { WorkspaceEmpty, WorkspaceForbidden, WorkspaceUnavailable } from "../workspace/workspace-status";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { VehicleSearch } from "./vehicle-search";

export function CheckoutSearchLoading() {
  return <div className="space-y-4" role="status" aria-label="Memuat kendaraan aktif"><Skeleton className="h-8 w-48" /><Skeleton className="h-11 w-full" />{[0, 1, 2].map((key) => <Skeleton key={key} className="h-24 w-full" />)}<span className="sr-only">Memuat kendaraan aktif...</span></div>;
}

// Checkout entry point from Beranda: active vehicles only (status/type filters
// are not taken from the URL). Same guarded, scoped repository as the list.
export async function CheckoutSearchContent({ searchParams, now: nowOverride }: { searchParams: Promise<Record<string, string | string[] | undefined>>; now?: Date }) {
  const parsed = parseVehicleListQuery(await searchParams);
  const query = { ...(parsed.q ? { q: parsed.q } : {}), status: "active" as const, type: "all" as const, page: parsed.page };
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
  const now = nowOverride ?? new Date();
  let list: VehicleListResult | null = null;
  let failure: "forbidden" | "unavailable" | null = null;
  try { list = await listLocationVehicles({ tenantId: state.workspace.tenantId, locationId: state.workspace.locationId }, query); }
  catch (error) { failure = error instanceof AppError && error.code === "FORBIDDEN" ? "forbidden" : "unavailable"; }
  if (failure === "forbidden") return <WorkspaceForbidden />;
  const here = vehicleExitSearchHref({ q: query.q, page: list?.page ?? query.page });
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BackLink href={AUTHENTICATED_PATH} to="Beranda" />
        <h1 className="text-2xl font-semibold tracking-tight">Kendaraan Keluar</h1>
        <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="size-4 text-primary" />{state.workspace.locationName}</p>
      </div>
      {list && !list.ready && <Alert><Info aria-hidden="true" /><AlertTitle>Pencatatan kendaraan belum siap</AlertTitle><AlertDescription>Penyimpanan sesi parkir di server belum disiapkan.</AlertDescription></Alert>}
      <Card>
        <CardContent className="space-y-5">
          <VehicleSearch q={query.q} target="exit" />
          {failure || !list
            ? <p role="alert" className="text-sm text-destructive">Kendaraan aktif tidak dapat dimuat. Muat ulang halaman sebentar lagi.</p>
            : list.rows.length === 0
              ? <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-10 text-center">
                  <p className="font-medium">{query.q ? "Kendaraan tidak ditemukan" : "Tidak ada kendaraan yang sedang parkir"}</p>
                  <p className="max-w-sm text-sm text-muted-foreground">{query.q ? "Periksa nomor polisi. Hanya kendaraan yang sedang parkir di lokasi ini yang dapat diproses keluar." : "Kendaraan yang dicatat masuk di lokasi ini akan muncul di sini."}</p>
                  {!query.q && <Button asChild variant="outline" className="h-11"><Link href={vehicleEntryHref(AUTHENTICATED_PATH)}><LogIn aria-hidden="true" />Kendaraan Masuk</Link></Button>}
                </div>
              : <>
                  <p className="text-sm text-muted-foreground" aria-live="polite">{formatCount(list.total)} kendaraan sedang parkir</p>
                  <ul className="grid gap-3 md:grid-cols-2">
                    {list.rows.map((row) => (
                      <li key={row.id}>
                        <Card className="h-full gap-3 py-4"><CardContent className="flex h-full flex-col gap-3 px-4">
                          <div className="min-w-0"><p className="font-mono text-lg font-semibold">{row.plateNumber}</p><p className="text-sm text-muted-foreground">{vehicleTypeLabels[row.vehicleType]} · masuk {formatLocalDateTime(row.entryAt, list.timeZone)}</p><p className="text-sm text-muted-foreground">Durasi {formatDuration(now.getTime() - new Date(row.entryAt).getTime())}</p></div>
                          <Button asChild className="mt-auto h-11 w-full sm:w-auto"><Link href={vehicleCheckoutHref(row.id, here)}><LogOut aria-hidden="true" />Proses Keluar</Link></Button>
                        </CardContent></Card>
                      </li>
                    ))}
                  </ul>
                  {list.pageCount > 1 && (
                    <nav aria-label="Halaman kendaraan aktif" className="flex items-center justify-between gap-3">
                      {list.page > 1 ? <Button asChild variant="outline" className="h-11"><Link href={vehicleExitSearchHref({ q: query.q, page: list.page - 1 })}>Sebelumnya</Link></Button> : <span />}
                      <p className="text-sm text-muted-foreground">Halaman {list.page} dari {list.pageCount}</p>
                      {list.page < list.pageCount ? <Button asChild variant="outline" className="h-11"><Link href={vehicleExitSearchHref({ q: query.q, page: list.page + 1 })}>Berikutnya</Link></Button> : <span />}
                    </nav>
                  )}
                </>}
        </CardContent>
      </Card>
    </div>
  );
}
