import "server-only";
import { getSchema } from "better-auth/db";
import type { IndexDescription } from "mongodb";
import { authSchemaOptions } from "./auth-schema";
import { getDb } from "./mongodb";

export function authenticationIndexDefinitions(): Record<string, IndexDescription[]> {
  const definitions: Record<string, IndexDescription[]> = Object.fromEntries(Object.entries(getSchema(authSchemaOptions)).map(([name, table]) => [
    name,
    (table.indexes ?? []).map((index) => ({
      name: index.name,
      key: Object.fromEntries(index.columns.map((field) => [field === "id" ? "_id" : field, 1])),
      unique: index.unique ?? false,
    })),
  ]));
  // 1.7.13 exposes this uniqueness as field metadata, not a table index.
  // Its Mongo adapter only auto-creates table indexes; provision before use.
  definitions.authRateLimits = [{ name: "auth_rate_limits_key_unique", key: { key: 1 }, unique: true }];
  return definitions;
}

// Explicit privileged maintenance only. Never invoked by auth/routes/startup.
// Names/options match the pinned adapter's own first-write index setup.
export async function setupAuthenticationIndexes(): Promise<void> {
  try {
    const db = await getDb();
    for (const [name, definitions] of Object.entries(authenticationIndexDefinitions())) {
      if (definitions.length) await db.collection(name).createIndexes(definitions);
    }
  } catch {
    throw new Error("Authentication index setup failed. Review database indexes securely before retrying.");
  }
}
