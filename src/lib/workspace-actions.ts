"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppError } from "./errors";
import { requireLocationContext } from "./dal";
import { AUTHENTICATED_PATH, LOGIN_PATH } from "./login";
import { WORKSPACE_COOKIE, encodeWorkspaceSelection, parseSelectionInput, workspaceCookieOptions } from "./workspace";

export interface SelectWorkspaceState { readonly error?: string }

// Public endpoint: never trust the submitted IDs; the guard re-derives role,
// tenant status and location assignment from the database before remembering.
export async function selectWorkspace(_previous: SelectWorkspaceState, formData: FormData): Promise<SelectWorkspaceState> {
  const selection = parseSelectionInput(formData.get("selection"));
  if (!selection) return { error: "Pilihan lokasi tidak valid. Muat ulang halaman dan coba lagi." };
  let encoded: string;
  try {
    encoded = encodeWorkspaceSelection(await requireLocationContext(selection));
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED") redirect(LOGIN_PATH);
    if (error instanceof AppError && error.code === "FORBIDDEN") return { error: "Lokasi tidak aktif, tidak ditemukan, atau di luar izin Anda." };
    return { error: "Layanan sementara tidak tersedia. Silakan coba lagi." };
  }
  (await cookies()).set(WORKSPACE_COOKIE, encoded, workspaceCookieOptions);
  redirect(AUTHENTICATED_PATH);
}
