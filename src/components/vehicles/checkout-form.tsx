"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Banknote, LoaderCircle, LogOut, Moon, RefreshCw, Sun } from "lucide-react";
import type { CheckoutQuote, CheckoutReceipt } from "../../lib/dal/parking-checkout";
import { confirmCheckoutAction } from "../../lib/parking-actions";
import { calculateCharge, formatRupiah, maxNightCount } from "../../lib/parking-tariff";
import { vehicleTypeLabels } from "../../lib/plates";
import { SlowPendingNotice } from "../slow-pending-notice";
import { formatDuration, formatLocalDateTime } from "../../lib/time";
import { VEHICLE_EXIT_PATH } from "../../lib/owner-navigation";
import { CheckoutReceiptDetails, tariffBreakdown } from "./checkout-receipt";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "../ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";

const rateSourceLabel = { location: "Tarif lokasi", default: "Tarif default" } as const;
type TariffChoice = "regular" | "overnight";

// The total shown here is a display of the same pure rule the server uses; the
// server recomputes it at confirmation and refuses if it differs (no silent
// change of the amount the Owner collected). One idempotency key per screen:
// double-clicks and retries of this checkout replay instead of paying twice.
export function CheckoutForm({ quote, backHref }: { quote: CheckoutQuote; backHref: string }) {
  const router = useRouter();
  const [tariffType, setTariffType] = useState<TariffChoice>(quote.suggestion.tariffType);
  const [nightsText, setNightsText] = useState(String(quote.suggestion.nightCount));
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; unknown: boolean; refresh: boolean } | null>(null);
  const [receipt, setReceipt] = useState<CheckoutReceipt | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const inFlight = useRef(false);

  const nightCount = /^\d{1,3}$/.test(nightsText.trim()) ? Number(nightsText.trim()) : Number.NaN;
  const charge = calculateCharge(quote.rates, tariffType, tariffType === "overnight" ? nightCount : undefined);
  const nightsError = tariffType === "overnight" && !charge.ok ? `Jumlah malam harus bilangan bulat 1–${maxNightCount}.` : null;
  const durationMs = new Date(quote.quotedAt).getTime() - new Date(quote.entryAt).getTime();

  async function confirm() {
    if (inFlight.current || !charge.ok) return;
    inFlight.current = true; setPending(true); setError(null);
    try {
      const result = await confirmCheckoutAction({ sessionId: quote.sessionId, tariffType, ...(tariffType === "overnight" ? { nightCount } : {}), expectedTotal: charge.totalAmount, idempotencyKey });
      if (result.status === "success" && result.receipt) {
        setReceipt(result.receipt); setOpen(false);
        toast.success(`${result.receipt.plateNumber} keluar · ${formatRupiah(result.receipt.totalAmount)}`, { id: "vehicle-checkout", description: "Pembayaran tunai tercatat." });
        return;
      }
      const message = result.message ?? "Proses keluar belum berhasil.";
      setError({ message, unknown: result.status === "unknown", refresh: Boolean(result.refresh) });
      if (result.refresh) { setOpen(false); router.refresh(); }
    } catch {
      setError({ message: "Tidak dapat terhubung. Status pembayaran belum dapat dipastikan — periksa status transaksi sebelum mencoba lagi.", unknown: true, refresh: false });
    } finally { inFlight.current = false; setPending(false); }
  }

  if (receipt) {
    return (
      <Card className="rounded-2xl"><CardContent className="space-y-5" role="status" aria-live="polite">
        <CheckoutReceiptDetails receipt={receipt} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="h-12"><Link href={VEHICLE_EXIT_PATH}><LogOut aria-hidden="true" />Proses kendaraan lain</Link></Button>
          <Button asChild variant="outline" className="h-12"><Link href={backHref}>Kembali</Link></Button>
        </div>
      </CardContent></Card>
    );
  }

  const option = (value: TariffChoice, icon: ReactNode, title: string, detail: string) => (
    <Label htmlFor={`tariff-${value}`} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-3 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-accent">
      <RadioGroupItem id={`tariff-${value}`} value={value} disabled={pending} />
      {icon}<span className="min-w-0"><span className="block text-base font-medium">{title}</span><span className="block text-xs font-normal text-muted-foreground">{detail}</span></span>
    </Label>
  );
  const suggestionText = quote.nights > 0
    ? `Saran sistem: Menginap ${quote.nights} malam (melewati jam tutup ${quote.policy.closeTime.replace(":", ".")}).`
    : `Saran sistem: Reguler (belum melewati jam tutup ${quote.policy.closeTime.replace(":", ".")}).`;

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl"><CardContent>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="space-y-1"><dt className="text-muted-foreground">Nomor polisi</dt><dd className="font-mono text-xl font-semibold">{quote.plateNumber}</dd></div>
          <div className="space-y-1"><dt className="text-muted-foreground">Jenis</dt><dd className="font-medium">{vehicleTypeLabels[quote.vehicleType]}</dd></div>
          <div className="space-y-1"><dt className="text-muted-foreground">Lokasi</dt><dd className="font-medium">{quote.locationName}</dd></div>
          <div className="space-y-1"><dt className="text-muted-foreground">Waktu masuk</dt><dd className="font-medium">{formatLocalDateTime(quote.entryAt, quote.timeZone)}</dd></div>
          <div className="space-y-1"><dt className="text-muted-foreground">Durasi (saat dibuka)</dt><dd className="font-medium">{formatDuration(durationMs)}</dd></div>
          <div className="space-y-1"><dt className="text-muted-foreground">Malam terlewati</dt><dd className="font-medium">{quote.nights} malam</dd></div>
        </dl>
      </CardContent></Card>
      <Card className="rounded-2xl"><CardContent className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Pilih tarif<span aria-hidden="true" className="text-destructive"> *</span></legend>
          <p className="text-xs text-muted-foreground">{suggestionText} Jam operasional {quote.policy.openTime.replace(":", ".")}–{quote.policy.closeTime.replace(":", ".")} ({quote.policy.source === "location" ? "jam lokasi" : "jam default"}). Menginap menggantikan tarif reguler.</p>
          <RadioGroup value={tariffType} onValueChange={(value) => { setTariffType(value as TariffChoice); setError(null); }} className="grid gap-2 sm:grid-cols-2">
            {option("regular", <Sun aria-hidden="true" className="size-5 text-muted-foreground" />, "Reguler", `${formatRupiah(quote.rates.regular.amount)} · ${rateSourceLabel[quote.rates.regular.source]}`)}
            {option("overnight", <Moon aria-hidden="true" className="size-5 text-muted-foreground" />, "Menginap", `${formatRupiah(quote.rates.overnight.amount)}/malam · ${rateSourceLabel[quote.rates.overnight.source]}`)}
          </RadioGroup>
        </fieldset>
        {tariffType === "overnight" && (
          <div className="space-y-2">
            <Label htmlFor="night-count">Jumlah malam<span aria-hidden="true" className="text-destructive"> *</span></Label>
            <Input id="night-count" inputMode="numeric" value={nightsText} onChange={(event) => { setNightsText(event.target.value); setError(null); }} disabled={pending} className="h-12 w-32 text-lg tabular-nums" aria-invalid={Boolean(nightsError)} aria-describedby={nightsError ? "night-error" : "night-hint"} />
            {nightsError ? <p id="night-error" role="alert" className="text-sm text-destructive">{nightsError}</p> : <p id="night-hint" className="text-xs text-muted-foreground">Bilangan bulat positif. Saran sistem: {Math.max(quote.nights, 1)} malam.</p>}
          </div>
        )}
        <div className="space-y-1 rounded-lg border bg-muted/40 p-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Banknote aria-hidden="true" className="size-4" />Metode pembayaran: <span className="font-medium text-foreground">Tunai</span></p>
          <p className="text-sm text-muted-foreground">{charge.ok ? tariffBreakdown(charge.tariffType, charge.amountPerUnit, charge.nightCount) : "Lengkapi pilihan tarif."}</p>
          <p className="text-sm text-muted-foreground">Total yang harus dibayar</p>
          <p className="text-3xl font-semibold tracking-tight tabular-nums" aria-live="polite">{charge.ok ? formatRupiah(charge.totalAmount) : "—"}</p>
        </div>
        {error && (
          <Alert variant={error.unknown ? "default" : "destructive"} role="alert">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>{error.unknown ? "Status pembayaran belum pasti" : "Proses keluar belum berhasil"}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{error.message}</p>
              {error.unknown && <Button type="button" variant="outline" className="h-11" onClick={() => router.refresh()}><RefreshCw aria-hidden="true" />Periksa status transaksi</Button>}
            </AlertDescription>
          </Alert>
        )}
        <AlertDialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
          <AlertDialogTrigger asChild>
            <Button type="button" className="h-12 w-full sm:w-auto" disabled={!charge.ok || pending}><LogOut aria-hidden="true" />Konfirmasi Pembayaran & Keluar</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Konfirmasi pembayaran tunai</AlertDialogTitle>
              <AlertDialogDescription>Pastikan uang tunai <span className="font-semibold text-foreground">{charge.ok ? formatRupiah(charge.totalAmount) : "—"}</span> untuk {quote.plateNumber} sudah diterima. Setelah dikonfirmasi, sesi parkir selesai dan tidak dapat diproses ulang.</AlertDialogDescription>
            </AlertDialogHeader>
            {error && open && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
            <p role="status" className="sr-only">{pending ? "Menyimpan pembayaran..." : ""}</p>
            <SlowPendingNotice pending={pending} />
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11" disabled={pending}>Batal</AlertDialogCancel>
              {/* A plain button (not AlertDialogAction) keeps the dialog open while the server works. */}
              <Button type="button" className="h-11" disabled={pending || !charge.ok} onClick={confirm}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Banknote aria-hidden="true" />}{pending ? "Menyimpan..." : "Uang Diterima, Konfirmasi"}</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <p className="text-xs text-muted-foreground"><Badge variant="outline" className="mr-1">Tunai</Badge>Terima uang tunai terlebih dahulu. Pembayaran dianggap berhasil hanya setelah server mengonfirmasi.</p>
      </CardContent></Card>
    </div>
  );
}
