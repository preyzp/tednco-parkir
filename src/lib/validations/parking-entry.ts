import "server-only";

import { z } from "zod";
import { normalizePlate } from "./common";
import { displayPlate } from "../plates";
import type { VehicleType } from "../../types";

export const PLATE_MAX_LENGTH = 15;
export const ENTRY_NOTES_MAX_LENGTH = 500;
// Display form via displayPlate (shared with the form preview); matching form
// via normalizePlate() (no spaces). No regional plate regex.
export { displayPlate };

// Vehicle entry from the browser: plate, type, optional notes only. Entry time,
// tenant, location, status and actor are always set by the server.
export const vehicleEntryFormSchema = z.strictObject({
  plateNumber: z.string({ error: "Masukkan nomor polisi." })
    .transform(displayPlate)
    .pipe(z.string()
      .min(1, "Masukkan nomor polisi.")
      .max(PLATE_MAX_LENGTH, `Nomor polisi maksimal ${PLATE_MAX_LENGTH} karakter.`)
      .regex(/^[A-Z0-9 -]+$/, "Gunakan huruf, angka, spasi, atau tanda hubung saja.")
      .refine((plate) => /[A-Z0-9]/.test(plate), "Masukkan nomor polisi.")),
  // MVP types only (BUSINESS_RULE 2.1); missing or unknown values get the same message.
  vehicleType: z.enum(["motor", "mobil"] satisfies VehicleType[], { error: "Pilih jenis kendaraan." }),
  notes: z.string().trim().max(ENTRY_NOTES_MAX_LENGTH, `Catatan maksimal ${ENTRY_NOTES_MAX_LENGTH} karakter.`).optional().transform((value) => value || undefined),
}).transform((data) => ({ ...data, normalizedPlate: normalizePlate(data.plateNumber) }));
export type VehicleEntryFormData = z.output<typeof vehicleEntryFormSchema>;

export const vehicleEntryFields = ["plateNumber", "vehicleType", "notes"] as const;
export function vehicleEntryFieldErrors(error: z.ZodError): Partial<Record<(typeof vehicleEntryFields)[number], string>> {
  const result: Partial<Record<(typeof vehicleEntryFields)[number], string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && (vehicleEntryFields as readonly string[]).includes(field)) {
      const key = field as (typeof vehicleEntryFields)[number];
      result[key] ??= key === "vehicleType" ? "Pilih jenis kendaraan." : issue.code === "invalid_type" ? "Isian ini tidak valid." : issue.message;
    }
  }
  return result;
}
