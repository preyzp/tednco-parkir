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
// Add auth variables only after the authentication library is selected.
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
