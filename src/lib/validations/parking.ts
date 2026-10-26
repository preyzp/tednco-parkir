import "server-only";

import { z } from "zod";
import {
  nonNegativeIdrSchema, optionalTextSchema, paymentMethodSchema, positiveIdrSchema,
  positiveIntegerSchema, tariffTypeSchema, vehicleTypeSchema,
} from "./common";

// The documents specify labels, not machine codes. Preserve the labels until
// a cancellation code convention is agreed; "Lainnya" is the documented other.
export const cancellationReasonSchema = z.enum([
  "Gangguan operasional",
  "Pelanggan berubah pikiran",
  "Kendaraan tidak jadi masuk atau tidak meninggalkan kendaraan",
  "Salah memasukkan kendaraan",
  "Lainnya",
]);

export const cancellationSchema = z.strictObject({
  cancellationReason: cancellationReasonSchema,
  cancellationNote: optionalTextSchema,
}).superRefine((data, ctx) => {
  if (data.cancellationReason === "Lainnya" && !data.cancellationNote) {
    ctx.addIssue({ code: "custom", path: ["cancellationNote"], message: "Catatan alasan wajib diisi.", params: { fieldErrorCode: "REQUIRED" } });
  }
});

export const tariffConfigurationSchema = z.strictObject({
  vehicleType: vehicleTypeSchema,
  tariffType: tariffTypeSchema,
  amount: positiveIdrSchema,
});

export const checkoutSchema = z.strictObject({
  tariffType: tariffTypeSchema,
  nightCount: positiveIntegerSchema.optional(),
  paymentMethod: paymentMethodSchema,
  cashReceived: nonNegativeIdrSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.tariffType === "overnight" && data.nightCount === undefined) {
    ctx.addIssue({ code: "custom", path: ["nightCount"], message: "Jumlah malam wajib diisi.", params: { fieldErrorCode: "REQUIRED" } });
  }
  if (data.tariffType === "regular" && data.nightCount !== undefined) {
    ctx.addIssue({ code: "custom", path: ["nightCount"], message: "Jumlah malam hanya untuk tarif Menginap." });
  }
  if (data.paymentMethod !== "cash" && data.cashReceived !== undefined) {
    ctx.addIssue({ code: "custom", path: ["cashReceived"], message: "Uang diterima hanya untuk pembayaran tunai." });
  }
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CancellationInput = z.infer<typeof cancellationSchema>;
export type TariffConfigurationInput = z.infer<typeof tariffConfigurationSchema>;
