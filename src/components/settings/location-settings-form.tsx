"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Bike, Car, Clock, LoaderCircle, RefreshCw, Save } from "lucide-react";
import type { LocationSettingsView } from "../../lib/dal/location-settings";
import { caretAfterFormat, formatIdr, formatIdrInput, formatRupiah, parseIdrInput } from "../../lib/money";
import { tariffAmountMax, tariffAmountMin } from "../../lib/parking-tariff";
import { saveLocationSettingsAction } from "../../lib/settings-actions";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "../ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

type VehicleKey = "motor" | "mobil";
type TariffKey = "regular" | "overnight";
type FieldKey = `tariffs.${VehicleKey}.${TariffKey}` | "operatingHours.openTime" | "operatingHours.closeTime";
const vehicles = [{ key: "motor" as const, label: "Motor", icon: Bike }, { key: "mobil" as const, label: "Mobil", icon: Car }];
const tariffs = [{ key: "regular" as const, label: "Reguler", unit: "" }, { key: "overnight" as const, label: "Menginap", unit: " per malam" }];

type Values = { amounts: Record<FieldKey & `tariffs.${string}`, string>; openTime: string; closeTime: string };
function valuesOf(settings: LocationSettingsView): Values {
  const amounts = {} as Values["amounts"];
  for (const vehicle of vehicles) for (const tariff of tariffs) amounts[`tariffs.${vehicle.key}.${tariff.key}`] = formatIdr(settings.tariffs[vehicle.key][tariff.key].amount);
  return { amounts, openTime: settings.operatingHours.openTime, closeTime: settings.operatingHours.closeTime };
}
// Shown as "10.000.000", sent as the number 10000000. Display-side check only:
// the server schema stays authoritative.
function parseAmount(text: string): number | null {
  const value = parseIdrInput(text);
  return value !== null && value >= tariffAmountMin && value <= tariffAmountMax ? value : null;
}
const amountError = "Nominal harus bilangan bulat Rp1–Rp10.000.000.";

type Failure = { kind: "conflict" | "unknown" | "error"; message: string };

// Saves through the Tahap B server action (location = server-validated active
// workspace). Success is shown only after the server confirms; the form then
// shows the saved values. One request at a time.
export function LocationSettingsForm({ settings: initial }: { settings: LocationSettingsView }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [values, setValues] = useState(() => valuesOf(initial));
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inFlight = useRef(false);

  const saved = valuesOf(settings);
  const changed = JSON.stringify(values) !== JSON.stringify(saved);
  const unconfigured = settings.revision === 0;
  const clientErrors: Partial<Record<FieldKey, string>> = {};
  for (const key of Object.keys(values.amounts) as (keyof Values["amounts"])[]) if (parseAmount(values.amounts[key]) === null) clientErrors[key] = amountError;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.openTime)) clientErrors["operatingHours.openTime"] = "Masukkan jam buka.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.closeTime)) clientErrors["operatingHours.closeTime"] = "Masukkan jam tutup.";
  else if (values.openTime === values.closeTime) clientErrors["operatingHours.closeTime"] = "Jam tutup harus berbeda dari jam buka.";
  const errors = { ...serverErrors, ...clientErrors };
  const valid = Object.keys(clientErrors).length === 0;
  // Saving the shown defaults the first time is allowed (stores them explicitly).
  const canSave = valid && !pending && (changed || unconfigured);

  function update(change: (current: Values) => Values) { setValues(change); setServerErrors({}); setFailure(null); }
  // Regroups thousands while typing and keeps the caret after the same digit.
  function changeAmount(id: keyof Values["amounts"], event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const paste = (event.nativeEvent as InputEvent | undefined)?.inputType === "insertFromPaste";
    const next = formatIdrInput(input.value, { paste });
    const caret = caretAfterFormat(input.value, input.selectionStart ?? input.value.length, next);
    update((current) => ({ ...current, amounts: { ...current.amounts, [id]: next } }));
    if (next !== input.value) requestAnimationFrame(() => { if (document.activeElement === input) input.setSelectionRange(caret, caret); });
  }

  async function save() {
    if (inFlight.current || !valid) return;
    inFlight.current = true; setPending(true); setFailure(null); setServerErrors({});
    const amount = (vehicle: VehicleKey, tariff: TariffKey) => parseAmount(values.amounts[`tariffs.${vehicle}.${tariff}`]);
    try {
      const result = await saveLocationSettingsAction({
        tariffs: { motor: { regular: amount("motor", "regular"), overnight: amount("motor", "overnight") }, mobil: { regular: amount("mobil", "regular"), overnight: amount("mobil", "overnight") } },
        operatingHours: { openTime: values.openTime, closeTime: values.closeTime },
        expectedRevision: settings.revision,
      });
      if (result.status === "success" && result.settings) {
        setSettings(result.settings); setValues(valuesOf(result.settings)); setConfirmOpen(false);
        toast.success("Pengaturan tersimpan.", { id: "location-settings", description: `Berlaku untuk checkout berikutnya di ${result.settings.locationName}.` });
        return;
      }
      setConfirmOpen(false);
      if (result.status === "error" && result.fieldErrors) setServerErrors(result.fieldErrors as Partial<Record<FieldKey, string>>);
      setFailure({ kind: result.status === "conflict" ? "conflict" : result.status === "unknown" ? "unknown" : "error", message: result.message ?? "Pengaturan belum tersimpan." });
    } catch {
      setConfirmOpen(false);
      setFailure({ kind: "unknown", message: "Permintaan tidak dapat diproses atau koneksi terputus. Muat ulang halaman untuk melihat pengaturan terbaru sebelum mencoba lagi." });
    } finally { inFlight.current = false; setPending(false); }
  }
  function submit() {
    if (!canSave) return;
    if (settings.activeVehicleCount > 0 && changed) { setConfirmOpen(true); return; }
    void save();
  }

  const sourceBadge = (source: "location" | "default") => source === "default" ? <Badge variant="outline">Default</Badge> : null;
  const fieldError = (key: FieldKey) => errors[key] ? <p id={`${key}-error`} role="alert" className="text-sm text-destructive">{errors[key]}</p> : null;

  return (
    <form noValidate aria-busy={pending} onSubmit={(event) => { event.preventDefault(); submit(); }} className="space-y-4">
      {unconfigured && (
        <Alert><Clock aria-hidden="true" /><AlertTitle>Belum diatur — memakai default</AlertTitle><AlertDescription>Lokasi ini belum memiliki pengaturan sendiri. Nilai di bawah adalah default yang saat ini berlaku. Simpan untuk menetapkannya sebagai pengaturan lokasi.</AlertDescription></Alert>
      )}
      {settings.activeVehicleCount > 0 && (
        <Alert><AlertTriangle aria-hidden="true" /><AlertTitle>{settings.activeVehicleCount} kendaraan sedang parkir</AlertTitle><AlertDescription>Perubahan tarif dan jam tutup berlaku untuk checkout berikutnya, termasuk kendaraan yang sudah masuk, dan dapat mengubah rekomendasi jumlah malam serta biaya. Transaksi yang sudah selesai tidak berubah.</AlertDescription></Alert>
      )}
      {!settings.tariffsConsistent && (
        <Alert variant="destructive"><AlertTriangle aria-hidden="true" /><AlertTitle>Tarif tersimpan tidak konsisten</AlertTitle><AlertDescription>Ada tarif ganda atau tidak valid untuk lokasi ini. Periksa nilai di bawah lalu simpan untuk memperbaikinya.</AlertDescription></Alert>
      )}
      <Card className="rounded-2xl"><CardContent className="space-y-4">
        <div className="space-y-1"><h2 className="text-lg font-semibold">Tarif parkir</h2><p className="text-sm text-muted-foreground">Menginap menggantikan tarif Reguler (tidak ditambahkan): total = tarif per malam × jumlah malam.</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          {vehicles.map(({ key: vehicle, label: vehicleLabel, icon: Icon }) => (
            <fieldset key={vehicle} className="space-y-3 rounded-lg border p-4">
              <legend className="flex items-center gap-2 px-1 text-base font-medium"><Icon aria-hidden="true" className="size-5 text-muted-foreground" />{vehicleLabel}</legend>
              {tariffs.map(({ key: tariff, label, unit }) => {
                const id = `tariffs.${vehicle}.${tariff}` as const;
                const parsed = parseAmount(values.amounts[id]);
                return (
                  <div key={tariff} className="space-y-1.5">
                    <Label htmlFor={id} className="flex items-center gap-2">{vehicleLabel} {label}{unit}{sourceBadge(settings.tariffs[vehicle][tariff].source)}</Label>
                    <div className="relative">
                      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">Rp</span>
                      <Input id={id} inputMode="numeric" autoComplete="off" value={values.amounts[id]} disabled={pending} onChange={(event) => changeAmount(id, event)} className="h-11 pl-10 tabular-nums" aria-invalid={Boolean(errors[id])} aria-describedby={errors[id] ? `${id}-error` : `${id}-hint`} />
                    </div>
                    {errors[id] ? fieldError(id) : <p id={`${id}-hint`} className="text-xs text-muted-foreground">{parsed !== null ? `${formatRupiah(parsed)}${unit}` : " "}</p>}
                  </div>
                );
              })}
            </fieldset>
          ))}
        </div>
      </CardContent></Card>
      <Card className="rounded-2xl"><CardContent className="space-y-4">
        <div className="space-y-1"><h2 className="flex items-center gap-2 text-lg font-semibold">Jam operasional{sourceBadge(settings.operatingHours.source)}</h2><p className="text-sm text-muted-foreground">Setiap jam tutup yang dilewati kendaraan dihitung satu malam untuk rekomendasi Menginap. Keluar tepat pada jam tutup belum dihitung. Owner tetap memilih tarif saat checkout.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          {([["operatingHours.openTime", "Jam buka", "openTime"], ["operatingHours.closeTime", "Jam tutup", "closeTime"]] as const).map(([id, label, field]) => (
            <div key={id} className="space-y-1.5">
              <Label htmlFor={id}>{label}</Label>
              <Input id={id} type="time" step={60} value={values[field]} disabled={pending} onChange={(event) => { const next = event.target.value; update((current) => ({ ...current, [field]: next })); }} className="h-11 w-full sm:w-40" aria-invalid={Boolean(errors[id])} aria-describedby={errors[id] ? `${id}-error` : undefined} />
              {fieldError(id)}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Jam tutup boleh melewati tengah malam (contoh buka 18.00, tutup 02.00). Jam buka dan tutup tidak boleh sama.</p>
      </CardContent></Card>
      {failure && (
        <Alert variant={failure.kind === "error" ? "destructive" : "default"} role="alert">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>{failure.kind === "conflict" ? "Pengaturan sudah berubah" : failure.kind === "unknown" ? "Status penyimpanan belum pasti" : "Pengaturan belum tersimpan"}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{failure.message}</p>
            {failure.kind !== "error" && <Button type="button" variant="outline" className="h-11" onClick={() => router.refresh()}><RefreshCw aria-hidden="true" />Muat ulang pengaturan</Button>}
          </AlertDescription>
        </Alert>
      )}
      <p role="status" className="sr-only">{pending ? "Menyimpan pengaturan..." : ""}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" className="h-12 w-full sm:w-auto" disabled={!canSave}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" />}{pending ? "Menyimpan..." : "Simpan Pengaturan"}</Button>
        {!changed && !unconfigured && <p className="text-sm text-muted-foreground">Tidak ada perubahan.</p>}
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={(next) => { if (!pending) setConfirmOpen(next); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Simpan perubahan?</AlertDialogTitle>
            <AlertDialogDescription>Ada {settings.activeVehicleCount} kendaraan sedang parkir di {settings.locationName}. Tarif dan jam baru akan berlaku saat kendaraan tersebut checkout, termasuk rekomendasi jumlah malam dan biayanya.</AlertDialogDescription>
          </AlertDialogHeader>
          <p role="status" className="sr-only">{pending ? "Menyimpan pengaturan..." : ""}</p>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11" disabled={pending}>Batal</AlertDialogCancel>
            {/* A plain button (not AlertDialogAction) keeps the dialog open while the server works. */}
            <Button type="button" className="h-11" disabled={pending} onClick={() => void save()}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" />}{pending ? "Menyimpan..." : "Ya, Simpan"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
