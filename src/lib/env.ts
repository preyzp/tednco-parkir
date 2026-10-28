import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  MONGODB_URI: z.string().regex(
    /^mongodb(?:\+srv)?:\/\/[^\s/?#]+(?:\/[^\s#]*)?$/,
    "must be a non-empty mongodb:// or mongodb+srv:// connection string",
  ),
  MONGODB_DB_NAME: z.string().min(1, "must not be empty").regex(
    /^[^\s/\\.\u0000"$*<>:|?]+$/,
    "must be a database name without whitespace or reserved characters",
  ).refine((value) => Buffer.byteLength(value, "utf8") < 64, {
    message: "must be shorter than 64 UTF-8 bytes",
  }),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

// Call from server runtime code when backend configuration is needed.
// No import-time validation or caching: unrelated builds need no secrets.
export function getServerEnv(): ServerEnv {
  const result = serverEnvSchema.safeParse({
    MONGODB_URI: process.env.MONGODB_URI,
    MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
  });

  if (!result.success) {
    // Never expose Zod issues or input values, which may contain credentials.
    const fields = [...new Set(result.error.issues.map((issue) => issue.path[0]))];
    throw new Error(
      `Invalid server environment: ${fields.join(", ")}. Set valid values in the deployment environment or .env.local; see .env.example.`,
    );
  }

  return result.data;
}

const authEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32).refine((value) => value.trim() === value),
  BETTER_AUTH_URL: z.url().refine((value) => {
    try {
      const url = new URL(value);
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      return !url.username && !url.password && !url.search && !url.hash && url.pathname === "/"
        && (url.protocol === "https:" || (process.env.NODE_ENV !== "production" && loopback && url.protocol === "http:"));
    } catch { return false; }
  }).transform((value) => new URL(value).origin),
});

// Optional token for the database mode of GET /api/health. Missing, blank or
// shorter than 32 characters means the database check is disabled (never an
// error, never a weak token). The value is never logged or returned.
export const HEALTHCHECK_TOKEN_MIN_LENGTH = 32;
export function getHealthcheckToken(): string | undefined {
  const value = process.env.HEALTHCHECK_TOKEN;
  return typeof value === "string" && value.trim() === value && value.length >= HEALTHCHECK_TOKEN_MIN_LENGTH ? value : undefined;
}

// Auth validation is separate: DB maintenance never needs an auth secret.
export function getAuthEnv(): z.infer<typeof authEnvSchema> {
  const result = authEnvSchema.safeParse({
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  });
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path[0]))];
    throw new Error(`Invalid authentication environment: ${fields.join(", ")}. See .env.example.`);
  }
  return result.data;
}
