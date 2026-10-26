import "server-only";

import type { z } from "zod";
import { AppError, type FieldErrorCode, type FieldIssue } from "../errors";

/** Only expose statically allowlisted schema field names. Never copy raw
 * issue messages, input, unknown keys, enum values, limits, or nested paths. */
export function toValidationError(error: z.ZodError, publicFields: readonly string[] = []): AppError {
  const allowed = new Set(publicFields);
  const fields: FieldIssue[] = [];
  for (const issue of error.issues) {
    if (issue.path.length !== 1 || typeof issue.path[0] !== "string" || !allowed.has(issue.path[0])) continue;
    let code: FieldErrorCode = "INVALID";
    if (issue.code === "too_small") code = "TOO_SMALL";
    if (issue.code === "too_big") code = "TOO_LARGE";
    if (issue.code === "custom" && issue.params?.fieldErrorCode === "REQUIRED") code = "REQUIRED";
    if (!fields.some((field) => field.field === issue.path[0] && field.code === code)) {
      fields.push({ field: issue.path[0], code });
    }
  }
  return new AppError("VALIDATION_ERROR", fields);
}
