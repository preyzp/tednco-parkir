import { MongoNetworkError, MongoNetworkTimeoutError, MongoOperationTimeoutError, MongoServerError } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AppError } from "./errors";
import { categorizeError, logOperationalError } from "./log";

const secrets = ["mongodb+srv://synthetic-user:synthetic-pass@cluster0.example.mongodb.net", "synthetic-secret", "tednco_parkir_provision_dev", "B 1234 XYZ", "owner@example.test"];
let spy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { spy = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => spy.mockRestore());
const lastEntry = () => JSON.parse(String(spy.mock.calls.at(-1)?.[0])) as Record<string, unknown>;
const raw = () => spy.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n");

describe("logOperationalError", () => {
  it("writes one structured line with only allowlisted facts", () => {
    const error = new MongoServerError({ message: `E11000 ${secrets.join(" ")}`, code: 91, codeName: "ShutdownInProgress", errorLabels: ["RetryableWriteError", "TransientTransactionError"] });
    logOperationalError("parking.checkout", error, { outcome: "unknown", phase: "transaction" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(lastEntry()).toEqual({ level: "error", event: "operational_error", operation: "parking.checkout", outcome: "unknown", phase: "transaction", category: "server", errorClass: "MongoServerError", code: 91, codeName: "ShutdownInProgress", labels: ["RetryableWriteError", "TransientTransactionError"] });
  });
  it("never writes the message, stack, cause message, URI, database name, input or tenant data", () => {
    const cause = new MongoNetworkError(`connect ECONNREFUSED ${secrets.join(" ")}`);
    const error = new MongoOperationTimeoutError(`Timed out ${secrets.join(" ")}`, { cause });
    Object.assign(error, { connectionString: secrets[0], input: { plateNumber: secrets[3] } });
    logOperationalError("vehicle.entry", error, { outcome: "unavailable" });
    for (const secret of [...secrets, "ECONNREFUSED", "Timed out", "at "]) expect(raw()).not.toContain(secret);
    expect(lastEntry()).toMatchObject({ category: "timeout", errorClass: "MongoOperationTimeoutError", causeClass: "MongoNetworkError" });
  });
  it("drops unsafe code names, labels and unknown class names instead of echoing them", () => {
    const error = Object.assign(new Error("x"), { name: `Evil ${secrets[1]}`, code: "E-not-a-number", codeName: `bad name ${secrets[1]}`, errorLabels: [`label ${secrets[1]}`, 42, "ResetPool"] });
    logOperationalError("location.settings.update", error, { outcome: "unknown" });
    expect(lastEntry()).toEqual({ level: "error", event: "operational_error", operation: "location.settings.update", outcome: "unknown", category: "unknown", errorClass: "Other", labels: ["ResetPool"] });
    expect(raw()).not.toContain(secrets[1]);
  });
  it("handles non-errors, throwing getters and console failures without throwing", () => {
    logOperationalError("health.database", "synthetic-secret string", { outcome: "unavailable" });
    expect(lastEntry()).toMatchObject({ errorClass: "NonError", category: "unknown" });
    const hostile = new Proxy({}, { get() { throw new Error("synthetic-secret getter"); } });
    expect(() => logOperationalError("index.verify", hostile, { outcome: "unavailable", collection: "tariffs" })).not.toThrow();
    spy.mockImplementation(() => { throw new Error("console broken"); });
    expect(() => logOperationalError("index.verify", new Error("x"), { outcome: "unavailable" })).not.toThrow();
  });
});

describe("Next.js control flow is not an outage", () => {
  it("does not log a prerender interruption (headers() during build), redirect or notFound", async () => {
    const { redirect, notFound } = await import("next/navigation");
    const caught = (run: () => void) => { try { run(); } catch (error) { return error; } };
    const hanging = Object.assign(new Error("During prerendering, `headers()` rejects when the prerender is complete."), { digest: "HANGING_PROMISE_REJECTION" });
    for (const error of [hanging, caught(() => redirect("/login")), caught(() => notFound())]) logOperationalError("auth.session", error, { outcome: "unavailable" });
    expect(spy).not.toHaveBeenCalled();
    logOperationalError("auth.session", new Error("real outage"), { outcome: "unavailable" });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("categorizeError (class only, never the message)", () => {
  it.each([
    [new MongoOperationTimeoutError("network down"), "timeout"],
    [new MongoNetworkTimeoutError("server error"), "timeout"],
    [new MongoNetworkError("timeout"), "network"],
    [new MongoServerError({ message: "network timeout" }), "server"],
    [new AppError("SERVICE_UNAVAILABLE"), "unknown"],
    [new Error("MongoNetworkError"), "unknown"],
  ] as const)("%s → %s", (error, category) => {
    expect(categorizeError(error)).toBe(category);
  });
});
