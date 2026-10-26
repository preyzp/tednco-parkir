"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "../ui/card";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { loginWithPassword } from "../../lib/auth-client";
import { AUTHENTICATED_PATH, loginSchema } from "../../lib/login";

export function LoginForm({ initiallyUnavailable = false }: { initiallyUnavailable?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<"email" | "password", string>>>({});
  const [error, setError] = useState(initiallyUnavailable ? "Layanan masuk sedang tidak tersedia. Anda dapat mencoba kembali." : "");
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const result = loginSchema.safeParse({ email, password });
    setError("");
    if (!result.success) {
      const next: Partial<Record<"email" | "password", string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        if ((key === "email" || key === "password") && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      (next.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setErrors({});
    submitting.current = true;
    setPending(true);
    try {
      const response = await loginWithPassword(result.data);
      if (!response.ok) { setError(response.message); return; }
      setPassword("");
      router.replace(AUTHENTICATED_PATH);
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung. Periksa koneksi Anda dan coba lagi.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="gap-7 rounded-2xl py-8 shadow-sm sm:py-9">
        <CardHeader className="gap-3 px-6 sm:px-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Selamat datang kembali</h1>
          <CardDescription className="text-sm leading-6">Masuk ke akun TednCo Parkir Anda.</CardDescription>
        </CardHeader>
        <CardContent className="px-6 sm:px-8">
          <form onSubmit={submit} noValidate aria-busy={pending} className="space-y-5">
            {error && <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>Tidak dapat masuk</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="space-y-2">
              <Label htmlFor="login-email">Alamat email</Label>
              <Input ref={emailRef} id="login-email" name="email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} required placeholder="nama@contoh.id" className="h-12 text-base" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} />
              {errors.email && <p id="email-error" role="alert" className="text-sm text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Kata sandi</Label>
              <div className="relative">
                <Input ref={passwordRef} id="login-password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" required className="h-12 pr-12 text-base" placeholder="Masukkan kata sandi" value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} />
                <Button type="button" variant="ghost" size="icon" className="absolute top-0.5 right-0.5 size-11" disabled={pending} aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</Button>
              </div>
              {errors.password && <p id="password-error" role="alert" className="text-sm text-destructive">{errors.password}</p>}
            </div>
            <Button type="submit" className="mt-2 h-12 w-full text-base font-semibold" disabled={pending}>{pending ? <><LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />Memproses...</> : <>Masuk<ArrowRight aria-hidden="true" /></>}</Button>
            <span className="sr-only" role="status">{pending ? "Sedang memeriksa akun Anda." : ""}</span>
          </form>
        </CardContent>
      </Card>
      <p className="px-4 text-center text-sm leading-6 text-muted-foreground">Belum dapat mengakses akun?<br /><span className="text-foreground">Hubungi pengelola Anda.</span></p>
    </div>
  );
}
