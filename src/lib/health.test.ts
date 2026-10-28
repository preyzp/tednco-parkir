import { MongoNetworkError, MongoOperationTimeoutError, MongoServerError } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: vi.fn(), command: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./mongodb", () => ({ getDb: mocks.db }));
import { checkDatabaseHealth, healthCacheTtlMS, healthPingTimeoutMS, healthTokenMatches, resetHealthCacheForTests } from "./health";

const token = "t".repeat(40);
let clock = 1_000_000;
const now = () => clock;
let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks(); resetHealthCacheForTests(); clock = 1_000_000;
  vi.stubEnv("MONGODB_URI", "mongodb+srv://synthetic-user:synthetic-pass@cluster0.example.mongodb.net");
  vi.stubEnv("MONGODB_DB_NAME", "synthetic_db");
  vi.stubEnv("HEALTHCHECK_TOKEN", token);
  mocks.db.mockResolvedValue({ command: mocks.command });
  mocks.command.mockResolvedValue({ ok: 1 });
  logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); logSpy.mockRestore(); });

describe("checkDatabaseHealth", () => {
  it("pings once through the shared client with a driver-enforced timeout (~2.5 s)", async () => {
    expect(await checkDatabaseHealth(now)).toEqual({ healthy: true, database: "ok" });
    expect(mocks.command).toHaveBeenCalledWith({ ping: 1 }, { timeoutMS: healthPingTimeoutMS });
    expect(healthPingTimeoutMS).toBeGreaterThanOrEqual(2_000); expect(healthPingTimeoutMS).toBeLessThanOrEqual(3_000);
  });
  it.each([
    ["ping timeout", () => mocks.command.mockRejectedValue(new MongoOperationTimeoutError("synthetic-pass timed out")), "timeout"],
    ["network error", () => mocks.command.mockRejectedValue(new MongoNetworkError("synthetic-pass refused")), "unreachable"],
    ["server error", () => mocks.command.mockRejectedValue(new MongoServerError({ message: "synthetic-pass", code: 13 })), "error"],
    ["connection never established", () => mocks.db.mockRejectedValue(new Error("Unable to connect to MongoDB.")), "unreachable"],
  ] as const)("%s → unhealthy (%s), logged once without secrets", async (_label, arrange, database) => {
    arrange();
    expect(await checkDatabaseHealth(now)).toEqual({ healthy: false, database });
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(String(logSpy.mock.calls[0][0])).not.toMatch(/synthetic|cluster0|refused|timed out/);
  });
  it("invalid server configuration is reported as config without touching the database", async () => {
    vi.stubEnv("MONGODB_URI", "");
    expect(await checkDatabaseHealth(now)).toEqual({ healthy: false, database: "config" });
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("caches the result for ~30 s (healthy and unhealthy) so monitoring cannot load Atlas M0", async () => {
    await checkDatabaseHealth(now); await checkDatabaseHealth(now);
    clock += healthCacheTtlMS - 1; await checkDatabaseHealth(now);
    expect(mocks.command).toHaveBeenCalledTimes(1);
    clock += 1; mocks.command.mockRejectedValue(new MongoNetworkError("x"));
    expect(await checkDatabaseHealth(now)).toMatchObject({ healthy: false });
    expect(await checkDatabaseHealth(now)).toMatchObject({ healthy: false });
    expect(mocks.command).toHaveBeenCalledTimes(2);
  });
  it("concurrent checks share one in-flight ping", async () => {
    let finish!: () => void;
    mocks.command.mockReturnValue(new Promise((resolve) => { finish = () => resolve({ ok: 1 }); }));
    const results = Promise.all([checkDatabaseHealth(now), checkDatabaseHealth(now), checkDatabaseHealth(now)]);
    await vi.waitFor(() => expect(mocks.command).toHaveBeenCalledTimes(1));
    finish();
    expect((await results).every((result) => result.healthy)).toBe(true);
    expect(mocks.command).toHaveBeenCalledTimes(1);
  });
});

describe("healthTokenMatches", () => {
  it("accepts only the exact configured token", () => {
    expect(healthTokenMatches(token)).toBe(true);
    for (const wrong of ["", "t", "t".repeat(39), "t".repeat(41), `${token} `, "T".repeat(40)]) expect(healthTokenMatches(wrong)).toBe(false);
  });
  it.each([["missing", undefined], ["blank", ""], ["shorter than 32", "s".repeat(31)], ["with surrounding spaces", ` ${"s".repeat(40)} `]])("is disabled when the token is %s", (_label, value) => {
    if (value === undefined) vi.stubEnv("HEALTHCHECK_TOKEN", undefined as unknown as string); else vi.stubEnv("HEALTHCHECK_TOKEN", value);
    expect(healthTokenMatches(value ?? "")).toBe(false);
    expect(healthTokenMatches("")).toBe(false);
  });
});
