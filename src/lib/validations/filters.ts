import "server-only";

import { z } from "zod";
import { parkingStatusSchema, positiveIntegerSchema, vehicleTypeSchema } from "./common";

// No documented defaults/page-size cap. Transport must explicitly parse numbers;
// these schemas do not coerce empty strings, booleans, null or arrays.
export const paginationSchema = z.strictObject({
  page: positiveIntegerSchema,
  pageSize: positiveIntegerSchema,
});

// Calendar dates, not UTC instants. Future queries resolve location timezone
// and end-date inclusivity; no server/browser timezone is assumed here.
export const dateRangeSchema = z.strictObject({
  from: z.iso.date(),
  to: z.iso.date(),
}).refine(({ from, to }) => from <= to, { path: ["to"], message: "Tanggal akhir harus sama atau setelah tanggal awal." });

export const parkingSearchSchema = z.strictObject({
  search: z.string().trim().optional(),
  type: vehicleTypeSchema.optional(),
  status: parkingStatusSchema.optional(),
});
