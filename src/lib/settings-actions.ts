"use server";
import { redirect } from "next/navigation";
import { AppError } from "./errors";
import { updateLocationSettings, type LocationSettingsView } from "./dal";
import { LOGIN_PATH } from "./login";
import { resolveActiveWorkspace } from "./workspace";

export interface LocationSettingsActionResult {
  // "unknown": the server could not confirm the outcome; reload before retrying.
  readonly status: "success" | "error" | "conflict" | "unknown";
  readonly message?: string;
  readonly fieldErrors?: Record<string, string>;
  readonly settings?: LocationSettingsView;
}

// Public endpoint (the settings page reads through the DAL in a server
// component). The location is always the server-validated active
// workspace (never a field); the repository re-checks session, Owner role,
// grants and tenant/location status on every call.
async function withWorkspace(run: (selection: { tenantId: string; locationId: string }) => Promise<LocationSettingsActionResult>): Promise<LocationSettingsActionResult> {
  let unauthenticated = false;
  try {
    const workspace = await resolveActiveWorkspace();
    if (workspace.status !== "active") return { status: "error", message: "Pilih lokasi aktif terlebih dahulu, lalu coba lagi." };
    return await run({ tenantId: workspace.workspace.tenantId, locationId: workspace.workspace.locationId });
  } catch (error) {
    unauthenticated = error instanceof AppError && error.code === "UNAUTHENTICATED";
    if (!unauthenticated && error instanceof AppError && error.code === "FORBIDDEN") return { status: "error", message: "Pengaturan lokasi ini hanya dapat diubah oleh Owner dengan usaha dan lokasi yang aktif." };
    if (!unauthenticated) return { status: "unknown", message: "Pengaturan belum dapat dipastikan. Muat ulang halaman sebelum mencoba lagi." };
  }
  redirect(LOGIN_PATH);
}

export async function saveLocationSettingsAction(input: { tariffs: unknown; operatingHours: unknown; expectedRevision: unknown }): Promise<LocationSettingsActionResult> {
  // Only the three known fields are forwarded; anything else is dropped here and
  // rejected by the strict schema if smuggled inside them.
  const raw = { tariffs: input?.tariffs, operatingHours: input?.operatingHours, expectedRevision: input?.expectedRevision };
  return withWorkspace(async (selection) => {
    const result = await updateLocationSettings(selection, raw);
    if (result.ok) return { status: "success", settings: result.settings };
    if (result.reason === "validation") return { status: "error", message: "Periksa kembali isian yang ditandai.", fieldErrors: result.fieldErrors };
    if (result.reason === "conflict") return { status: "conflict", message: "Pengaturan sudah diubah di tempat lain. Muat ulang halaman, periksa nilai terbaru, lalu simpan lagi." };
    return { status: "error", message: "Penyimpanan pengaturan belum siap di server. Hubungi pengelola platform." };
  });
}
