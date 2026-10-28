"use client";
import { useActionState, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, Bike, Car, CircleCheck, List, LoaderCircle, LogIn, Plus } from "lucide-react";
import { toast } from "sonner";
import { recordVehicleEntryAction, type VehicleEntryFormState } from "../../lib/parking-actions";
import { AUTHENTICATED_PATH } from "../../lib/login";
import { displayPlate, vehicleTypeLabels } from "../../lib/plates";
import { formatLocalDateTime } from "../../lib/time";
import { vehicleListHref, vehicleSearchValue } from "../../lib/vehicle-list";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { SlowPendingNotice } from "../slow-pending-notice";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Textarea } from "../ui/textarea";

const PLATE_MAX = 15;
const NOTES_MAX = 500;
const idle: VehicleEntryFormState = { status: "idle" };
const Required = () => <span aria-hidden="true" className="text-destructive">*</span>;
function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="flex items-center gap-1 text-sm text-destructive"><AlertCircle aria-hidden="true" className="size-4 shrink-0" />{message}</p> : null;
}

function Confirmation({ entry, onNext }: { entry: NonNullable<VehicleEntryFormState["entry"]>; onNext: () => void }) {
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <CircleCheck aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-primary" />
        <div className="space-y-1"><h2 className="text-lg font-semibold">Kendaraan tercatat masuk</h2><p className="text-sm text-muted-foreground">Sesi parkir aktif telah disimpan untuk lokasi {entry.locationName}.</p></div>
      </div>
      <dl className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-3">
        <div className="space-y-1"><dt className="text-muted-foreground">Nomor polisi</dt><dd className="font-mono text-base font-semibold">{entry.plateNumber}</dd></div>
        <div className="space-y-1"><dt className="text-muted-foreground">Jenis</dt><dd className="font-medium">{vehicleTypeLabels[entry.vehicleType]}</dd></div>
        <div className="space-y-1"><dt className="text-muted-foreground">Waktu masuk</dt><dd className="font-medium">{formatLocalDateTime(entry.entryAt, entry.timeZone)}</dd></div>
      </dl>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" className="h-12" onClick={onNext}><Plus aria-hidden="true" />Catat kendaraan lain</Button>
        <Button asChild variant="outline" className="h-12"><Link href={AUTHENTICATED_PATH}>Kembali ke Beranda</Link></Button>
      </div>
    </div>
  );
}

function EntryForm({ onRecorded }: { onRecorded: (entry: NonNullable<VehicleEntryFormState["entry"]>) => void }) {
  const submitting = useRef(false);
  const plateRef = useRef<HTMLInputElement>(null);
  const [plate, setPlate] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [notes, setNotes] = useState("");
  const [clientErrors, setClientErrors] = useState<VehicleEntryFormState["fieldErrors"]>({});
  const [state, action, pending] = useActionState(async (previous: VehicleEntryFormState, formData: FormData) => {
    try {
      const next = await recordVehicleEntryAction(previous, formData);
      // One toast per submission, from the action (not from render).
      if (next.status === "success" && next.entry) {
        toast.success(`${next.entry.plateNumber} tercatat masuk.`, { id: "vehicle-entry", description: `${vehicleTypeLabels[next.entry.vehicleType]} · ${formatLocalDateTime(next.entry.entryAt, next.entry.timeZone)}` });
        onRecorded(next.entry);
      } else if (next.status === "error" && next.message) {
        toast.error("Kendaraan belum dicatat.", { id: "vehicle-entry", description: next.message });
      } else if (next.status === "unknown") {
        toast.warning("Status pencatatan belum pasti.", { id: "vehicle-entry", description: "Periksa daftar kendaraan sebelum mencoba lagi." });
      }
      return next;
    } catch {
      // The request may have reached the server and committed: never "not recorded".
      toast.warning("Status pencatatan belum pasti.", { id: "vehicle-entry", description: "Periksa daftar kendaraan sebelum mencoba lagi." });
      return { status: "unknown" as const, message: "Koneksi terputus sebelum server menjawab. Periksa daftar kendaraan sebelum mencoba lagi agar tidak tercatat ganda." };
    } finally { submitting.current = false; }
  }, idle);
  const errors = { ...state.fieldErrors, ...clientErrors };
  const preview = displayPlate(plate);

  function guard(event: FormEvent<HTMLFormElement>) {
    if (submitting.current || pending) { event.preventDefault(); return; }
    const next: VehicleEntryFormState["fieldErrors"] = {};
    if (!preview) next.plateNumber = "Masukkan nomor polisi.";
    if (!vehicleType) next.vehicleType = "Pilih jenis kendaraan.";
    setClientErrors(next);
    if (next.plateNumber || next.vehicleType) { event.preventDefault(); if (next.plateNumber) plateRef.current?.focus(); return; }
    submitting.current = true;
  }
  const typeOption = (value: "motor" | "mobil", icon: ReactNode) => (
    <Label htmlFor={`vehicle-type-${value}`} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-3 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-accent">
      <RadioGroupItem id={`vehicle-type-${value}`} value={value} disabled={pending} />
      {icon}<span className="text-base font-medium">{vehicleTypeLabels[value]}</span>
    </Label>
  );

  return (
    <form action={action} onSubmit={guard} noValidate aria-busy={pending} className="space-y-5">
      <p className="text-sm text-muted-foreground">Kolom bertanda <span aria-hidden="true" className="text-destructive">*</span><span className="sr-only">bintang</span> wajib diisi. Waktu masuk dicatat otomatis oleh server.</p>
      <div className="space-y-2">
        <Label htmlFor="plateNumber">Nomor Polisi<Required /></Label>
        <Input ref={plateRef} id="plateNumber" name="plateNumber" value={plate} onChange={(event) => { setPlate(event.target.value); setClientErrors((current) => ({ ...current, plateNumber: undefined })); }} required maxLength={PLATE_MAX + 10} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="Contoh: B 1234 XYZ" className="h-12 font-mono text-lg uppercase" aria-invalid={Boolean(errors.plateNumber)} aria-describedby={errors.plateNumber ? "plate-error" : "plate-hint"} disabled={pending} />
        {!errors.plateNumber && <p id="plate-hint" className="text-xs text-muted-foreground">{preview ? <>Disimpan sebagai <span className="font-mono font-semibold text-foreground">{preview}</span></> : "Huruf, angka, spasi, atau tanda hubung. Maksimal 15 karakter."}</p>}
        <FieldError id="plate-error" message={errors.plateNumber} />
      </div>
      <fieldset className="space-y-2" aria-describedby={errors.vehicleType ? "type-error" : undefined}>
        <legend className="text-sm font-medium">Jenis Kendaraan<Required /></legend>
        <RadioGroup name="vehicleType" value={vehicleType} onValueChange={(value) => { setVehicleType(value); setClientErrors((current) => ({ ...current, vehicleType: undefined })); }} required aria-invalid={Boolean(errors.vehicleType)} className="grid-cols-2">
          {typeOption("motor", <Bike aria-hidden="true" className="size-5 text-muted-foreground" />)}
          {typeOption("mobil", <Car aria-hidden="true" className="size-5 text-muted-foreground" />)}
        </RadioGroup>
        <FieldError id="type-error" message={errors.vehicleType} />
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor="notes">Catatan (opsional)</Label>
        <Textarea id="notes" name="notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={NOTES_MAX} rows={3} placeholder="Contoh: helm dititipkan" aria-invalid={Boolean(errors.notes)} aria-describedby={errors.notes ? "notes-error" : "notes-count"} disabled={pending} />
        {!errors.notes && <p id="notes-count" className="text-right text-xs text-muted-foreground">{notes.length}/{NOTES_MAX}</p>}
        <FieldError id="notes-error" message={errors.notes} />
      </div>
      {state.status === "unknown" && !pending && (
        <Alert role="alert">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Status pencatatan belum pasti</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{state.message}</p>
            <Button asChild variant="outline" className="h-11"><Link href={vehicleListHref({ q: vehicleSearchValue(preview) })}><List aria-hidden="true" />Periksa daftar kendaraan</Link></Button>
          </AlertDescription>
        </Alert>
      )}
      <p role="status" className="sr-only">{pending ? "Mencatat kendaraan masuk..." : ""}</p>
      <SlowPendingNotice pending={pending} />
      <Button type="submit" className="h-12 w-full sm:w-auto" disabled={pending}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <LogIn aria-hidden="true" />}{pending ? "Mencatat..." : "Catat Kendaraan Masuk"}</Button>
    </form>
  );
}

// Re-mounting the inner form (new key) gives a clean form for the next vehicle.
export function VehicleEntryForm() {
  const [recorded, setRecorded] = useState<NonNullable<VehicleEntryFormState["entry"]> | null>(null);
  const [formKey, setFormKey] = useState(0);
  return (
    <Card className="rounded-2xl">
      <CardContent>
        {recorded
          ? <Confirmation entry={recorded} onNext={() => { setRecorded(null); setFormKey((key) => key + 1); }} />
          : <EntryForm key={formKey} onRecorded={setRecorded} />}
      </CardContent>
    </Card>
  );
}
