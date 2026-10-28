"use client";
import { useRef, useState, type FormEvent } from "react";
import { AlertCircle, Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { changeOwnerPassword } from "../../lib/auth-client";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, changePasswordSchema } from "../../lib/login";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

type Field = "currentPassword" | "newPassword" | "confirmPassword";
const labels: Record<Field, string> = { currentPassword: "Password saat ini", newPassword: "Password baru", confirmPassword: "Konfirmasi password baru" };
const autoComplete: Record<Field, string> = { currentPassword: "current-password", newPassword: "new-password", confirmPassword: "new-password" };

function PasswordField({ field, value, onChange, error, hint, disabled, inputRef }: { field: Field; value: string; onChange: (value: string) => void; error?: string; hint?: string; disabled: boolean; inputRef?: React.Ref<HTMLInputElement> }) {
  const [visible, setVisible] = useState(false);
  const id = `security-${field}`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{labels[field]}<span aria-hidden="true" className="text-destructive">*</span></Label>
      <div className="relative">
        <Input ref={inputRef} id={id} name={field} type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} required maxLength={PASSWORD_MAX_LENGTH} autoComplete={autoComplete[field]} aria-invalid={Boolean(error)} aria-describedby={describedBy} className="h-12 pr-12" disabled={disabled} />
        <Button type="button" variant="ghost" size="icon" className="absolute top-0.5 right-0.5 size-11" disabled={disabled} aria-controls={id} aria-label={`${visible ? "Sembunyikan" : "Tampilkan"} ${labels[field].toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} className="flex items-center gap-1 text-sm text-destructive"><AlertCircle aria-hidden="true" className="size-4 shrink-0" />{error}</p>}
    </div>
  );
}

// The server route re-validates everything, verifies the current password via
// Better Auth and revokes other sessions; this form only gives early feedback.
export function ChangePasswordForm() {
  const [values, setValues] = useState<Record<Field, string>>({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const currentRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  // Read only inside event handlers, never during render.
  const focusField = (field: Field) => ({ currentPassword: currentRef, newPassword: newRef, confirmPassword: confirmRef })[field].current?.focus();
  const set = (field: Field) => (value: string) => setValues((current) => ({ ...current, [field]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const next: Partial<Record<Field, string>> = {};
    const parsed = changePasswordSchema.safeParse({ currentPassword: values.currentPassword, newPassword: values.newPassword });
    if (!parsed.success) for (const issue of parsed.error.issues) { const key = issue.path[0] as Field; next[key] ??= issue.message; }
    if (!values.confirmPassword) next.confirmPassword = "Ulangi password baru.";
    else if (values.confirmPassword !== values.newPassword) next.confirmPassword = "Konfirmasi password tidak sama.";
    setErrors(next);
    const first = (["currentPassword", "newPassword", "confirmPassword"] as const).find((field) => next[field]);
    if (first) { focusField(first); return; }
    submitting.current = true; setPending(true);
    try {
      const result = await changeOwnerPassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      if (result.ok) {
        setValues({ currentPassword: "", newPassword: "", confirmPassword: "" });
        // Client-side outcome (no redirect): one toast per submission, stable id.
        toast.success("Password berhasil diganti.", { id: "change-password", description: "Sesi di perangkat lain telah diakhiri; perangkat ini tetap masuk." });
        return;
      }
      if (result.field) { setErrors({ [result.field]: result.message }); focusField(result.field); }
      setValues((current) => ({ ...current, currentPassword: "" }));
      toast.error("Password belum diganti.", { id: "change-password", description: result.message });
    } finally {
      submitting.current = false; setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={pending} className="space-y-5">
      <PasswordField field="currentPassword" value={values.currentPassword} onChange={set("currentPassword")} error={errors.currentPassword} disabled={pending} inputRef={currentRef} />
      <PasswordField field="newPassword" value={values.newPassword} onChange={set("newPassword")} error={errors.newPassword} hint={`${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} karakter dan berbeda dari password saat ini.`} disabled={pending} inputRef={newRef} />
      <PasswordField field="confirmPassword" value={values.confirmPassword} onChange={set("confirmPassword")} error={errors.confirmPassword} disabled={pending} inputRef={confirmRef} />
      <p className="flex items-start gap-2 text-xs text-muted-foreground"><KeyRound aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Setelah diganti, semua perangkat lain otomatis keluar dan harus masuk dengan password baru.</p>
      <p role="status" className="sr-only">{pending ? "Mengganti password..." : ""}</p>
      <Button type="submit" className="h-12 w-full sm:w-auto" disabled={pending}>{pending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <KeyRound aria-hidden="true" />}{pending ? "Mengganti password..." : "Ganti password"}</Button>
    </form>
  );
}
