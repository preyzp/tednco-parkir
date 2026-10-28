import "server-only";

import { z } from "zod";
import { tariffAmountMax, tariffAmountMin, timeOfDayPattern } from "../parking-tariff";

// Owner location settings (P4.6): Reguler/Menginap per vehicle type plus one
// daily open/close time. Tenant/location come from the guarded workspace, never
// from this input (strict: unknown fields are rejected). `expectedRevision` is
// the settings revision the form was loaded with (optimistic concurrency).
const amount = z.number({ error: "Masukkan nominal tarif." })
  .int("Nominal tarif harus bilangan bulat.")
  .min(tariffAmountMin, "Nominal tarif minimal Rp1.")
  .max(tariffAmountMax, "Nominal tarif maksimal Rp10.000.000.");
const rates = z.strictObject({ regular: amount, overnight: amount });
const time = z.string({ error: "Masukkan jam." }).regex(timeOfDayPattern, "Gunakan format jam 24 jam, contoh 05:00.");

export const locationSettingsSchema = z.strictObject({
  tariffs: z.strictObject({ motor: rates, mobil: rates }),
  operatingHours: z.strictObject({ openTime: time, closeTime: time }),
  expectedRevision: z.number().int().min(0),
}).superRefine((data, ctx) => {
  if (data.operatingHours.openTime === data.operatingHours.closeTime) {
    ctx.addIssue({ code: "custom", path: ["operatingHours", "closeTime"], message: "Jam tutup harus berbeda dari jam buka." });
  }
});
