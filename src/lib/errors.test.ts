import { MongoServerError } from "mongodb";
import { z } from "zod";
import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { AppError, normalizeError, type ErrorCode, type FieldIssue } from "./errors";

test.each<[ErrorCode, number]>([
  ["VALIDATION_ERROR", 400], ["UNAUTHENTICATED", 401], ["FORBIDDEN", 403],
  ["RESOURCE_NOT_FOUND", 404], ["CONFLICT", 409], ["BUSINESS_RULE_VIOLATION", 422],
  ["SERVICE_UNAVAILABLE", 503], ["INTERNAL_ERROR", 500],
])("normalizes %s with HTTP %i and a fixed Indonesian message", (code, status) => {
  const error = new AppError(code);
  expect(error).toBeInstanceOf(Error);
  const normalized = normalizeError(error);
  expect(normalized).toEqual({ status, body: { ok: false, error: { code, message: error.message } } });
  expect(normalized.body.error.message.length).toBeGreaterThan(10);
  expect(JSON.parse(JSON.stringify(normalized))).toEqual(normalized);
  expect(normalized.body.error).not.toHaveProperty("stack");
});

test.each([
  undefined, null, "mongodb://secret:password@host", 11000,
  { code: "CONFLICT", message: "private duplicate email", status: 409 },
  Object.assign(new Error("secret token"), { code: "VALIDATION_ERROR", cause: "secret cause" }),
  new MongoServerError({ message: "E11000 email=private@example.test mongodb://secret@host", code: 11000 }),
  new MongoServerError({ message: "auth failed; password=secret", code: 18 }),
])("unknown errors never expose arbitrary properties (%#)", (error) => {
  expect(normalizeError(error)).toEqual(normalizeError(new AppError("INTERNAL_ERROR")));
});

test("raw Zod errors do not expose messages or input values", () => {
  const result = z.string().refine(() => false, "secret input mongodb://credentials@host").safeParse("private@example.test");
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(normalizeError(result.error)).toEqual(normalizeError(new AppError("INTERNAL_ERROR")));
  }
});

test("unknown database commit outcomes and nested causes never imply success or a safe retry", () => {
  const error = new MongoServerError({
    message: "mongodb://synthetic:secret@host; unknown commit result",
    code: 91,
    errorLabels: ["UnknownTransactionCommitResult"],
  });
  Object.assign(error, { cause: new Error("private credential"), keyValue: { email: "private@example.test" } });
  const result = normalizeError(error);
  expect(result.status).toBe(500);
  expect(result.body.ok).toBe(false);
  expect(result.body.error.code).toBe("INTERNAL_ERROR");
  expect(JSON.stringify(result)).not.toMatch(/mongodb|secret|private|cause|stack|retry|errorLabels/);
});

test("only allowlisted field paths and fixed reasons appear in validation responses", () => {
  const error = new AppError("VALIDATION_ERROR", [
    { field: "plateNumber", code: "REQUIRED" },
    { field: "nightCount", code: "INVALID" },
    { field: "password=secret", code: "INVALID" },
  ]);
  expect(normalizeError(error).body.error).not.toHaveProperty("fieldErrors");
  expect(normalizeError(error, ["plateNumber", "nightCount"]).body.error.fieldErrors).toEqual([
    { field: "plateNumber", code: "REQUIRED", message: "Isian ini wajib diisi." },
    { field: "nightCount", code: "INVALID", message: "Isian ini tidak valid." },
  ]);
});

test("invalid runtime issue codes and attached sensitive values are discarded", () => {
  const fields = [
    { field: "phone", code: "INVALID", value: "private-phone", message: "secret" },
    { field: "phone", code: "secret-as-code" },
  ];
  const error = new AppError("VALIDATION_ERROR", fields as FieldIssue[]);
  const serialized = JSON.stringify(normalizeError(error, ["phone"]));
  expect(serialized).not.toContain("private-phone");
  expect(serialized).not.toContain("secret");
  expect(normalizeError(error, ["phone"]).body.error.fieldErrors).toHaveLength(1);
});

test.each(["TOO_SMALL", "TOO_LARGE"] as const)("renders %s without dynamic values", (code) => {
  const error = new AppError("VALIDATION_ERROR", [{ field: "amount", code }]);
  expect(normalizeError(error, ["amount"]).body.error.fieldErrors?.[0]).toEqual({
    field: "amount", code, message: code === "TOO_SMALL"
      ? "Nilai isian terlalu kecil atau terlalu pendek."
      : "Nilai isian terlalu besar atau terlalu panjang.",
  });
});

test("mutating public Error fields or input issue objects cannot alter safe metadata", () => {
  const fields: FieldIssue[] = [{ field: "plateNumber", code: "REQUIRED" }];
  const error = new AppError("VALIDATION_ERROR", fields);
  fields[0] = { field: "secret", code: "INVALID" };
  Object.assign(error, {
    code: "CONFLICT", message: "mongodb://secret@host", stack: "private stack",
    cause: new Error("secret cause"), fieldErrors: [{ field: "secret" }],
  });
  const result = normalizeError(error, ["plateNumber"]);
  expect(result.status).toBe(400);
  expect(result.body.error.code).toBe("VALIDATION_ERROR");
  expect(result.body.error.fieldErrors?.[0].field).toBe("plateNumber");
  expect(JSON.stringify(result)).not.toMatch(/secret|stack|cause|mongodb/);
});

test("known nonvalidation failures cannot carry field details", () => {
  expect(normalizeError(new AppError("FORBIDDEN", [{ field: "secret", code: "INVALID" }]), ["secret"])
    .body.error).not.toHaveProperty("fieldErrors");
});

test("forged prototypes and hostile unknown objects are not inspected", () => {
  const hostile = new Proxy({}, { get() { throw new Error("must not inspect unknown errors"); } });
  expect(normalizeError(hostile).status).toBe(500);
  expect(normalizeError(Object.create(AppError.prototype)).status).toBe(500);
});

test("invalid runtime error codes fail closed", () => {
  expect(normalizeError(new AppError("__proto__" as ErrorCode)).status).toBe(500);
});

test("normalization emits no logs and every financial error remains a failure", () => {
  const spies = (["log", "error", "warn", "info", "debug"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}));
  try {
    const error = new Error("unknown commit result; mongodb://secret@host");
    expect(normalizeError(error).body.ok).toBe(false);
    expect(normalizeError(new AppError("SERVICE_UNAVAILABLE")).body.ok).toBe(false);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
  }
});
