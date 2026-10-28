import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { getHealthcheckToken, getServerEnv } from "./env";
import { categorizeError, logOperationalError } from "./log";
import { getDb } from "./mongodb";

// Database health for GET /api/health (token mode). One MongoDB ping through
// the shared client, bounded by the driver itself: the ping has a CSOT
// timeoutMS; a not-yet-connected client first connects, bounded by
// serverSelectionTimeoutMS (5 s, see mongodb.ts). No Promise.race, so nothing
// keeps running after the answer. Results are cached briefly and concurrent
// checks share one ping so monitoring cannot load Atlas M0.

export type DatabaseStatus = "ok" | "timeout" | "unreachable" | "config" | "error";
export interface DatabaseHealth { readonly healthy: boolean; readonly database: DatabaseStatus }

export const healthPingTimeoutMS = 2_500;
export const healthCacheTtlMS = 30_000;

let cached: { readonly at: number; readonly result: DatabaseHealth } | undefined;
let inFlight: Promise<DatabaseHealth> | undefined;

async function ping(): Promise<DatabaseHealth> {
  try {
    getServerEnv();
  } catch {
    return { healthy: false, database: "config" };
  }
  let phase: "connect" | "ping" = "connect";
  try {
    const db = await getDb();
    phase = "ping";
    await db.command({ ping: 1 }, { timeoutMS: healthPingTimeoutMS });
    return { healthy: true, database: "ok" };
  } catch (error) {
    logOperationalError("health.database", error, { outcome: "unavailable", phase });
    // getDb() hides driver errors behind a generic one: a failed connect is "unreachable".
    const category = phase === "connect" ? "network" : categorizeError(error);
    return { healthy: false, database: category === "timeout" ? "timeout" : category === "network" ? "unreachable" : "error" };
  }
}

export async function checkDatabaseHealth(now: () => number = Date.now): Promise<DatabaseHealth> {
  if (cached && now() - cached.at < healthCacheTtlMS) return cached.result;
  inFlight ??= ping().then((result) => {
    cached = { at: now(), result };
    return result;
  }).finally(() => { inFlight = undefined; });
  return inFlight;
}

/** Constant-time token check: both sides are hashed first, so neither the
 * length nor a prefix of the configured token leaks through timing. */
export function healthTokenMatches(provided: string): boolean {
  const configured = getHealthcheckToken();
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  const equal = timingSafeEqual(digest(provided), digest(configured ?? ""));
  return configured !== undefined && equal;
}

/** Test hook: forget the cached result. */
export function resetHealthCacheForTests(): void { cached = undefined; inFlight = undefined; }
