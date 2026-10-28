import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ServerCrash, ShieldAlert, ShieldCheck } from "lucide-react";
import { AppError } from "../../lib/errors";
import { requireOwnerAccount } from "../../lib/dal";
import { AUTHENTICATED_PATH, LOGIN_PATH } from "../../lib/login";
import { LogoutButton } from "../auth/logout-button";
import { SETTINGS_PATH } from "../../lib/owner-navigation";
import { BackLink } from "../back-link";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { ChangePasswordForm } from "./change-password-form";

// Server guard on every request: verified session + active Owner membership of
// an active tenant. The page shows no tenant data; the API route re-checks.
export async function SecuritySettingsContent() {
  let outcome: "ok" | "unauthenticated" | "forbidden" | "unavailable" = "ok";
  try { await requireOwnerAccount(); }
  catch (error) {
    outcome = error instanceof AppError && error.code === "UNAUTHENTICATED" ? "unauthenticated" : error instanceof AppError && error.code === "FORBIDDEN" ? "forbidden" : "unavailable";
  }
  if (outcome === "unauthenticated") redirect(LOGIN_PATH);
  if (outcome === "forbidden") {
    return <Card><CardContent className="space-y-5"><ShieldAlert aria-hidden="true" className="size-8 text-destructive" /><div className="space-y-2"><h1 className="text-xl font-semibold">Pengaturan keamanan tidak tersedia</h1><p className="text-sm leading-6 text-muted-foreground">Halaman ini hanya untuk Owner dengan usaha yang aktif.</p></div><Button asChild variant="outline" className="h-12 w-full"><Link href={AUTHENTICATED_PATH}>Kembali ke ruang kerja</Link></Button><LogoutButton /></CardContent></Card>;
  }
  if (outcome === "unavailable") {
    return <Card><CardContent className="space-y-5"><ServerCrash aria-hidden="true" className="size-8 text-muted-foreground" /><div className="space-y-2"><h1 className="text-xl font-semibold">Layanan belum tersedia</h1><p className="text-sm leading-6 text-muted-foreground">Akses akun belum dapat diperiksa. Muat ulang halaman sebentar lagi.</p></div></CardContent></Card>;
  }
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BackLink href={SETTINGS_PATH} to="Pengaturan" />
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><ShieldCheck aria-hidden="true" className="size-6 text-primary" />Keamanan akun</h1>
        <p className="text-sm text-muted-foreground">Ganti password akun Owner Anda. Password saat ini wajib diisi untuk verifikasi.</p>
      </div>
      <Card className="rounded-2xl"><CardContent><ChangePasswordForm /></CardContent></Card>
    </div>
  );
}
