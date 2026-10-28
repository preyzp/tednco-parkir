import { MongoNetworkError } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: vi.fn(), command: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../lib/mongodb", () => ({ getDb: mocks.db }));
import { resetHealthCacheForTests } from "../../../lib/health";
import { GET } from "./route";

const token = "h".repeat(48);
const request = (headers: Record<string, string> = {}) => new Request("http://localhost:3000/api/health", { headers });
const sensitive = /synthetic|cluster0|mongodb|tednco_parkir|example\.mongodb|refused/i;
beforeEach(() => {
  vi.resetAllMocks(); resetHealthCacheForTests();
  vi.stubEnv("MONGODB_URI", "mongodb+srv://synthetic-user:synthetic-pass@cluster0.example.mongodb.net");
  vi.stubEnv("MONGODB_DB_NAME", "tednco_parkir_provision_dev");
  vi.stubEnv("HEALTHCHECK_TOKEN", token);
  mocks.db.mockResolvedValue({ command: mocks.command });
  mocks.command.mockResolvedValue({ ok: 1 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function read(response: Response) {
  const text = await response.text();
  expect(text).not.toMatch(sensitive);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return { status: response.status, body: JSON.parse(text) as Record<string, unknown> };
}

describe("GET /api/health", () => {
  it("liveness without a token: {status: ok}, never touches the database", async () => {
    expect(await read(await GET(request()))).toEqual({ status: 200, body: { status: "ok" } });
    vi.stubEnv("HEALTHCHECK_TOKEN", undefined as unknown as string);
    expect(await read(await GET(request()))).toEqual({ status: 200, body: { status: "ok" } });
    expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.command).not.toHaveBeenCalled();
  });
  it("the correct token gets the database status: healthy → 200", async () => {
    expect(await read(await GET(request({ "x-health-token": token })))).toEqual({ status: 200, body: { status: "healthy", database: "ok" } });
    expect(mocks.command).toHaveBeenCalledTimes(1);
  });
  it("unhealthy → 503 with a coarse category only", async () => {
    mocks.command.mockRejectedValue(new MongoNetworkError("synthetic-pass connection refused at cluster0.example.mongodb.net"));
    expect(await read(await GET(request({ "x-health-token": token })))).toEqual({ status: 503, body: { status: "unhealthy", database: "unreachable" } });
  });
  it.each([["a wrong token", "x".repeat(48)], ["an empty token", ""], ["a prefix of the token", token.slice(0, 47)]])("%s gets 401 and no health data, without a ping", async (_label, value) => {
    expect(await read(await GET(request({ "x-health-token": value })))).toEqual({ status: 401, body: { status: "unauthorized" } });
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("when HEALTHCHECK_TOKEN is not configured the database mode is disabled (same 401 as a wrong token)", async () => {
    vi.stubEnv("HEALTHCHECK_TOKEN", "");
    expect(await read(await GET(request({ "x-health-token": "" })))).toEqual({ status: 401, body: { status: "unauthorized" } });
    expect(await read(await GET(request({ "x-health-token": token })))).toEqual({ status: 401, body: { status: "unauthorized" } });
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("repeated authorized checks within the cache window ping Atlas only once", async () => {
    for (let index = 0; index < 5; index++) await GET(request({ "x-health-token": token }));
    expect(mocks.command).toHaveBeenCalledTimes(1);
  });
});
