import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, Car, Clock, LogIn, LogOut, Wallet, type LucideIcon } from "lucide-react";
import type { LocationParkingOverview } from "../../lib/dal/parking-sessions";
import { AUTHENTICATED_PATH } from "../../lib/login";
import { VEHICLE_EXIT_PATH } from "../../lib/owner-navigation";
import { formatRupiah } from "../../lib/parking-tariff";
import { vehicleEntryHref } from "../../lib/vehicle-list";
import { vehicleTypeLabels } from "../../lib/plates";
import { formatCount } from "../../lib/platform-labels";
import { formatLocalTime } from "../../lib/time";
import type { TenantRole } from "../../types";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";

type KpiValue = { kind: "value"; value: number; format?: "count" | "rupiah"; note?: string } | { kind: "unavailable"; note: string };
function KpiCard({ label, icon: Icon, value }: { label: string; icon: LucideIcon; value: KpiValue }) {
  return (
    <Card className="gap-2 py-5">
      <CardContent className="space-y-2 px-5">
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Icon aria-hidden="true" className="size-4" />{label}</p>
        {value.kind === "value"
          ? <><p className="text-3xl font-semibold tracking-tight tabular-nums">{value.format === "rupiah" ? formatRupiah(value.value) : formatCount(value.value)}</p>{value.note && <p className="text-xs text-muted-foreground">{value.note}</p>}</>
          : <><p className="text-3xl font-semibold tracking-tight text-muted-foreground" aria-label={`${label}: belum tersedia`}>—</p><p className="text-xs text-muted-foreground">{value.note}</p></>}
      </CardContent>
    </Card>
  );
}
const statusLabels = { active: "Parkir", completed: "Selesai", canceled: "Dibatalkan" } as const;

// Real data only, from the location-scoped repository: exits are completed
// sessions by exitAt; revenue is completed payments by paymentAt (never active
// sessions). `overview === null` means it could not be loaded.
export function OwnerDashboard({ locationName, role, overview }: { locationName: string; role: TenantRole; overview: LocationParkingOverview | null }) {
  const unavailable = (note: string): KpiValue => ({ kind: "unavailable", note });
  const loadFailed = unavailable("Tidak dapat dimuat");
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Beranda</h1>
        <p className="text-sm text-muted-foreground">Ringkasan operasional <span className="font-medium text-foreground">{locationName}</span> hari ini.</p>
      </div>
      <section aria-labelledby="quick-actions-title" className="space-y-3">
        <h2 id="quick-actions-title" className="text-lg font-semibold">Aksi Cepat</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {role === "owner"
            ? <Link href={vehicleEntryHref(AUTHENTICATED_PATH)} className="group flex min-h-24 items-center gap-4 rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><LogIn aria-hidden="true" className="size-6" /></span>
                <span className="min-w-0"><span className="block text-base font-semibold">Kendaraan Masuk</span><span className="block text-sm text-muted-foreground">Catat kendaraan yang baru masuk ke lokasi ini.</span></span>
              </Link>
            : <div aria-disabled="true" className="flex min-h-24 items-center gap-4 rounded-xl border bg-card p-5 opacity-70">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted"><LogIn aria-hidden="true" className="size-6 text-muted-foreground" /></span>
                <span className="min-w-0"><span className="block text-base font-semibold">Kendaraan Masuk</span><span className="block text-sm text-muted-foreground">Saat ini hanya untuk Owner.</span></span>
              </div>}
          {role === "owner"
            ? <Link href={VEHICLE_EXIT_PATH} className="group flex min-h-24 items-center gap-4 rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><LogOut aria-hidden="true" className="size-6" /></span>
                <span className="min-w-0"><span className="block text-base font-semibold">Kendaraan Keluar</span><span className="block text-sm text-muted-foreground">Cari kendaraan aktif, terima pembayaran tunai, lalu selesaikan parkir.</span></span>
              </Link>
            : <div aria-disabled="true" className="flex min-h-24 items-center gap-4 rounded-xl border bg-card p-5 opacity-70">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted"><LogOut aria-hidden="true" className="size-6 text-muted-foreground" /></span>
                <span className="min-w-0"><span className="block text-base font-semibold">Kendaraan Keluar</span><span className="block text-sm text-muted-foreground">Saat ini hanya untuk Owner.</span></span>
              </div>}
        </div>
      </section>
      <section aria-label="Ringkasan hari ini" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Parkir Aktif" icon={Car} value={overview ? { kind: "value", value: overview.activeCount } : loadFailed} />
        <KpiCard label="Kendaraan Masuk Hari Ini" icon={ArrowDownToLine} value={overview ? { kind: "value", value: overview.entriesToday } : loadFailed} />
        <KpiCard label="Kendaraan Keluar Hari Ini" icon={ArrowUpFromLine} value={overview ? { kind: "value", value: overview.exitsToday } : loadFailed} />
        <KpiCard label="Pendapatan Hari Ini" icon={Wallet} value={overview ? { kind: "value", value: overview.revenueToday, format: "rupiah", note: "Pembayaran tunai selesai hari ini" } : loadFailed} />
      </section>
      <Card>
          <CardContent className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Clock aria-hidden="true" className="size-5 text-muted-foreground" />Aktivitas Terbaru</h2>
            {!overview
              ? <p className="text-sm text-muted-foreground">Aktivitas tidak dapat dimuat. Muat ulang halaman sebentar lagi.</p>
              : overview.recent.length === 0
                ? <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center"><p className="font-medium">Belum ada aktivitas</p><p className="max-w-sm text-sm text-muted-foreground">Kendaraan yang dicatat masuk di lokasi ini akan muncul di sini.</p></div>
                : <ul className="divide-y">{overview.recent.map((item) => (
                  <li key={`${item.plateNumber}-${item.entryAt}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0"><p className="font-mono font-semibold">{item.plateNumber}</p><p className="text-sm text-muted-foreground">{vehicleTypeLabels[item.vehicleType]} · masuk {formatLocalTime(item.entryAt, overview.timeZone)}</p></div>
                    <Badge variant={item.status === "active" ? "default" : "outline"}>{statusLabels[item.status]}</Badge>
                  </li>))}</ul>}
          </CardContent>
        </Card>
    </div>
  );
}
