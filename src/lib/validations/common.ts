import "server-only";

import { z } from "zod";
import type { VehicleType, TariffType, PaymentMethod, ParkingStatus } from "../../types";

// Exhaustive records keep runtime enum literals aligned with the domain unions.
export const vehicleTypeSchema = z.enum({ motor: "motor", mobil: "mobil" } satisfies Record<VehicleType, VehicleType>);
export const tariffTypeSchema = z.enum({ regular: "regular", overnight: "overnight" } satisfies Record<TariffType, TariffType>);
export const paymentMethodSchema = z.enum({ cash: "cash", qris: "qris", prepaid: "prepaid" } satisfies Record<PaymentMethod, PaymentMethod>);
export const parkingStatusSchema = z.enum({ active: "active", completed: "completed", canceled: "canceled" } satisfies Record<ParkingStatus, ParkingStatus>);

export const nonNegativeIdrSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const positiveIdrSchema = nonNegativeIdrSchema.min(1);
export const positiveIntegerSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const requiredTextSchema = z.string().trim().min(1);
export const optionalTextSchema = z.string().trim().optional();

// No regional plate regex: only the documented nonempty/normalization rules.
export const plateNumberSchema = requiredTextSchema.transform((plate) => plate.toUpperCase());
export function normalizePlate(plate: string): string {
  return plate.trim().toUpperCase().replace(/\s/g, "");
}
