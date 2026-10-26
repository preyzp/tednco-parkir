import "server-only";

const errorCatalog = {
  VALIDATION_ERROR: { status: 400, message: "Data yang diberikan tidak valid. Periksa kembali isian Anda." },
  UNAUTHENTICATED: { status: 401, message: "Silakan masuk untuk melanjutkan." },
  FORBIDDEN: { status: 403, message: "Anda tidak memiliki izin untuk melakukan tindakan ini." },
  RESOURCE_NOT_FOUND: { status: 404, message: "Data tidak ditemukan." },
  CONFLICT: { status: 409, message: "Data bertentangan dengan kondisi saat ini. Periksa status operasi sebelum mengulangi." },
  BUSINESS_RULE_VIOLATION: { status: 422, message: "Tindakan tidak dapat diproses karena tidak memenuhi ketentuan bisnis." },
  SERVICE_UNAVAILABLE: { status: 503, message: "Layanan sementara tidak tersedia. Periksa status operasi sebelum mengulangi." },
  INTERNAL_ERROR: { status: 500, message: "Terjadi kesalahan pada sistem. Periksa status operasi sebelum mengulangi." },
} as const;

const fieldMessages = {
  REQUIRED: "Isian ini wajib diisi.",
  INVALID: "Isian ini tidak valid.",
  TOO_SMALL: "Nilai isian terlalu kecil atau terlalu pendek.",
  TOO_LARGE: "Nilai isian terlalu besar atau terlalu panjang.",
} as const;

export type ErrorCode = keyof typeof errorCatalog;
export type FieldErrorCode = keyof typeof fieldMessages;
export interface FieldIssue {
  readonly field: string;
  readonly code: FieldErrorCode;
}

interface ErrorDetails {
  code: ErrorCode;
  fields: FieldIssue[];
}

// Only errors created here are recognized. Do not trust duck-typed client/driver
// properties, mutable public Error.message/code, stack, or cause.
const details = new WeakMap<object, ErrorDetails>();

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, fields: readonly FieldIssue[] = []) {
    const safeCode = typeof code === "string" && Object.hasOwn(errorCatalog, code) ? code : "INTERNAL_ERROR";
    super(errorCatalog[safeCode].message);
    this.name = "AppError";
    this.code = safeCode;
    details.set(this, {
      code: safeCode,
      // Snapshot only known issue codes; no input values or arbitrary messages.
      fields: safeCode === "VALIDATION_ERROR" ? fields
        .filter((issue) => typeof issue.field === "string" && typeof issue.code === "string" && Object.hasOwn(fieldMessages, issue.code))
        .map(({ field, code }) => ({ field, code })) : [],
    });
  }
}

export interface ClientErrorBody {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    fieldErrors?: { field: string; code: FieldErrorCode; message: string }[];
  };
}

export interface NormalizedError {
  status: (typeof errorCatalog)[ErrorCode]["status"];
  body: ClientErrorBody;
}

/** publicFields must be a static server-defined allowlist, never request input.
 * Defaults to no exposed field paths. Does not log, retry or execute work. */
export function normalizeError(error: unknown, publicFields: readonly string[] = []): NormalizedError {
  const known = typeof error === "object" && error !== null ? details.get(error) : undefined;
  const code = known?.code ?? "INTERNAL_ERROR";
  const { status, message } = errorCatalog[code];
  const body: ClientErrorBody = { ok: false, error: { code, message } };
  const allowed = new Set(publicFields);
  const fieldErrors = known?.fields
    .filter(({ field }) => allowed.has(field))
    .map(({ field, code }) => ({ field, code, message: fieldMessages[code] }));
  if (fieldErrors?.length) body.error.fieldErrors = fieldErrors;
  return { status, body };
}
