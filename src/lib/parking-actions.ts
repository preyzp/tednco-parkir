"use server";
import { redirect } from "next/navigation";
import { AppError } from "./errors";
import { completeParkingCheckout, recordVehicleEntry, type CheckoutReceipt } from "./dal";
import { formatRupiah } from "./parking-tariff";
import { LOGIN_PATH } from "./login";
import { resolveActiveWorkspace } from "./workspace";
import type { VehicleType } from "../types";

export interface VehicleEntryFormState {
  readonly status: "idle" | "error" | "success";
  readonly message?: string;
  readonly fieldErrors?: Partial<Record<"plateNumber" | "vehicleType" | "notes", string>>;
  readonly entry?: { readonly plateNumber: string; readonly vehicleType: VehicleType; readonly entryAt: string; readonly timeZone: string; readonly locationName: string };
}

// Public endpoint. The target location is the server-validated active
// workspace (never a form field); recordVehicleEntry re-checks session, Owner
// role, tenant/location status and scoping. Entry time is set server-side.
export async function recordVehicleEntryAction(_previous: VehicleEntryFormState, formData: FormData): Promise<VehicleEntryFormState> {
  const read = (field: string) => { const value = formData.get(field); return typeof value === "string" ? value : undefined; };
  const raw = { plateNumber: read("plateNumber"), vehicleType: read("vehicleType") || undefined, notes: read("notes") };
  let unauthenticated = false;
  try {
    const workspace = await resolveActiveWorkspace();
    if (workspace.status !== "active") return { status: "error", message: "Pilih lokasi aktif terlebih dahulu, lalu coba lagi." };
    const result = await recordVehicleEntry({ tenantId: workspace.workspace.tenantId, locationId: workspace.workspace.locationId }, raw);
    if (result.ok) return { status: "success", entry: result.entry };
    if (result.reason === "validation") return { status: "error", message: "Periksa kembali isian yang ditandai.", fieldErrors: result.fieldErrors };
    if (result.reason === "duplicate_active") return { status: "error", message: "Kendaraan ini masih tercatat parkir di lokasi ini.", fieldErrors: { plateNumber: "Nomor polisi ini sudah memiliki sesi parkir aktif di lokasi ini." } };
    return { status: "error", message: "Pencatatan kendaraan belum siap di server. Hubungi pengelola platform." };
  } catch (error) {
    unauthenticated = error instanceof AppError && error.code === "UNAUTHENTICATED";
    if (!unauthenticated && error instanceof AppError && error.code === "FORBIDDEN") return { status: "error", message: "Anda tidak memiliki akses untuk mencatat kendaraan di lokasi ini." };
    if (!unauthenticated) return { status: "error", message: "Kendaraan belum dapat dicatat. Periksa dashboard sebelum mencoba lagi agar tidak tercatat ganda." };
  }
  redirect(LOGIN_PATH);
}

export interface CheckoutActionResult {
  // "unknown": the server could not confirm the outcome (e.g. lost connection
  // to the database). The caller must re-check the session before retrying.
  readonly status: "success" | "error" | "unknown";
  readonly message?: string;
  readonly receipt?: CheckoutReceipt;
  readonly refresh?: boolean; // the session changed: reload the checkout view
}

// Public endpoint. Only the session selection, tariff choice, the amount shown
// (as a check) and an idempotency key come from the browser; tenant/location
// are the server-validated active workspace, and completeParkingCheckout
// recomputes the total at the server's time and re-checks everything.
export async function confirmCheckoutAction(input: { sessionId: unknown; tariffType: unknown; nightCount?: unknown; expectedTotal: unknown; idempotencyKey: unknown }): Promise<CheckoutActionResult> {
  const raw = { sessionId: input.sessionId, tariffType: input.tariffType, ...(input.nightCount !== undefined ? { nightCount: input.nightCount } : {}), paymentMethod: "cash", expectedTotal: input.expectedTotal, idempotencyKey: input.idempotencyKey };
  let unauthenticated = false;
  try {
    const workspace = await resolveActiveWorkspace();
    if (workspace.status !== "active") return { status: "error", message: "Pilih lokasi aktif terlebih dahulu, lalu coba lagi." };
    const result = await completeParkingCheckout({ tenantId: workspace.workspace.tenantId, locationId: workspace.workspace.locationId }, raw);
    if (result.ok) return { status: "success", receipt: result.receipt };
    switch (result.reason) {
      case "price_changed": return { status: "error", refresh: true, message: `Total pembayaran berubah menjadi ${formatRupiah(result.totalAmount)}. Periksa kembali sebelum menerima uang.` };
      case "already_completed": return { status: "error", refresh: true, message: "Kendaraan ini sudah diproses keluar. Tidak ada pembayaran baru yang dicatat." };
      case "not_active": return { status: "error", refresh: true, message: "Sesi parkir ini sudah dibatalkan dan tidak dapat diproses keluar." };
      case "not_found": return { status: "error", message: "Sesi parkir tidak ditemukan di lokasi ini." };
      case "validation": return { status: "error", message: "Periksa kembali pilihan tarif dan jumlah malam." };
      case "tariff_unavailable": return { status: "error", message: "Tarif lokasi ini belum konsisten. Hubungi pengelola sebelum memproses keluar." };
      default: return { status: "error", message: "Proses keluar belum siap di server. Hubungi pengelola platform." };
    }
  } catch (error) {
    unauthenticated = error instanceof AppError && error.code === "UNAUTHENTICATED";
    if (!unauthenticated && error instanceof AppError && error.code === "FORBIDDEN") return { status: "error", message: "Anda tidak memiliki akses untuk memproses kendaraan keluar di lokasi ini." };
    if (!unauthenticated) return { status: "unknown", message: "Status pembayaran belum dapat dipastikan. Periksa status transaksi sebelum mencoba lagi." };
  }
  redirect(LOGIN_PATH);
}
