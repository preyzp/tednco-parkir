import { afterEach, expect, test, vi } from "vitest";

// Next.js enforces this boundary; Vitest runs outside its server runtime.
vi.mock("server-only", () => ({}));

import { getServerEnv } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

function setValidEnv() {
  vi.stubEnv("MONGODB_URI", "mongodb+srv://user:synthetic-password@cluster.example.test/");
  vi.stubEnv("MONGODB_DB_NAME", "tednco_parkir_test");
}

test.each([
  "mongodb://localhost:27017",
  "mongodb://host1:27017,host2:27017/test?replicaSet=rs0",
  "mongodb+srv://user:synthetic-password@cluster.example.test/",
])("accepts valid configuration: %s", (uri) => {
  setValidEnv();
  vi.stubEnv("MONGODB_URI", uri);
  expect(getServerEnv()).toEqual({
    MONGODB_URI: uri,
    MONGODB_DB_NAME: "tednco_parkir_test",
  });
});

test.each(["MONGODB_URI", "MONGODB_DB_NAME"])("rejects missing %s", (key) => {
  setValidEnv();
  vi.stubEnv(key, undefined);
  expect(() => getServerEnv()).toThrow(key);
});

test.each([
  ["MONGODB_URI", ""],
  ["MONGODB_URI", "   "],
  ["MONGODB_URI", "https://example.test"],
  ["MONGODB_URI", "mongodb://"],
  ["MONGODB_URI", "mongodb://host with spaces"],
  ["MONGODB_DB_NAME", ""],
  ["MONGODB_DB_NAME", "   "],
  ["MONGODB_DB_NAME", "invalid/name"],
  ["MONGODB_DB_NAME", "a".repeat(64)],
  ["MONGODB_DB_NAME", "é".repeat(32)],
])("rejects invalid %s (%s)", (key, value) => {
  setValidEnv();
  vi.stubEnv(key, value);
  expect(() => getServerEnv()).toThrow(key);
});

test("reports all invalid fields without exposing secrets or logging", () => {
  vi.stubEnv("MONGODB_URI", "invalid://synthetic-secret@example.test");
  vi.stubEnv("MONGODB_DB_NAME", "invalid/secret-db");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(() => getServerEnv()).toThrow(
      "Invalid server environment: MONGODB_URI, MONGODB_DB_NAME. Set valid values in the deployment environment or .env.local; see .env.example.",
    );
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
  }
});

test("import is lazy and subsequent calls read the current environment", async () => {
  vi.stubEnv("MONGODB_URI", undefined);
  vi.stubEnv("MONGODB_DB_NAME", undefined);
  vi.resetModules();
  const env = await import("./env");
  expect(() => env.getServerEnv()).toThrow("MONGODB_URI");
  setValidEnv();
  expect(env.getServerEnv().MONGODB_DB_NAME).toBe("tednco_parkir_test");
  vi.stubEnv("MONGODB_DB_NAME", "another_test");
  expect(env.getServerEnv().MONGODB_DB_NAME).toBe("another_test");
});
