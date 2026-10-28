import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, ArrowRight, Building2, CircleCheck, CirclePause, Inbox, Info, Mail, MapPin, Plus, Search, ServerCrash, ShieldAlert, ShieldCheck, UserRound, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppError } from "../../lib/errors";
import { getPlatformOverview, getPlatformTenantDetail, listPlatformTenants, parseTenantListQuery, requirePlatformAccess } from "../../lib/dal";
import { AUTHENTICATED_PATH, LOGIN_PATH } from "../../lib/login";
import { PLATFORM_NEW_TENANT_PATH, PLATFORM_TENANTS_PATH, formatCount, formatTenantDate, tenantListHref, tenantStatusLabel } from "../../lib/platform-labels";
import { LogoutButton } from "../auth/logout-button";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { BackLink } from "../back-link";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Skeleton } from "../ui/skeleton";
import { FlashToast } from "../flash-toast";
import { CreateTenantForm } from "./create-tenant-form";
import { RenameTenantDialog, TenantStatusActions } from "./tenant-management";
import { LocationDialog, LocationStatusDialog, RenameOwnerDialog } from "./tenant-resources";
import { Badge } from "../ui/badge";
import { TenantStatusBadge, TenantTable } from "./tenant-table";

type Denied = "forbidden" | "unavailable";
// Every /platform page loads through this: the repository authorizes
// platform_admin on the server before any query. Layouts are not relied on.
async function platformLoad<T>(work: () => Promise<T>): Promise<{ data: T } | { denied: Denied }> {
  let outcome: "unauthenticated" | Denied;
  try { return { data: await work() }; }
  catch (error) {
    outcome = error instanceof AppError && error.code === "UNAUTHENTICATED" ? "unauthenticated" : error instanceof AppError && error.code === "FORBIDDEN" ? "forbidden" : "unavailable";
  }
  if (outcome === "unauthenticated") redirect(LOGIN_PATH);
  return { denied: outcome };
}

function PlatformNotice({ denied }: { denied: Denied }) {
  if (denied === "forbidden") {
    return <Card><CardContent className="space-y-5"><ShieldAlert aria-hidden="true" className="size-8 text-destructive" /><div className="space-y-2"><h1 className="text-xl font-semibold">Akses Platform Admin ditolak</h1><p className="text-sm leading-6 text-muted-foreground">Halaman ini hanya untuk pengelola platform TednCo Parkir. Akun Anda tidak memiliki izin tersebut.</p></div><Button asChild className="h-12 w-full"><Link href={AUTHENTICATED_PATH}>Kembali ke ruang kerja</Link></Button><LogoutButton /></CardContent></Card>;
  }
  return <Card><CardContent className="space-y-5"><ServerCrash aria-hidden="true" className="size-8 text-muted-foreground" /><div className="space-y-2"><h1 className="text-xl font-semibold">Layanan belum tersedia</h1><p className="text-sm leading-6 text-muted-foreground">Data platform belum dapat dimuat. Muat ulang halaman sebentar lagi.</p></div><LogoutButton /></CardContent></Card>;
}

function StatCard({ label, value, icon: Icon, hint }: { label: string; value: number; icon: LucideIcon; hint?: string }) {
  return (
    <Card className="gap-2 py-5">
      <CardContent className="space-y-2 px-5">
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Icon aria-hidden="true" className="size-4" />{label}</p>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">{formatCount(value)}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return <div className="space-y-3">{Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-10 w-full" />)}</div>;
}
export function PlatformDashboardLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Memuat ringkasan platform">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div>
      <ListSkeleton rows={5} />
      <span className="sr-only">Memuat ringkasan platform...</span>
    </div>
  );
}
export function TenantListLoading() {
  return <div className="space-y-6" role="status" aria-label="Memuat daftar tenant"><Skeleton className="h-8 w-48" /><Skeleton className="h-11 w-full" /><ListSkeleton rows={8} /><span className="sr-only">Memuat daftar tenant...</span></div>;
}

export async function PlatformDashboard() {
  const result = await platformLoad(getPlatformOverview);
  if ("denied" in result) return <PlatformNotice denied={result.denied} />;
  const overview = result.data;
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium text-primary"><ShieldCheck aria-hidden="true" className="size-4" />Akses platform terverifikasi</p>
        <h1 className="text-2xl font-semibold tracking-tight">Ringkasan Platform</h1>
        <p className="text-sm text-muted-foreground">Data direktori tenant dan lokasi. Data operasional parkir tenant tidak ditampilkan di sini.</p>
      </div>
      <section aria-label="Ringkasan tenant" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total Tenant" value={overview.totalTenants} icon={Building2} />
        <StatCard label="Tenant Aktif" value={overview.activeTenants} icon={CircleCheck} />
        <StatCard label="Tenant Nonaktif" value={overview.inactiveTenants} icon={CirclePause} hint="Ditangguhkan atau diarsipkan" />
        <StatCard label="Total Lokasi" value={overview.totalLocations} icon={MapPin} />
      </section>
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Tenant terbaru</h2>
            <Button asChild variant="outline" className="h-11"><Link href={PLATFORM_TENANTS_PATH}>Lihat semua tenant<ArrowRight aria-hidden="true" /></Link></Button>
          </div>
          {overview.recentTenants.length === 0
            ? <EmptyState title="Belum ada tenant" description="Tenant akan muncul di sini setelah terdaftar di platform." />
            : <TenantTable rows={overview.recentTenants} caption="Tenant terbaru" />}
        </CardContent>
      </Card>
      <LogoutButton />
    </div>
  );
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-10 text-center"><Inbox aria-hidden="true" className="size-8 text-muted-foreground" /><p className="font-medium">{title}</p><p className="max-w-sm text-sm text-muted-foreground">{description}</p>{action}</div>;
}

export function TenantDetailLoading() {
  return <div className="space-y-6" role="status" aria-label="Memuat detail tenant"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /><Skeleton className="h-32 w-full" /><span className="sr-only">Memuat detail tenant...</span></div>;
}

// The form page is guarded too: only platform_admin ever receives the form.
export async function NewTenantContent() {
  const result = await platformLoad(requirePlatformAccess);
  if ("denied" in result) return <PlatformNotice denied={result.denied} />;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <BackLink href={PLATFORM_TENANTS_PATH} to="daftar tenant" />
        <h1 className="text-2xl font-semibold tracking-tight">Buat Tenant Baru</h1>
        <p className="text-sm text-muted-foreground">Tenant, lokasi pertama, dan akun Owner dibuat sekaligus. Jika salah satu gagal, tidak ada data yang tersimpan.</p>
      </div>
      <Card><CardContent><CreateTenantForm /></CardContent></Card>
    </div>
  );
}

const flashParams = ["dibuat", "diperbarui"] as const;
const locationStatusLabel = { active: "Aktif", inactive: "Nonaktif", unknown: "Tidak dikenal" } as const;
// Text + icon, never color alone.
function LocationStatusBadge({ status }: { status: keyof typeof locationStatusLabel }) {
  const Icon = status === "active" ? CircleCheck : status === "inactive" ? CirclePause : Info;
  return <Badge variant={status === "active" ? "default" : "outline"}><Icon aria-hidden="true" />{locationStatusLabel[status]}</Badge>;
}
export async function TenantDetailContent({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ tenantId }, query] = await Promise.all([params, searchParams]);
  const result = await platformLoad(() => getPlatformTenantDetail(tenantId));
  if ("denied" in result) return <PlatformNotice denied={result.denied} />;
  const tenant = result.data;
  if (!tenant) {
    return <Card><CardContent className="space-y-5"><Inbox aria-hidden="true" className="size-8 text-muted-foreground" /><div className="space-y-2"><h1 className="text-xl font-semibold">Tenant tidak ditemukan</h1><p className="text-sm text-muted-foreground">Tenant ini tidak ada atau tautannya tidak valid.</p></div><Button asChild variant="outline" className="h-12 w-full"><Link href={PLATFORM_TENANTS_PATH}>Kembali ke daftar tenant</Link></Button></CardContent></Card>;
  }
  // The flag only selects a message; the status shown is read from the database.
  const justCreated = query.dibuat === "1";
  const ownerReady = tenant.owners.some((owner) => owner.accountStatus === "active" && owner.membershipStatus === "active");
  const updateNotices: Record<string, { title: string; description?: string }> = {
    nama: { title: "Nama usaha diperbarui." },
    status: { title: `Status tenant kini ${tenantStatusLabel(tenant.status)}.`, description: "Berlaku pada permintaan berikutnya pengguna tenant." },
    owner: { title: "Nama Owner diperbarui." },
    "lokasi-baru": { title: "Lokasi baru ditambahkan.", description: "Lokasi langsung berstatus Aktif." },
    lokasi: { title: "Lokasi diperbarui." },
    "status-lokasi": { title: "Status lokasi diperbarui.", description: "Berlaku pada permintaan berikutnya pengguna tenant." },
  };
  const noticeKey = typeof query.diperbarui === "string" && Object.hasOwn(updateNotices, query.diperbarui) ? query.diperbarui : undefined;
  const notice = noticeKey ? { key: noticeKey, ...updateNotices[noticeKey] } : undefined;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BackLink href={PLATFORM_TENANTS_PATH} to="daftar tenant" />
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight break-words">{tenant.name}</h1><TenantStatusBadge status={tenant.status} /></div>
      </div>
      {/* Transient outcomes → one-time toast (flag removed from the URL). Persistent
          conditions below stay as banners because they describe current state. */}
      {justCreated && ownerReady && <FlashToast id={`tenant-created-${tenant.id}`} kind="success" title="Tenant dan akun Owner berhasil dibuat." description="Owner dapat masuk dengan email dan password awal yang Anda tetapkan." clearParams={flashParams} />}
      {notice && <FlashToast id={`tenant-${notice.key}-${tenant.id}`} kind="success" title={notice.title} description={notice.description} clearParams={flashParams} />}
      {justCreated && !ownerReady && <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>Status Owner perlu diperiksa</AlertTitle><AlertDescription>Tenant tersimpan, tetapi akun Owner aktif tidak ditemukan. Jangan membuat ulang tenant ini.</AlertDescription></Alert>}
      {tenant.status !== "active" && <Alert variant="destructive"><ShieldAlert aria-hidden="true" /><AlertTitle>Tenant {tenantStatusLabel(tenant.status).toLowerCase()}</AlertTitle><AlertDescription>Owner, Admin, dan Staff tenant ini tidak dapat mengakses operasional. Data tetap tersimpan.</AlertDescription></Alert>}

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Building2 aria-hidden="true" className="size-5 text-muted-foreground" />Informasi Usaha</h2>
            <RenameTenantDialog tenantId={tenant.id} currentName={tenant.name} />
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="space-y-1"><dt className="text-muted-foreground">Nama usaha</dt><dd className="font-medium break-words">{tenant.name}</dd></div>
            <div className="space-y-1"><dt className="text-muted-foreground">Slug (tidak dapat diubah)</dt><dd className="font-mono break-all">{tenant.slug || "—"}</dd></div>
            <div className="space-y-1"><dt className="text-muted-foreground">Zona waktu</dt><dd>{tenant.timezone || "—"}</dd></div>
            <div className="space-y-1"><dt className="text-muted-foreground">Tanggal dibuat</dt><dd>{formatTenantDate(tenant.createdAt)}</dd></div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><UserRound aria-hidden="true" className="size-5 text-muted-foreground" />Akun Owner</h2>
          {tenant.owners.length === 0
            ? <p className="text-sm text-muted-foreground">Belum ada Owner yang terhubung.</p>
            : <ul className="divide-y">{tenant.owners.map((owner) => (
              <li key={owner.userId} className="space-y-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0"><p className="font-medium break-words">{owner.name}</p><p className="text-sm break-all text-muted-foreground">{owner.email}</p></div>
                  <p className="flex items-center gap-1 text-sm">{owner.accountStatus === "active" && owner.membershipStatus === "active" ? <><CircleCheck aria-hidden="true" className="size-4 text-primary" />Akun dan membership aktif</> : <><CirclePause aria-hidden="true" className="size-4 text-muted-foreground" />Perlu diperiksa</>}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <RenameOwnerDialog tenantId={tenant.id} userId={owner.userId} currentName={owner.name} />
                  {/* No verified-email delivery exists yet, so email changes stay disabled. */}
                  <Button variant="outline" className="h-11" disabled aria-describedby={`owner-email-note-${owner.userId}`}><Mail aria-hidden="true" />Ubah email</Button>
                </div>
                <p id={`owner-email-note-${owner.userId}`} className="flex items-start gap-2 text-xs text-muted-foreground"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Ubah email belum tersedia: membutuhkan verifikasi email ke alamat baru. Password tidak dapat diubah dari panel ini; perubahan password harus melalui alur reset yang aman.</p>
              </li>))}</ul>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><MapPin aria-hidden="true" className="size-5 text-muted-foreground" />Lokasi Parkir <span className="text-sm font-normal text-muted-foreground">({formatCount(tenant.locations.length)})</span></h2>
            <LocationDialog tenantId={tenant.id} />
          </div>
          {tenant.locations.length === 0
            ? <p className="text-sm text-muted-foreground">Belum ada lokasi.</p>
            : <ul className="divide-y">{tenant.locations.map((location) => (
              <li key={location.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-medium break-words">{location.name}</p><LocationStatusBadge status={location.status} /></div>
                  {location.address && <p className="text-sm text-muted-foreground break-words">{location.address}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <LocationDialog tenantId={tenant.id} location={location} />
                  {location.status !== "unknown" && <LocationStatusDialog tenantId={tenant.id} location={{ ...location, status: location.status }} />}
                </div>
              </li>))}</ul>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck aria-hidden="true" className="size-5 text-muted-foreground" />Status Tenant</h2><TenantStatusBadge status={tenant.status} /></div>
          {tenant.status === "unknown"
            ? <p className="text-sm text-muted-foreground">Status tenant tidak dikenal; perubahan status dinonaktifkan sampai data diperiksa.</p>
            : <TenantStatusActions tenantId={tenant.id} status={tenant.status} />}
        </CardContent>
      </Card>
    </div>
  );
}

const statusFilters = [undefined, "active", "suspended", "archived"] as const;
export async function TenantDirectory({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = parseTenantListQuery(await searchParams);
  const result = await platformLoad(() => listPlatformTenants(query));
  if ("denied" in result) return <PlatformNotice denied={result.denied} />;
  const list = result.data;
  const filtered = Boolean(query.q || query.status);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Daftar Tenant</h1>
          <p className="text-sm text-muted-foreground" aria-live="polite">{formatCount(list.total)} tenant{filtered ? " sesuai filter" : ""}</p>
        </div>
        <Button asChild className="h-11"><Link href={PLATFORM_NEW_TENANT_PATH}><Plus aria-hidden="true" />Tambah tenant</Link></Button>
      </div>
      <Card>
        <CardContent className="space-y-5">
          <form action={PLATFORM_TENANTS_PATH} method="get" role="search" className="flex flex-col gap-2 sm:flex-row sm:items-end">
            {query.status && <input type="hidden" name="status" value={query.status} />}
            <div className="flex-1 space-y-2">
              <Label htmlFor="tenant-search">Cari nama usaha</Label>
              <Input id="tenant-search" name="q" type="search" defaultValue={query.q ?? ""} maxLength={100} placeholder="Contoh: Parkir Sentosa" className="h-11" />
            </div>
            <Button type="submit" className="h-11"><Search aria-hidden="true" />Cari</Button>
            {filtered && <Button asChild variant="ghost" className="h-11"><Link href={PLATFORM_TENANTS_PATH}><X aria-hidden="true" />Hapus filter</Link></Button>}
          </form>
          <nav aria-label="Filter status tenant" className="flex flex-wrap gap-2">
            {statusFilters.map((status) => {
              const current = query.status === status;
              return <Button key={status ?? "all"} asChild size="sm" variant={current ? "default" : "outline"} className="h-11 px-4"><Link href={tenantListHref({ q: query.q, status: query.status }, { status, page: 1 })} aria-current={current ? "page" : undefined}>{status ? tenantStatusLabel(status) : "Semua"}</Link></Button>;
            })}
          </nav>
          {list.rows.length === 0
            ? <EmptyState title={filtered ? "Tidak ada tenant yang cocok" : "Belum ada tenant"} description={filtered ? "Ubah kata kunci atau filter status, lalu coba lagi." : "Tenant akan muncul di sini setelah terdaftar di platform."} action={filtered ? <Button asChild variant="outline" className="h-11"><Link href={PLATFORM_TENANTS_PATH}>Hapus filter</Link></Button> : undefined} />
            : <TenantTable rows={list.rows} caption="Daftar tenant" />}
          {list.pageCount > 1 && (
            <nav aria-label="Halaman daftar tenant" className="flex items-center justify-between gap-3">
              {list.page > 1 ? <Button asChild variant="outline" className="h-11"><Link href={tenantListHref(query, { page: list.page - 1 })}>Sebelumnya</Link></Button> : <span />}
              <p className="text-sm text-muted-foreground">Halaman {list.page} dari {list.pageCount}</p>
              {list.page < list.pageCount ? <Button asChild variant="outline" className="h-11"><Link href={tenantListHref(query, { page: list.page + 1 })}>Berikutnya</Link></Button> : <span />}
            </nav>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
