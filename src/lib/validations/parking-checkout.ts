import "server-only";

import { z } from "zod";
import { maxNightCount } from "../parking-tariff";

// Checkout confirmation from the browser. The session id is an untrusted
// selection (re-scoped to the guarded tenant/location); `expectedTotal` is only
// a check that the shown amount is still the server's amount — never the
// charged value. Exit time, tenant, location, actor and the total are always
// set by the server. MVP payment method: cash only.
export const checkoutConfirmSchema = z.strictObject({
  sessionId: z.string().regex(/^[a-f\d]{24}$/i).transform((value) => value.toLowerCase()),
  tariffType: z.enum(["regular", "overnight"]),
  nightCount: z.number().int().min(1).max(maxNightCount).optional(),
  paymentMethod: z.literal("cash"),
  expectedTotal: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  idempotencyKey: z.uuid(),
}).superRefine((data, ctx) => {
  if (data.tariffType === "overnight" && data.nightCount === undefined) ctx.addIssue({ code: "custom", path: ["nightCount"], message: "Jumlah malam wajib diisi." });
  if (data.tariffType === "regular" && data.nightCount !== undefined) ctx.addIssue({ code: "custom", path: ["nightCount"], message: "Jumlah malam hanya untuk tarif Menginap." });
});
export type CheckoutConfirmInput = z.infer<typeof checkoutConfirmSchema>;
