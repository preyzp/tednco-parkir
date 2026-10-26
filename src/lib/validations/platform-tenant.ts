import "server-only";

import { z } from "zod";
import { tenantTimezones } from "../platform-labels";
export const createTenantFields = ["tenantName", "slug", "timezone", "locationName", "locationAddress", "ownerName", "ownerEmail", "ownerPassword", "ownerPasswordConfirm"] as const;
export type CreateTenantField = (typeof createTenantFields)[number];

// Messages are static server text; they never echo input values.
export const tenantNameSchema = z.string().trim().min(2, "Nama usaha minimal 2 karakter.").max(100, "Nama usaha maksimal 100 karakter.");
const tenantIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Tenant tidak valid.").transform((value) => value.toLowerCase());
const lifecycleStatusSchema = z.enum(["active", "suspended", "archived"], { error: "Status tidak valid." });

// Only the business name is editable; slug and Owner are immutable here.
export const renameTenantSchema = z.object({ tenantId: tenantIdSchema, name: tenantNameSchema }).strict();
export type RenameTenantInput = z.infer<typeof renameTenantSchema>;
// expectedStatus is the status the admin saw; a stale view is rejected.
export const changeTenantStatusSchema = z.object({ tenantId: tenantIdSchema, toStatus: lifecycleStatusSchema, expectedStatus: lifecycleStatusSchema }).strict();
export type ChangeTenantStatusInput = z.infer<typeof changeTenantStatusSchema>;

const objectIdSchema = (message: string) => z.string().regex(/^[a-f\d]{24}$/i, message).transform((value) => value.toLowerCase());
export const locationNameSchema = z.string().trim().min(2, "Nama lokasi minimal 2 karakter.").max(100, "Nama lokasi maksimal 100 karakter.");
// Empty means "no address"; the update removes the field instead of storing "".
export const locationAddressSchema = z.string().trim().max(200, "Alamat maksimal 200 karakter.").optional().transform((value) => value || undefined);

// Owner name only. Email changes need verified-email infrastructure (not available);
// passwords are never set here.
export const renameOwnerSchema = z.object({ tenantId: tenantIdSchema, userId: objectIdSchema("Owner tidak valid."), name: z.string().trim().min(1, "Masukkan nama Owner.").max(100, "Nama Owner maksimal 100 karakter.") }).strict();
export const createLocationSchema = z.object({ tenantId: tenantIdSchema, name: locationNameSchema, address: locationAddressSchema }).strict();
export const updateLocationSchema = z.object({ tenantId: tenantIdSchema, locationId: objectIdSchema("Lokasi tidak valid."), name: locationNameSchema, address: locationAddressSchema }).strict();
export const changeLocationStatusSchema = z.object({
  tenantId: tenantIdSchema, locationId: objectIdSchema("Lokasi tidak valid."),
  toStatus: z.enum(["active", "inactive"], { error: "Status lokasi tidak valid." }),
  expectedStatus: z.enum(["active", "inactive"], { error: "Status lokasi tidak valid." }),
}).strict();

export const createTenantSchema = z.object({
  tenantName: tenantNameSchema,
  slug: z.string().trim().toLowerCase()
    .min(3, "Slug minimal 3 karakter.").max(50, "Slug maksimal 50 karakter.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Gunakan huruf kecil, angka, dan tanda hubung (contoh: parkir-sentosa)."),
  timezone: z.enum(tenantTimezones, { error: "Pilih zona waktu yang tersedia." }),
  locationName: z.string().trim().min(2, "Nama lokasi minimal 2 karakter.").max(100, "Nama lokasi maksimal 100 karakter."),
  locationAddress: z.string().trim().max(200, "Alamat maksimal 200 karakter.").optional().transform((value) => value || undefined),
  ownerName: z.string().trim().min(1, "Masukkan nama Owner.").max(100, "Nama Owner maksimal 100 karakter."),
  ownerEmail: z.string().trim().toLowerCase().min(1, "Masukkan email Owner.").max(254, "Email terlalu panjang.").pipe(z.email({ error: "Masukkan alamat email yang valid." })),
  // Same policy as the provisioning scripts; sign-in accepts up to 128.
  ownerPassword: z.string().min(12, "Password minimal 12 karakter.").max(128, "Password maksimal 128 karakter."),
  ownerPasswordConfirm: z.string(),
}).strict().refine((value) => value.ownerPassword === value.ownerPasswordConfirm, { path: ["ownerPasswordConfirm"], message: "Konfirmasi password tidak sama." });
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export function createTenantFieldErrors(error: z.ZodError): Partial<Record<CreateTenantField, string>> {
  const result: Partial<Record<CreateTenantField, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (issue.path.length === 1 && typeof field === "string" && (createTenantFields as readonly string[]).includes(field) && !result[field as CreateTenantField]) {
      result[field as CreateTenantField] = issue.code === "invalid_type" ? "Isian ini wajib diisi." : issue.message;
    }
  }
  return result;
}
