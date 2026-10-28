import { z } from "zod";

export const LOGIN_PATH = "/login";
export const AUTHENTICATED_PATH = "/app";
export const SELECT_WORKSPACE_PATH = "/app/pilih-lokasi";
export const PLATFORM_PATH = "/platform";

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Masukkan alamat email Anda.").pipe(z.email({ error: "Masukkan alamat email yang valid." })),
  // Sign-in must not impose a new password policy on existing accounts.
  password: z.string().min(1, "Masukkan kata sandi Anda.").max(128, "Kata sandi maksimal 128 karakter."),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const SECURITY_SETTINGS_PATH = "/app/pengaturan/keamanan";
// Single password policy for Platform Admin and Owner accounts (6–128): tenant
// creation, change password and the Better Auth config all read these values;
// the standalone provisioning scripts mirror them. Existing hashes are unaffected.
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Masukkan password saat ini.").max(PASSWORD_MAX_LENGTH, "Password saat ini tidak valid."),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH, `Password baru minimal ${PASSWORD_MIN_LENGTH} karakter.`).max(PASSWORD_MAX_LENGTH, `Password baru maksimal ${PASSWORD_MAX_LENGTH} karakter.`),
}).strict().refine((value) => value.newPassword !== value.currentPassword, { path: ["newPassword"], message: "Password baru harus berbeda dari password saat ini." });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export function loginErrorMessage(status?: number): string {
  if (status === 401) return "Email atau kata sandi tidak sesuai.";
  if (status === 429) return "Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.";
  if (status === 403) return "Permintaan masuk ditolak. Muat ulang halaman dan coba lagi.";
  if (status === 400) return "Periksa kembali alamat email dan kata sandi Anda.";
  if (status && status >= 500) return "Layanan masuk sedang tidak tersedia. Silakan coba lagi.";
  return "Tidak dapat terhubung. Periksa koneksi internet Anda dan coba lagi.";
}
