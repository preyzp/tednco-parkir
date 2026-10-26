"use client";
import { useActionState, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, Building2, Eye, EyeOff, KeyRound, LoaderCircle, MapPin, UserRound } from "lucide-react";
import { createTenantAction, type CreateTenantFormState } from "../../lib/platform-actions";
import { PLATFORM_TENANTS_PATH, suggestSlug, tenantTimezoneLabels, tenantTimezones } from "../../lib/platform-labels";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

const initialState: CreateTenantFormState = { status: "idle" };
type TextField = "tenantName" | "slug" | "locationName" | "locationAddress" | "ownerName" | "ownerEmail";

// The visual asterisk is aria-hidden: the input's native `required` already
// announces "wajib" to assistive technology.
function Field({ id, label, error, hint, required = false, children }: { id: string; label: string; error?: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}{required && <span aria-hidden="true" className="text-destructive">*</span>}</Label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} className="flex items-center gap-1 text-sm text-destructive"><AlertCircle aria-hidden="true" className="size-4 shrink-0" />{error}</p>}
    </div>
  );
}
function PasswordInput({ id, describedBy, invalid, disabled, minLength }: { id: string; describedBy?: string; invalid: boolean; disabled: boolean; minLength?: number }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input id={id} name={id} type={visible ? "text" : "password"} required minLength={minLength} maxLength={128} autoComplete="new-password" aria-invalid={invalid} aria-describedby={describedBy} className="h-11 pr-12" disabled={disabled} />
      <Button type="button" variant="ghost" size="icon" className="absolute top-0 right-0 size-11" disabled={disabled} aria-controls={id} aria-label={visible ? "Sembunyikan password" : "Tampilkan password"} aria-pressed={visible} onClick={() => setVisible(!visible)}>
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  );
}
function Section({ title, icon: Icon, children }: { title: string; icon: typeof Building2; children: ReactNode }) {
  return <fieldset className="space-y-4 rounded-lg border p-4"><legend className="flex items-center gap-2 px-1 font-medium"><Icon aria-hidden="true" className="size-4 text-muted-foreground" />{title}</legend>{children}</fieldset>;
}

// Server Action does all authorization/validation/uniqueness checks; this form
// only prevents duplicate submits and keeps non-secret input after an error.
export function CreateTenantForm() {
  const submitting = useRef(false);
  const [state, action, pending] = useActionState(async (previous: CreateTenantFormState, formData: FormData) => {
    try { return await createTenantAction(previous, formData); }
    finally { submitting.current = false; }
  }, initialState);
  const [values, setValues] = useState<Record<TextField, string>>({ tenantName: "", slug: "", locationName: "", locationAddress: "", ownerName: "", ownerEmail: "" });
  const [slugEdited, setSlugEdited] = useState(false);
  const [timezone, setTimezone] = useState<string>(tenantTimezones[0]);
  const errors = state.fieldErrors ?? {};

  const set = (field: TextField) => (event: { target: { value: string } }) => {
    const value = event.target.value;
    setValues((current) => ({ ...current, [field]: value, ...(field === "tenantName" && !slugEdited ? { slug: suggestSlug(value) } : {}) }));
  };
  const describe = (field: string, hint?: boolean) => (errors[field] ? `${field}-error` : hint ? `${field}-hint` : undefined);
  const input = (field: TextField, extra: React.ComponentProps<typeof Input> = {}) => (
    <Input id={field} name={field} value={values[field]} onChange={field === "slug" ? (event) => { setSlugEdited(true); set("slug")(event); } : set(field)} aria-invalid={Boolean(errors[field])} aria-describedby={describe(field, field === "slug")} className="h-11" disabled={pending} {...extra} />
  );
  // Blocks a second submit in the window before `pending` re-renders the button.
  function guard(event: FormEvent<HTMLFormElement>) {
    if (submitting.current || pending) { event.preventDefault(); return; }
    submitting.current = true;
  }

  return (
    <form action={action} onSubmit={guard} aria-busy={pending} noValidate className="space-y-6">
      {state.status === "error" && state.message && (
        <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>Tenant belum dibuat</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert>
      )}
      <p className="text-sm text-muted-foreground">Kolom bertanda <span aria-hidden="true" className="text-destructive">*</span><span className="sr-only">bintang</span> wajib diisi.</p>
      <Section title="Data usaha" icon={Building2}>
        <Field id="tenantName" label="Nama usaha" required error={errors.tenantName}>{input("tenantName", { required: true, maxLength: 100, autoComplete: "organization" })}</Field>
        <Field id="slug" label="Slug unik" required error={errors.slug} hint="Huruf kecil, angka, dan tanda hubung. Contoh: parkir-sentosa.">{input("slug", { required: true, maxLength: 50, autoCapitalize: "none", spellCheck: false })}</Field>
        <Field id="timezone" label="Zona waktu" required error={errors.timezone}>
          <Select name="timezone" value={timezone} onValueChange={setTimezone} disabled={pending}>
            <SelectTrigger id="timezone" className="h-11 w-full" aria-invalid={Boolean(errors.timezone)} aria-describedby={describe("timezone")}><SelectValue /></SelectTrigger>
            <SelectContent>{tenantTimezones.map((zone) => <SelectItem key={zone} value={zone}>{tenantTimezoneLabels[zone]}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </Section>
      <Section title="Lokasi parkir pertama" icon={MapPin}>
        <Field id="locationName" label="Nama lokasi" required error={errors.locationName}>{input("locationName", { required: true, maxLength: 100 })}</Field>
        <Field id="locationAddress" label="Alamat (opsional)" error={errors.locationAddress}>{input("locationAddress", { maxLength: 200, autoComplete: "street-address" })}</Field>
      </Section>
      <Section title="Akun Owner" icon={UserRound}>
        <Field id="ownerName" label="Nama Owner" required error={errors.ownerName}>{input("ownerName", { required: true, maxLength: 100, autoComplete: "off" })}</Field>
        <Field id="ownerEmail" label="Email Owner" required error={errors.ownerEmail}>{input("ownerEmail", { type: "email", required: true, maxLength: 254, autoComplete: "off", autoCapitalize: "none", spellCheck: false })}</Field>
        <Field id="ownerPassword" label="Password awal" required error={errors.ownerPassword} hint="12–128 karakter. Hanya disimpan dalam bentuk hash dan tidak dapat dilihat kembali.">
          <PasswordInput id="ownerPassword" minLength={12} invalid={Boolean(errors.ownerPassword)} describedBy={describe("ownerPassword", true)} disabled={pending} />
        </Field>
        <Field id="ownerPasswordConfirm" label="Konfirmasi password awal" required error={errors.ownerPasswordConfirm}>
          <PasswordInput id="ownerPasswordConfirm" invalid={Boolean(errors.ownerPasswordConfirm)} describedBy={describe("ownerPasswordConfirm")} disabled={pending} />
        </Field>
        <p className="flex items-start gap-2 text-xs text-muted-foreground"><KeyRound aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Sampaikan password awal kepada Owner melalui saluran yang aman. Email yang sudah terdaftar akan ditolak; akun yang ada tidak diubah.</p>
      </Section>
      <p role="status" className="sr-only">{pending ? "Membuat tenant dan akun Owner..." : ""}</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="outline" className="h-12"><Link href={PLATFORM_TENANTS_PATH}>Batal</Link></Button>
        <Button type="submit" disabled={pending} className="h-12">{pending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Building2 aria-hidden="true" />}{pending ? "Membuat tenant..." : "Buat tenant"}</Button>
      </div>
    </form>
  );
}
