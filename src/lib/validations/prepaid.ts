import "server-only";

import { z } from "zod";
import { optionalTextSchema, paymentMethodSchema, plateNumberSchema, positiveIdrSchema, requiredTextSchema, vehicleTypeSchema, normalizePlate } from "./common";

// Deposits cannot themselves be funded by prepaid balance.
export const depositPaymentMethodSchema = paymentMethodSchema.extract(["cash", "qris"]);
export const prepaidDepositSchema = z.strictObject({
  amount: positiveIdrSchema,
  paymentMethod: depositPaymentMethodSchema,
});

export const prepaidRegistrationSchema = z.strictObject({
  plateNumber: plateNumberSchema,
  type: vehicleTypeSchema,
  customerName: optionalTextSchema,
  phone: optionalTextSchema,
  notes: optionalTextSchema,
  amount: positiveIdrSchema,
  paymentMethod: depositPaymentMethodSchema,
}).transform((data) => ({ ...data, normalizedPlate: normalizePlate(data.plateNumber) }));

// Refund method/status await resolution of the ledger transfer mismatch.
export const prepaidRefundSchema = z.strictObject({
  amount: positiveIdrSchema,
  reason: requiredTextSchema,
});

export type PrepaidRegistrationInput = z.input<typeof prepaidRegistrationSchema>;
export type PrepaidDepositInput = z.infer<typeof prepaidDepositSchema>;
export type PrepaidRefundInput = z.infer<typeof prepaidRefundSchema>;
