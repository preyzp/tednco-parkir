import "server-only";

import { z } from "zod";
import { normalizePlate, optionalTextSchema, plateNumberSchema, vehicleTypeSchema } from "./common";

const vehicleFields = {
  plateNumber: plateNumberSchema,
  type: vehicleTypeSchema,
  customerName: optionalTextSchema,
  phone: optionalTextSchema,
  notes: optionalTextSchema,
};

export const vehicleEntrySchema = z.strictObject(vehicleFields).transform((data) => ({
  ...data, normalizedPlate: normalizePlate(data.plateNumber),
}));

export const vehicleUpdateSchema = z.strictObject(vehicleFields).partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), { message: "Isi setidaknya satu perubahan." })
  .transform((data) => data.plateNumber === undefined
    ? data : { ...data, normalizedPlate: normalizePlate(data.plateNumber) });

export type VehicleEntryInput = z.input<typeof vehicleEntrySchema>;
export type VehicleEntryData = z.output<typeof vehicleEntrySchema>;
export type VehicleUpdateInput = z.input<typeof vehicleUpdateSchema>;
