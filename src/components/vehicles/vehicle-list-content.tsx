import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, Ban, Car, CircleCheck, Info, LogIn, LogOut, MapPin } from "lucide-react";
import { AppError } from "../../lib/errors";
import { getLocationParkingOverview, listLocationVehicles, parseVehicleListQuery, type LocationParkingOverview, type VehicleListQuery, type VehicleListResult, type VehicleListRow } from "../../lib/dal";
import { LOGIN_PATH, SELECT_WORKSPACE_PATH } from "../../lib/login";
import { VEHICLES_PATH } from "../../lib/owner-navigation";
import { vehicleTypeLabels } from "../../lib/plates";
import { formatCount } from "../../lib/platform-labels";
import { formatDuration, formatLocalDateTime } from "../../lib/time";
import { sessionStatusLabels, vehicleCheckoutHref, vehicleEntryHref, vehicleListHref, vehicleStatusFilters, vehicleTypeFilters } from "../../lib/vehicle-list";
import { resolveActiveWorkspace, type WorkspaceState } from "../../lib/workspace";
import { WorkspaceEmpty, WorkspaceForbidden, WorkspaceUnavailable } from "../workspace/workspace-status";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { VehicleSearch } from "./vehicle-search";
import { Skeleton } from "../ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

export function VehicleListLoading() {
  return <div className="space-y-6" role="status" aria-label="Memuat daftar kendaraan"><Skeleton className="h-8 w-48" /><div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-24" />)}</div><Skeleton className="h-11 w-full" />{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-12 w-full" />)}<span className="sr-only">Memuat daftar kendaraan...</span></div>;
}

const statusIcons = { active: Car, completed: CircleCheck, canceled: Ban } as const;
// Status as text + icon, never color alone.
function SessionStatusBadge({ status }: { status: VehicleListRow["status"] }) {
  const Icon = statusIcons[status];
  return <Badge variant={status === "active" ? "default" : "outline"}><Icon aria-hidden="true" />{sessionStatusLabels[status]}</Badge>;
}
// No status dropdown/edit: an active session only closes through the paid
// checkout flow; completed/canceled rows are read-only.
function RowAction({ row, returnTo }: { row: VehicleListRow; returnTo: string }) {
  if (row.status !== "active") return <span className="text-sm text-muted-foreground">—</span>;
  return <Button asChild size="sm" variant="outline" className="h-11"><Link href={vehicleCheckoutHref(row.id, returnTo)}><LogOut aria-hidden="true" />Proses Keluar</Link></Button>;
}
function duration(row: VehicleListRow, now: Date) {
  const end = row.exitAt ? new Date(row.exitAt) : row.status === "active" ? now : null;
  return end ? formatDuration(end.getTime() - new Date(row.entryAt).getTime()) : "—";
}

function Overview({ overview }: { overview: LocationParkingOverview | null }) {
  const items = [
    { label: "Masuk Hari Ini", icon: ArrowDownToLine, value: overview?.entriesToday, note: undefined },
    { label: "Keluar Hari Ini", icon: ArrowUpFromLine, value: overview?.exitsToday, note: undefined },
    { label: "Parkir Aktif", icon: Car, value: overview?.activeCount, note: undefined },
  ];
  return (
    <section aria-label="Ringkasan kendaraan hari ini" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map(({ label, icon: Icon, value, note }) => (
        <Card key={label} className="gap-2 py-5">
          <CardContent className="space-y-1 px-5">
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Icon aria-hidden="true" className="size-4" />{label}</p>
            {value === undefined
              ? <><p className="text-3xl font-semibold text-muted-foreground" aria-label={`${label}: tidak dapat dimuat`}>—</p><p className="text-xs text-muted-foreground">Tidak dapat dimuat</p></>
              : <><p className="text-3xl font-semibold tracking-tight tabular-nums">{formatCount(value)}</p>{note && <p className="text-xs text-muted-foreground">{note}</p>}</>}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function Filters({ query }: { query: VehicleListQuery }) {
  const current = { q: query.q, status: query.status, type: query.type };
  return (
    <div className="space-y-4">
      <VehicleSearch q={query.q} status={query.status} type={query.type} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
        <nav aria-label="Filter status" className="flex flex-wrap gap-2">
          {vehicleStatusFilters.map(({ value, label }) => <Button key={value} asChild size="sm" variant={query.status === value ? "default" : "outline"} className="h-11 px-4"><Link href={vehicleListHref(current, { status: value, page: 1 })} aria-current={query.status === value ? "page" : undefined}>{label}</Link></Button>)}
        </nav>
        <nav aria-label="Filter jenis kendaraan" className="flex flex-wrap gap-2">
          {vehicleTypeFilters.map(({ value, label }) => <Button key={value} asChild size="sm" variant={query.type === value ? "secondary" : "ghost"} className="h-11 px-4"><Link href={vehicleListHref(current, { type: value, page: 1 })} aria-current={query.type === value ? "page" : undefined}>{label}</Link></Button>)}
        </nav>
      </div>
    </div>
  );
}

function Rows({ list, now, returnTo }: { list: VehicleListResult; now: Date; returnTo: string }) {
  const time = (iso: string | null) => (iso ? formatLocalDateTime(iso, list.timeZone) : "—");
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <caption className="sr-only">Daftar kendaraan</caption>
          <TableHeader><TableRow>{["Nomor Polisi", "Jenis", "Masuk", "Durasi", "Keluar", "Status", "Aksi"].map((head) => <TableHead key={head} scope="col">{head}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {list.rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell><p className="font-mono font-semibold">{row.plateNumber}</p>{row.notes && <p className="max-w-56 truncate text-xs text-muted-foreground" title={row.notes}>{row.notes}</p>}</TableCell>
                <TableCell>{vehicleTypeLabels[row.vehicleType]}</TableCell>
                <TableCell>{time(row.entryAt)}</TableCell>
                <TableCell className="tabular-nums">{duration(row, now)}</TableCell>
                <TableCell>{time(row.exitAt)}</TableCell>
                <TableCell><SessionStatusBadge status={row.status} /></TableCell>
                <TableCell><RowAction row={row} returnTo={returnTo} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="space-y-3 md:hidden" aria-label="Daftar kendaraan">
        {list.rows.map((row) => (
          <li key={row.id}>
            <Card className="gap-3 py-4">
              <CardContent className="space-y-3 px-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-lg font-semibold">{row.plateNumber}</p><p className="text-sm text-muted-foreground">{vehicleTypeLabels[row.vehicleType]}</p></div><SessionStatusBadge status={row.status} /></div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="text-muted-foreground">Masuk</dt><dd>{time(row.entryAt)}</dd></div>
                  <div><dt className="text-muted-foreground">Durasi</dt><dd className="tabular-nums">{duration(row, now)}</dd></div>
                  {row.exitAt && <div><dt className="text-muted-foreground">Keluar</dt><dd>{time(row.exitAt)}</dd></div>}
                  {row.notes && <div className="col-span-2"><dt className="text-muted-foreground">Catatan</dt><dd className="break-words">{row.notes}</dd></div>}
                </dl>
                {row.status === "active" && <RowAction row={row} returnTo={returnTo} />}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

// Server guard on every request; Owner-only in this phase. Reads are scoped
// by the repository to the guarded tenant/location — URL ids are ignored.
export async function VehicleListContent({ searchParams, now: nowOverride }: { searchParams: Promise<Record<string, string | string[] | undefined>>; now?: Date }) {
  const query = parseVehicleListQuery(await searchParams);
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
    return <Card><CardContent className="space-y-2"><h1 className="text-xl font-semibold">Daftar kendaraan belum tersedia</h1><p className="text-sm text-muted-foreground">Saat ini pengelolaan kendaraan hanya tersedia untuk Owner.</p></CardContent></Card>;
  }
  // Read the clock only after request data (searchParams/cookies) was accessed.
  const now = nowOverride ?? new Date();
  const selection = { tenantId: state.workspace.tenantId, locationId: state.workspace.locationId };
  let list: VehicleListResult | null = null;
  let listError: "forbidden" | "unavailable" | null = null;
  try { list = await listLocationVehicles(selection, query); }
  catch (error) { listError = error instanceof AppError && error.code === "FORBIDDEN" ? "forbidden" : "unavailable"; }
  if (listError === "forbidden") return <WorkspaceForbidden />;
  let overview: LocationParkingOverview | null = null;
  try { overview = await getLocationParkingOverview(selection, now); } catch { overview = null; }
  const filtered = Boolean(query.q) || query.type !== "all" || query.status !== "active";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Kendaraan</h1>
          <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="size-4 text-primary" />{state.workspace.locationName}</p>
        </div>
        <Button asChild className="h-11"><Link href={vehicleEntryHref(vehicleListHref(query))}><LogIn aria-hidden="true" />Kendaraan Masuk</Link></Button>
      </div>
      <Overview overview={overview} />
      {list && !list.ready && <Alert><Info aria-hidden="true" /><AlertTitle>Pencatatan kendaraan belum siap</AlertTitle><AlertDescription>Penyimpanan sesi parkir di server belum disiapkan. Daftar akan terisi setelah pencatatan kendaraan masuk aktif.</AlertDescription></Alert>}
      <Card>
        <CardContent className="space-y-5">
          <Filters query={query} />
          <p className="text-xs text-muted-foreground">Status kendaraan tidak dapat diubah langsung. Kendaraan aktif keluar melalui Proses Keluar dengan pembayaran.</p>
          {listError === "unavailable" || !list
            ? <p role="alert" className="text-sm text-destructive">Daftar kendaraan tidak dapat dimuat. Muat ulang halaman sebentar lagi.</p>
            : list.rows.length === 0
              ? <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-10 text-center">
                  <p className="font-medium">{filtered ? "Tidak ada kendaraan yang cocok" : "Belum ada kendaraan terparkir"}</p>
                  <p className="max-w-sm text-sm text-muted-foreground">{filtered ? "Ubah pencarian atau filter, lalu coba lagi." : "Belum ada kendaraan yang sedang parkir di lokasi ini."}</p>
                  {filtered ? <Button asChild variant="outline" className="h-11"><Link href={VEHICLES_PATH}>Hapus filter</Link></Button> : <Button asChild className="h-11"><Link href={vehicleEntryHref(vehicleListHref(query))}><LogIn aria-hidden="true" />Kendaraan Masuk</Link></Button>}
                </div>
              : <>
                  <p className="text-sm text-muted-foreground" aria-live="polite">{formatCount(list.total)} kendaraan</p>
                  <Rows list={list} now={now} returnTo={vehicleListHref(query)} />
                  {list.pageCount > 1 && (
                    <nav aria-label="Halaman daftar kendaraan" className="flex items-center justify-between gap-3">
                      {list.page > 1 ? <Button asChild variant="outline" className="h-11"><Link href={vehicleListHref(query, { page: list.page - 1 })}>Sebelumnya</Link></Button> : <span />}
                      <p className="text-sm text-muted-foreground">Halaman {list.page} dari {list.pageCount}</p>
                      {list.page < list.pageCount ? <Button asChild variant="outline" className="h-11"><Link href={vehicleListHref(query, { page: list.page + 1 })}>Berikutnya</Link></Button> : <span />}
                    </nav>
                  )}
                </>}
        </CardContent>
      </Card>
    </div>
  );
}
