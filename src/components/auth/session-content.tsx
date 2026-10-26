import "server-only";
import { redirect } from "next/navigation";
import { getCurrentSession, requireAuthenticatedSession } from "../../lib/auth-session";
import { AppError } from "../../lib/errors";
import { AUTHENTICATED_PATH, LOGIN_PATH } from "../../lib/login";
import { LoginForm } from "./login-form";
import { AuthUnavailable } from "./auth-status";
import { LogoutButton } from "./logout-button";
import { Card, CardContent } from "../ui/card";
import { ShieldCheck } from "lucide-react";

export async function LoginContent() {
  let session;
  let unavailable = false;
  try { session = await getCurrentSession(); }
  catch { unavailable = true; }
  if (session) redirect(AUTHENTICATED_PATH);
  return <LoginForm initiallyUnavailable={unavailable} />;
}
export async function AuthenticatedContent() {
  let session;
  try { session = await requireAuthenticatedSession(); }
  catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED") redirect(LOGIN_PATH);
    return <AuthUnavailable />;
  }
  return <Card className="rounded-2xl py-8"><CardContent className="space-y-6 px-8"><ShieldCheck aria-hidden="true" className="size-10 text-primary" /><div className="space-y-3"><h1 className="text-2xl font-semibold tracking-tight">Anda sudah masuk</h1><p className="text-sm text-muted-foreground">Halo, <span className="font-medium text-foreground">{session.user.name}</span>.</p><p className="text-sm leading-6 text-muted-foreground">Ruang kerja belum tersedia. Silakan hubungi pengelola untuk informasi lebih lanjut.</p></div><LogoutButton /></CardContent></Card>;
}
