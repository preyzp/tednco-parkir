"use client";

import { createAuthClient } from "better-auth/react";
import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, loginErrorMessage, type LoginInput } from "./login";

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

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; message: string; field?: "currentPassword" | "newPassword" };
// The server route returns the app error contract; only allowlisted fields/codes are read.
const changePasswordErrorSchema = z.object({
  error: z.object({ fieldErrors: z.array(z.object({ field: z.string(), code: z.string() })).optional() }).optional(),
}).passthrough();
export function changePasswordErrorMessage(status: number | undefined, body: unknown): Exclude<ChangePasswordResult, { ok: true }> {
  const field = changePasswordErrorSchema.safeParse(body).data?.error?.fieldErrors?.[0];
  if (status === 400 && field?.field === "currentPassword") return { ok: false, field: "currentPassword", message: "Password saat ini salah." };
  if (status === 400 && field?.field === "newPassword") return { ok: false, field: "newPassword", message: field.code === "INVALID" ? "Password baru harus berbeda dari password saat ini." : `Password baru harus ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} karakter.` };
  if (status === 400) return { ok: false, message: "Periksa kembali isian password Anda." };
  if (status === 401) return { ok: false, message: "Sesi Anda berakhir. Silakan masuk kembali." };
  if (status === 403) return { ok: false, message: "Fitur ini hanya untuk Owner dengan usaha yang aktif." };
  if (status === 429) return { ok: false, message: "Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi." };
  return { ok: false, message: "Perubahan password belum dapat dikonfirmasi. Coba masuk dengan password lama; jika gagal, gunakan password baru." };
}

// Official Better Auth changePassword. The server forces revokeOtherSessions and
// issues a fresh cookie for this browser; passwords never leave the request body.
export async function changeOwnerPassword(input: { currentPassword: string; newPassword: string }): Promise<ChangePasswordResult> {
  try {
    const result = await authClient.changePassword({ currentPassword: input.currentPassword, newPassword: input.newPassword, revokeOtherSessions: true });
    if (result.error) return changePasswordErrorMessage(result.error.status, result.error);
    if (!successSchema.safeParse(result.data).success) return changePasswordErrorMessage(503, null);
    return { ok: true };
  } catch {
    return { ok: false, message: "Tidak dapat terhubung. Periksa koneksi Anda dan coba lagi." };
  }
}
