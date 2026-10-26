"use client";

import { createAuthClient } from "better-auth/react";
import { z } from "zod";
import { loginErrorMessage, type LoginInput } from "./login";

// Official Better Auth transport; no alternate session store/token handling.
const authClient = createAuthClient({
  baseURL: typeof window === "undefined" ? undefined : window.location.origin,
  basePath: "/api/auth",
  // Navigation is an application-owned fixed path, never a callback from input.
  disableDefaultFetchPlugins: true,
  fetchOptions: { credentials: "same-origin", retry: 0 },
});

const successSchema = z.object({ ok: z.literal(true) });
const currentSessionSchema = successSchema.extend({
  user: z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }),
  session: z.object({ expiresAt: z.union([z.date(), z.iso.datetime().transform((value) => new Date(value))]) }),
});
type AuthResult = { ok: true } | { ok: false; message: string };

export async function loginWithPassword(input: LoginInput): Promise<AuthResult> {
  try {
    const result = await authClient.signIn.email({ email: input.email, password: input.password });
    if (result.error) return { ok: false, message: loginErrorMessage(result.error.status) };
    if (!successSchema.safeParse(result.data).success) return { ok: false, message: loginErrorMessage(503) };
    // The P2.2A backend intentionally returns safe projections, not native tokens.
    const current = await authClient.$fetch<unknown>("/get-session", { method: "GET", cache: "no-store" });
    const session = currentSessionSchema.safeParse(current.data);
    if (current.error || !session.success || session.data.session.expiresAt.getTime() <= Date.now()) {
      return { ok: false, message: "Sesi belum dapat dikonfirmasi. Silakan coba masuk kembali." };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: loginErrorMessage() };
  }
}

export async function logoutCurrentSession(): Promise<AuthResult> {
  try {
    const result = await authClient.signOut();
    if (result.error || !successSchema.safeParse(result.data).success) {
      return { ok: false, message: "Keluar belum dapat dikonfirmasi. Silakan coba lagi." };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Tidak dapat mengakhiri sesi. Periksa koneksi Anda dan coba lagi." };
  }
}
