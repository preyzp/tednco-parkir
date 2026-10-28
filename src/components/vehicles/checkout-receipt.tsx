import { CircleCheck } from "lucide-react";
import type { CheckoutReceipt } from "../../lib/dal/parking-checkout";
import { formatRupiah } from "../../lib/parking-tariff";
import { vehicleTypeLabels } from "../../lib/plates";
import { formatDuration, formatLocalDateTime } from "../../lib/time";

export const tariffLabels = { regular: "Reguler", overnight: "Menginap" } as const;
export function tariffBreakdown(tariffType: "regular" | "overnight", amountPerUnit: number, nightCount?: number): string {
  return tariffType === "overnight" && nightCount ? `${nightCount} malam × ${formatRupiah(amountPerUnit)}` : `Tarif reguler ${formatRupiah(amountPerUnit)}`;
}

// Server-confirmed payment only (never rendered before the server commits).
export function CheckoutReceiptDetails({ receipt, title = "Pembayaran tercatat" }: { receipt: CheckoutReceipt; title?: string }) {
  const rows: [string, string][] = [
    ["Nomor polisi", receipt.plateNumber],
    ["Jenis", vehicleTypeLabels[receipt.vehicleType]],
    ["Lokasi", receipt.locationName],
    ["Waktu masuk", formatLocalDateTime(receipt.entryAt, receipt.timeZone)],
    ["Waktu keluar", formatLocalDateTime(receipt.exitAt, receipt.timeZone)],
    ["Durasi", formatDuration(new Date(receipt.exitAt).getTime() - new Date(receipt.entryAt).getTime())],
    ["Tarif", `${tariffLabels[receipt.tariffType]} · ${tariffBreakdown(receipt.tariffType, receipt.amountPerUnit, receipt.nightCount)}`],
    ["Metode", "Tunai"],
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <CircleCheck aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-primary" />
        <div className="space-y-1"><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm text-muted-foreground">Sesi parkir selesai. Kendaraan berstatus Sudah Keluar.</p></div>
      </div>
      <dl className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => <div key={label} className="space-y-1"><dt className="text-muted-foreground">{label}</dt><dd className={label === "Nomor polisi" ? "font-mono text-base font-semibold" : "font-medium"}>{value}</dd></div>)}
        <div className="space-y-1 sm:col-span-2"><dt className="text-muted-foreground">Total dibayar</dt><dd className="text-2xl font-semibold tabular-nums">{formatRupiah(receipt.totalAmount)}</dd></div>
      </dl>
    </div>
  );
}
