"use server";
import { redirect } from "next/navigation";
import { AppError } from "./errors";
import {
  changeTenantLocationStatus, changeTenantStatus, createTenantLocation, createTenantWithOwner, renameTenant,
  renameTenantOwner, updateTenantLocation, type TenantResourceResult, type UpdateTenantResult,
} from "./dal";
import { LOGIN_PATH } from "./login";
import { PLATFORM_TENANTS_PATH } from "./platform-labels";
import { createTenantFields } from "./validations/platform-tenant";

// Static messages only; input values (and especially passwords) are never returned.
export interface CreateTenantFormState {
  readonly status: "idle" | "error";
  readonly message?: string;
  readonly fieldErrors?: Partial<Record<string, string>>;
}

// Public endpoint: authorization, validation and uniqueness are all enforced
// server-side by createTenantWithOwner. Never log FormData.
export async function createTenantAction(_previous: CreateTenantFormState, formData: FormData): Promise<CreateTenantFormState> {
  const raw = Object.fromEntries(createTenantFields.map((field) => { const value = formData.get(field); return [field, typeof value === "string" ? value : undefined]; }));
  let tenantId: string;
  try {
    const result = await createTenantWithOwner(raw);
    if (!result.ok && result.reason === "validation") return { status: "error", message: "Periksa kembali isian yang ditandai.", fieldErrors: result.fieldErrors };
    if (!result.ok) {
      return result.field === "slug"
        ? { status: "error", message: "Slug sudah digunakan tenant lain.", fieldErrors: { slug: "Slug sudah digunakan. Pilih slug lain." } }
        : { status: "error", message: "Email Owner sudah terdaftar.", fieldErrors: { ownerEmail: "Email sudah terdaftar. Gunakan email lain; akun yang ada tidak akan diubah." } };
    }
    tenantId = result.tenantId;
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED") redirect(LOGIN_PATH);
    if (error instanceof AppError && error.code === "FORBIDDEN") return { status: "error", message: "Hanya Platform Admin yang dapat membuat tenant." };
    // Possibly an ambiguous commit: never claim success or a clean failure.
    return { status: "error", message: "Pembuatan tenant belum dapat dikonfirmasi. Periksa daftar tenant sebelum mencoba lagi agar tidak terjadi duplikasi." };
  }
  redirect(`${PLATFORM_TENANTS_PATH}/${tenantId}?dibuat=1`);
}

export interface TenantUpdateFormState {
  readonly status: "idle" | "error";
  readonly message?: string;
}
type MutationResult = UpdateTenantResult | TenantResourceResult;
const updateMessages: Record<Exclude<MutationResult, { ok: true }>["reason"], string> = {
  validation: "Periksa kembali isian Anda.",
  not_found: "Data tidak ditemukan pada tenant ini.",
  unchanged: "Tidak ada perubahan untuk disimpan.",
  stale: "Data tenant sudah berubah. Muat ulang halaman, lalu periksa kembali sebelum mencoba lagi.",
  invalid_transition: "Perubahan status ini tidak diizinkan.",
  duplicate_name: "Nama lokasi sudah dipakai di tenant ini. Gunakan nama lain.",
  protected_account: "Akun ini tidak dapat diubah dari halaman tenant.",
};
type Notice = "nama" | "status" | "owner" | "lokasi-baru" | "lokasi" | "status-lokasi";
// Shared mapping for tenant mutations; success re-reads the page from the server.
async function runTenantUpdate(work: () => Promise<MutationResult>, notice: Notice): Promise<TenantUpdateFormState> {
  let tenantId: string;
  try {
    const result = await work();
    if (!result.ok) return { status: "error", message: result.reason === "validation" ? result.message : updateMessages[result.reason] };
    tenantId = result.tenantId;
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED") redirect(LOGIN_PATH);
    if (error instanceof AppError && error.code === "FORBIDDEN") return { status: "error", message: "Hanya Platform Admin yang dapat mengelola tenant." };
    return { status: "error", message: "Perubahan belum dapat dikonfirmasi. Muat ulang halaman untuk memeriksa status terbaru sebelum mencoba lagi." };
  }
  redirect(`${PLATFORM_TENANTS_PATH}/${tenantId}?diperbarui=${notice}`);
}
const field = (formData: FormData, name: string) => { const value = formData.get(name); return typeof value === "string" ? value : undefined; };

export async function renameTenantAction(_previous: TenantUpdateFormState, formData: FormData): Promise<TenantUpdateFormState> {
  return runTenantUpdate(() => renameTenant({ tenantId: field(formData, "tenantId"), name: field(formData, "name") }), "nama");
}
export async function changeTenantStatusAction(_previous: TenantUpdateFormState, formData: FormData): Promise<TenantUpdateFormState> {
  return runTenantUpdate(() => changeTenantStatus({ tenantId: field(formData, "tenantId"), toStatus: field(formData, "toStatus"), expectedStatus: field(formData, "expectedStatus") }), "status");
}
export async function renameOwnerAction(_previous: TenantUpdateFormState, formData: FormData): Promise<TenantUpdateFormState> {
  return runTenantUpdate(() => renameTenantOwner({ tenantId: field(formData, "tenantId"), userId: field(formData, "userId"), name: field(formData, "name") }), "owner");
}
export async function createLocationAction(_previous: TenantUpdateFormState, formData: FormData): Promise<TenantUpdateFormState> {
  return runTenantUpdate(() => createTenantLocation({ tenantId: field(formData, "tenantId"), name: field(formData, "name"), address: field(formData, "address") }), "lokasi-baru");
}
export async function updateLocationAction(_previous: TenantUpdateFormState, formData: FormData): Promise<TenantUpdateFormState> {
  return runTenantUpdate(() => updateTenantLocation({ tenantId: field(formData, "tenantId"), locationId: field(formData, "locationId"), name: field(formData, "name"), address: field(formData, "address") }), "lokasi");
}
export async function changeLocationStatusAction(_previous: TenantUpdateFormState, formData: FormData): Promise<TenantUpdateFormState> {
  return runTenantUpdate(() => changeTenantLocationStatus({ tenantId: field(formData, "tenantId"), locationId: field(formData, "locationId"), toStatus: field(formData, "toStatus"), expectedStatus: field(formData, "expectedStatus") }), "status-lokasi");
}
