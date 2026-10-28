import "server-only";
import { unstable_rethrow } from "next/navigation";

// Structured server log for operational failures (database unreachable,
// timeouts, ambiguous commits). Only allowlisted, non-sensitive facts are
// written: the operation, a coarse category, the error class, a numeric server
// code, a server code name and driver labels. Never a message, stack, cause
// message, URI, host, credential, user input or tenant data. Log once, in the
// layer that sees the raw error.

export type OperationName =
  | "vehicle.entry" | "parking.checkout" | "location.settings.update" | "index.verify" | "health.database"
  // Read paths (P4.7 D): session/guard lookups and the Owner read models.
  | "auth.session" | "auth.guard" | "dashboard.read" | "vehicles.read" | "checkout.read" | "settings.read";
export type ErrorCategory = "timeout" | "network" | "server" | "config" | "unknown";
export interface OperationalDetails {
  // unavailable: definitely not done; unknown: may have been committed;
  // resolved: the committed result was found afterwards.
  readonly outcome: "unavailable" | "unknown" | "resolved";
  readonly phase?: "connect" | "index" | "transaction" | "lookup" | "ping" | "read";
  readonly collection?: "parkingSessions" | "parkingTransactions" | "tariffs";
}

const timeoutClasses = new Set(["MongoOperationTimeoutError", "MongoNetworkTimeoutError", "MongoServerSelectionError"]);
const networkClasses = new Set(["MongoNetworkError", "MongoTopologyClosedError", "MongoNotConnectedError", "MongoServerClosedError", "MongoStalePrimaryError"]);
const serverClasses = new Set(["MongoServerError", "MongoWriteConcernError", "MongoBulkWriteError"]);
const knownClasses = new Set([...timeoutClasses, ...networkClasses, ...serverClasses, "MongoRuntimeError", "MongoTransactionError", "MongoInvalidArgumentError", "MongoExpiredSessionError", "AppError", "TypeError", "Error"]);
const safeName = /^[A-Za-z][A-Za-z0-9]{0,63}$/;

function own(error: object, key: string): unknown {
  try { return (error as Record<string, unknown>)[key]; } catch { return undefined; }
}
function errorClass(error: unknown): string {
  if (typeof error !== "object" || error === null) return "NonError";
  const name = own(error, "name");
  return typeof name === "string" && knownClasses.has(name) ? name : "Other";
}

/** Coarse category from the error class only (never from its message). */
export function categorizeError(error: unknown): ErrorCategory {
  const name = errorClass(error);
  // Server selection fails after waiting for a usable server: report it as a timeout.
  if (timeoutClasses.has(name)) return "timeout";
  if (networkClasses.has(name)) return "network";
  if (serverClasses.has(name)) return "server";
  return "unknown";
}

// Next.js control flow (prerender interruption of headers()/cookies(),
// redirect, notFound, dynamic bailout) is not an outage. Detection only: the
// caller's own error handling is unchanged.
function isNextControlFlow(error: unknown): boolean {
  try { unstable_rethrow(error); return false; } catch { return true; }
}

export function logOperationalError(operation: OperationName, error: unknown, details: OperationalDetails): void {
  if (isNextControlFlow(error)) return;
  const entry: Record<string, unknown> = { level: "error", event: "operational_error", operation, ...details, category: categorizeError(error), errorClass: errorClass(error) };
  if (typeof error === "object" && error !== null) {
    const code = own(error, "code");
    if (typeof code === "number" && Number.isSafeInteger(code)) entry.code = code;
    const codeName = own(error, "codeName");
    if (typeof codeName === "string" && safeName.test(codeName)) entry.codeName = codeName;
    const labels = own(error, "errorLabels");
    if (Array.isArray(labels)) {
      const safe = labels.filter((label): label is string => typeof label === "string" && safeName.test(label)).slice(0, 10);
      if (safe.length) entry.labels = safe;
    }
    const cause = own(error, "cause");
    if (cause !== undefined) entry.causeClass = errorClass(cause);
  }
  try { console.error(JSON.stringify(entry)); } catch { /* logging must never break the request */ }
}
