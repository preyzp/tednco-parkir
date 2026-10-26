import { expect, expectTypeOf, test, vi } from "vitest";
import { z } from "zod";
import type { PaymentMethod, TariffType, VehicleType } from "../../types";

vi.mock("server-only", () => ({}));
import { normalizeError } from "../errors";
import {
  vehicleEntrySchema, vehicleUpdateSchema, cancellationSchema, cancellationReasonSchema,
  tariffConfigurationSchema, checkoutSchema, prepaidRegistrationSchema,
  prepaidDepositSchema, prepaidRefundSchema, paginationSchema, dateRangeSchema,
  parkingSearchSchema, positiveIdrSchema, nonNegativeIdrSchema, normalizePlate,
  vehicleTypeSchema, tariffTypeSchema, paymentMethodSchema, toValidationError,
} from "./index";

const vehicle = { plateNumber: " b 1234 xyz ", type: "motor" };
const checkout = { tariffType: "regular", paymentMethod: "cash" };

test("vehicle normalization derives trusted matching data without a regional format", () => {
  expect(vehicleEntrySchema.parse(vehicle)).toEqual({
    plateNumber: "B 1234 XYZ", normalizedPlate: "B1234XYZ", type: "motor",
  });
  expect(normalizePlate(" b\t1234 xyz ")).toBe("B1234XYZ");
  expect(vehicleEntrySchema.safeParse({ plateNumber: "custom-123", type: "mobil" }).success).toBe(true);
  expect(vehicleEntrySchema.parse({ ...vehicle, customerName: " ", phone: " +62 123 ", notes: " " }))
    .toMatchObject({ customerName: "", phone: "+62 123", notes: "" });
});

test.each([{}, { type: "motor" }, { ...vehicle, plateNumber: "  " },
  { ...vehicle, type: "Motor" }, { ...vehicle, type: "truck" },
  { ...vehicle, customerName: null }, { ...vehicle, phone: 123 },
])("rejects invalid vehicle input %#", (input) => {
  expect(vehicleEntrySchema.safeParse(input).success).toBe(false);
});

test("updates are partial, nonempty and normalize only a supplied plate", () => {
  expect(vehicleUpdateSchema.parse({ notes: " " })).toEqual({ notes: "" });
  expect(vehicleUpdateSchema.parse({ plateNumber: " b 9 x " })).toEqual({ plateNumber: "B 9 X", normalizedPlate: "B9X" });
  for (const input of [{}, { notes: undefined }, { notes: null }, { plateNumber: " " }]) {
    expect(vehicleUpdateSchema.safeParse(input).success).toBe(false);
  }
});

test("all documented cancellation reasons work, other requires a note", () => {
  for (const cancellationReason of cancellationReasonSchema.options) {
    expect(cancellationSchema.safeParse({ cancellationReason, cancellationNote: " Penjelasan " }).success).toBe(true);
  }
  expect(cancellationSchema.safeParse({ cancellationReason: "Gangguan operasional" }).success).toBe(true);
  for (const cancellationNote of [undefined, "", " ", null]) {
    expect(cancellationSchema.safeParse({ cancellationReason: "Lainnya", cancellationNote }).success).toBe(false);
  }
  expect(cancellationSchema.safeParse({ cancellationReason: "other", cancellationNote: "x" }).success).toBe(false);
});

test.each([0, -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, "1000", null, true])(
  "rejects invalid positive IDR amount %#", (amount) => {
    expect(positiveIdrSchema.safeParse(amount).success).toBe(false);
    expect(prepaidDepositSchema.safeParse({ amount, paymentMethod: "cash" }).success).toBe(false);
    expect(tariffConfigurationSchema.safeParse({ vehicleType: "motor", tariffType: "regular", amount }).success).toBe(false);
    expect(prepaidRefundSchema.safeParse({ amount, reason: "Permintaan pelanggan" }).success).toBe(false);
  },
);

test("safe integer boundaries and positive/zero distinction", () => {
  expect(nonNegativeIdrSchema.parse(0)).toBe(0);
  expect(nonNegativeIdrSchema.safeParse(-1).success).toBe(false);
  expect(positiveIdrSchema.parse(1)).toBe(1);
  expect(positiveIdrSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  expect(tariffConfigurationSchema.parse({ vehicleType: "mobil", tariffType: "overnight", amount: 1 })).toMatchObject({ amount: 1 });
});

test.each(["cash", "qris", "prepaid"])("checkout accepts one explicit %s method", (paymentMethod) => {
  expect(checkoutSchema.safeParse({ ...checkout, paymentMethod }).success).toBe(true);
  expect(checkoutSchema.safeParse({ tariffType: "overnight", nightCount: 1, paymentMethod }).success).toBe(true);
});

test.each([undefined, 0, -1, 1.5, "1", null, true, Number.MAX_SAFE_INTEGER + 1])(
  "overnight rejects missing/invalid nightCount %#", (nightCount) => {
    expect(checkoutSchema.safeParse({ ...checkout, tariffType: "overnight", nightCount }).success).toBe(false);
  },
);

test("checkout does not infer tariff, accept split/confirmation or stale conditional fields", () => {
  for (const input of [
    { paymentMethod: "cash" }, { tariffType: "regular" },
    { ...checkout, tariffType: "Menginap" }, { ...checkout, nightCount: 1 },
    { ...checkout, paymentMethod: ["cash", "prepaid"] },
    { ...checkout, paymentMethod: "qris", cashReceived: 1 },
    { ...checkout, confirmed: true }, { ...checkout, payments: [] },
  ]) expect(checkoutSchema.safeParse(input).success).toBe(false);
  expect(checkoutSchema.parse({ ...checkout, cashReceived: 0 }).cashReceived).toBe(0);
  expect(checkoutSchema.safeParse({ ...checkout, cashReceived: 1.5 }).success).toBe(false);
});

test("prepaid registration/deposit is input only and excludes prepaid funding", () => {
  for (const paymentMethod of ["cash", "qris"]) {
    expect(prepaidRegistrationSchema.parse({ ...vehicle, amount: 1, paymentMethod }).normalizedPlate).toBe("B1234XYZ");
    expect(prepaidDepositSchema.safeParse({ amount: 1, paymentMethod }).success).toBe(true);
  }
  expect(prepaidDepositSchema.safeParse({ amount: 1, paymentMethod: "prepaid" }).success).toBe(false);
  expect(prepaidRegistrationSchema.safeParse({ ...vehicle, amount: 0, paymentMethod: "cash" }).success).toBe(false);
});

test("refund requires a nonblank reason but does not claim balance or authorization checks", () => {
  expect(prepaidRefundSchema.parse({ amount: 1, reason: " Pelanggan meminta refund " })).toEqual({ amount: 1, reason: "Pelanggan meminta refund" });
  for (const reason of [undefined, null, "", " "]) {
    expect(prepaidRefundSchema.safeParse({ amount: 1, reason }).success).toBe(false);
  }
  expect(prepaidRefundSchema.safeParse({ amount: 1, reason: "x", paymentMethod: "transfer" }).success).toBe(false);
});

const operationCases = [
  [vehicleEntrySchema, vehicle],
  [vehicleUpdateSchema, { notes: "x" }],
  [cancellationSchema, { cancellationReason: "Lainnya", cancellationNote: "x" }],
  [tariffConfigurationSchema, { vehicleType: "motor", tariffType: "regular", amount: 1 }],
  [checkoutSchema, checkout],
  [prepaidRegistrationSchema, { ...vehicle, amount: 1, paymentMethod: "cash" }],
  [prepaidDepositSchema, { amount: 1, paymentMethod: "cash" }],
  [prepaidRefundSchema, { amount: 1, reason: "x" }],
] as const;

test.each(["tenantId", "locationId", "staffId", "amountDue", "totalAmount", "balance", "normalizedPlate", "confirmed", "createdAt"])(
  "every operation rejects server-owned/unexpected field %s", (field) => {
    for (const [schema, input] of operationCases) {
      expect(schema.safeParse({ ...input, [field]: "untrusted" }).success).toBe(false);
    }
  },
);

test("pagination requires typed positive integers without coercion or defaults", () => {
  expect(paginationSchema.parse({ page: 1, pageSize: 10 })).toEqual({ page: 1, pageSize: 10 });
  for (const input of [{}, { page: 0, pageSize: 10 }, { page: 1, pageSize: 1.5 }, { page: "1", pageSize: "10" }, { page: 1, pageSize: null }]) {
    expect(paginationSchema.safeParse(input).success).toBe(false);
  }
});

test("calendar date ranges validate real dates and order without timezone conversion", () => {
  expect(dateRangeSchema.safeParse({ from: "2024-02-29", to: "2024-02-29" }).success).toBe(true);
  for (const input of [
    { from: "2025-02-29", to: "2025-03-01" }, { from: "2026-10-20", to: "2026-10-18" },
    { from: "2026-10-18T00:00:00Z", to: "2026-10-19" }, { from: "", to: "" },
  ]) expect(dateRangeSchema.safeParse(input).success).toBe(false);
});

test("search supports partial plate input and existing status/type literals", () => {
  expect(parkingSearchSchema.parse({ search: " b 12 ", type: "motor", status: "canceled" }))
    .toEqual({ search: "b 12", type: "motor", status: "canceled" });
  expect(parkingSearchSchema.parse({})).toEqual({});
  expect(parkingSearchSchema.safeParse({ tenantId: "untrusted" }).success).toBe(false);
  expect(parkingSearchSchema.safeParse({ status: "paid" }).success).toBe(false);
});

test("issue conversion exposes only allowlisted fixed reasons, not raw secrets or keys", () => {
  const schema = z.strictObject({ phone: z.string().refine(() => false, "mongodb://secret@host"), amount: positiveIdrSchema });
  const result = schema.safeParse({ phone: "private-phone", amount: 0, "secret-key": "private-value" });
  if (result.success) throw new Error("Expected validation failure");
  const fields = ["phone", "amount"];
  const normalized = normalizeError(toValidationError(result.error, fields), fields);
  expect(normalized.status).toBe(400);
  expect(normalized.body.error.fieldErrors).toEqual([
    { field: "phone", code: "INVALID", message: "Isian ini tidak valid." },
    { field: "amount", code: "TOO_SMALL", message: "Nilai isian terlalu kecil atau terlalu pendek." },
  ]);
  expect(JSON.stringify(normalized)).not.toMatch(/secret|private|mongodb/);
  expect(normalizeError(toValidationError(result.error)).body.error.fieldErrors).toBeUndefined();
});

test("conditional required paths map safely and root/nested paths stay private", () => {
  const result = checkoutSchema.safeParse({ tariffType: "overnight", paymentMethod: "qris" });
  if (result.success) throw new Error("Expected validation failure");
  expect(normalizeError(toValidationError(result.error, ["nightCount"]), ["nightCount"]).body.error.fieldErrors?.[0].code).toBe("REQUIRED");
  const nested = z.object({ nested: z.object({ secret: z.string() }) }).safeParse({ nested: { secret: 1 } });
  if (nested.success) throw new Error("Expected validation failure");
  expect(normalizeError(toValidationError(nested.error, ["nested", "nested.secret"]), ["nested"]).body.error.fieldErrors).toBeUndefined();
});

test("enum output types remain aligned with persisted unions", () => {
  expectTypeOf<z.infer<typeof vehicleTypeSchema>>().toEqualTypeOf<VehicleType>();
  expectTypeOf<z.infer<typeof tariffTypeSchema>>().toEqualTypeOf<TariffType>();
  expectTypeOf<z.infer<typeof paymentMethodSchema>>().toEqualTypeOf<PaymentMethod>();
});
