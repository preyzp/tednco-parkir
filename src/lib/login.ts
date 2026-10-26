import { z } from "zod";

export const LOGIN_PATH = "/login";
export const AUTHENTICATED_PATH = "/app";
export const SELECT_WORKSPACE_PATH = "/app/pilih-lokasi";

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Masukkan alamat email Anda.").pipe(z.email({ error: "Masukkan alamat email yang valid." })),
  // Sign-in must not impose a new password policy on existing accounts.
  password: z.string().min(1, "Masukkan kata sandi Anda.").max(128, "Kata sandi maksimal 128 karakter."),
});
export type LoginInput = z.infer<typeof loginSchema>;

export function loginErrorMessage(status?: number): string {
  if (status === 401) return "Email atau kata sandi tidak sesuai.";
  if (status === 429) return "Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.";
  if (status === 403) return "Permintaan masuk ditolak. Muat ulang halaman dan coba lagi.";
  if (status === 400) return "Periksa kembali alamat email dan kata sandi Anda.";
  if (status && status >= 500) return "Layanan masuk sedang tidak tersedia. Silakan coba lagi.";
  return "Tidak dapat terhubung. Periksa koneksi internet Anda dan coba lagi.";
}
