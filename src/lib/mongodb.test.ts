import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  construct: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
  db: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("mongodb", () => ({
  MongoClient: class {
    constructor(...args: unknown[]) { mocks.construct(...args); }
    connect = mocks.connect;
    close = mocks.close;
    db = mocks.db;
  },
}));

const testGlobal = globalThis as typeof globalThis & { tedncoMongoDB?: unknown };

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  delete testGlobal.tedncoMongoDB;
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("MONGODB_URI", "mongodb://synthetic:password@localhost:27017");
  vi.stubEnv("MONGODB_DB_NAME", "tednco_test");
  mocks.connect.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
  mocks.db.mockReturnValue({ databaseName: "tednco_test" });
});

afterEach(() => {
  delete testGlobal.tedncoMongoDB;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("import does not validate environment, construct a client, or connect", async () => {
  vi.stubEnv("MONGODB_URI", undefined);
  await import("./mongodb");
  expect(mocks.construct).not.toHaveBeenCalled();
  expect(mocks.connect).not.toHaveBeenCalled();
});

test("validates lazily and can retry after environment is corrected", async () => {
  const { getDb } = await import("./mongodb");
  vi.stubEnv("MONGODB_DB_NAME", undefined);
  await expect(getDb()).rejects.toThrow("MONGODB_DB_NAME");
  expect(mocks.construct).not.toHaveBeenCalled();
  vi.stubEnv("MONGODB_DB_NAME", "tednco_test");
  await getDb();
  expect(mocks.connect).toHaveBeenCalledTimes(1);
});

test("concurrent calls share a pending connection and later reuse the client", async () => {
  let resolveConnect!: () => void;
  mocks.connect.mockReturnValueOnce(new Promise<void>((resolve) => { resolveConnect = resolve; }));
  const { getMongoClient, getDb } = await import("./mongodb");
  const first = getMongoClient();
  const second = getMongoClient();
  const database = getDb();
  await Promise.resolve();
  expect(mocks.construct).toHaveBeenCalledTimes(1);
  expect(mocks.connect).toHaveBeenCalledTimes(1);
  expect(mocks.db).not.toHaveBeenCalled();
  resolveConnect();
  const [a, b, db] = await Promise.all([first, second, database]);
  expect(a).toBe(b);
  expect(await getMongoClient()).toBe(a);
  expect(db).toEqual({ databaseName: "tednco_test" });
  expect(mocks.db).toHaveBeenCalledWith("tednco_test");
  expect(mocks.construct).toHaveBeenCalledWith(
    "mongodb://synthetic:password@localhost:27017", { serverSelectionTimeoutMS: 10_000 },
  );
  expect(mocks.connect).toHaveBeenCalledTimes(1);
  expect(mocks.close).not.toHaveBeenCalled();
});

test("development cache survives module reload even while connecting", async () => {
  vi.stubEnv("NODE_ENV", "development");
  let resolveConnect!: () => void;
  mocks.connect.mockReturnValueOnce(new Promise<void>((resolve) => { resolveConnect = resolve; }));
  const firstModule = await import("./mongodb");
  const first = firstModule.getMongoClient();
  await Promise.resolve();
  vi.resetModules();
  const secondModule = await import("./mongodb");
  const second = secondModule.getMongoClient();
  resolveConnect();
  expect(await first).toBe(await second);
  expect(await secondModule.getMongoClient()).toBe(await first);
  expect(mocks.construct).toHaveBeenCalledTimes(1);
});

test("production reuses its module cache without writing a global cache", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const { getMongoClient } = await import("./mongodb");
  expect(await getMongoClient()).toBe(await getMongoClient());
  expect(mocks.connect).toHaveBeenCalledTimes(1);
  expect(testGlobal.tedncoMongoDB).toBeUndefined();
});

test("production ignores a leftover development global connection", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const staleClient = { db: vi.fn() };
  const staleCache = { promise: Promise.resolve({ client: staleClient, dbName: "stale_test" }) };
  testGlobal.tedncoMongoDB = staleCache;
  const { getDb, getMongoClient } = await import("./mongodb");
  expect(await getMongoClient()).not.toBe(staleClient);
  await getDb();
  expect(mocks.construct).toHaveBeenCalledOnce();
  expect(mocks.connect).toHaveBeenCalledOnce();
  expect(mocks.db).toHaveBeenCalledWith("tednco_test");
  expect(staleClient.db).not.toHaveBeenCalled();
  expect(testGlobal.tedncoMongoDB).toBe(staleCache);
});

test("successful connections keep the configured database until restart", async () => {
  const { getDb } = await import("./mongodb");
  await getDb();
  vi.stubEnv("MONGODB_URI", "mongodb://other-host:27017");
  vi.stubEnv("MONGODB_DB_NAME", "other_database");
  await getDb();
  expect(mocks.db).toHaveBeenLastCalledWith("tednco_test");
  expect(mocks.construct).toHaveBeenCalledTimes(1);
});

test.each(["constructor", "connect", "cleanup"])("sanitizes %s failures and permits retry", async (stage) => {
  const secretError = new Error("mongodb://synthetic:password@private-host/secret");
  if (stage === "constructor") mocks.construct.mockImplementationOnce(() => { throw secretError; });
  else mocks.connect.mockRejectedValueOnce(secretError);
  if (stage === "cleanup") mocks.close.mockRejectedValueOnce(secretError);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { getMongoClient } = await import("./mongodb");
  const results = await Promise.allSettled([getMongoClient(), getMongoClient()]);
  for (const result of results) {
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") {
      expect(result.reason).toEqual(new Error("Unable to connect to MongoDB. Check server database configuration and availability."));
      expect(result.reason.cause).toBeUndefined();
    }
  }
  expect(mocks.close).toHaveBeenCalledTimes(stage === "constructor" ? 0 : 1);
  await getMongoClient();
  expect(mocks.construct).toHaveBeenCalledTimes(2);
  expect(log).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});

test.each(["development", "production"])("%s waits for failed-client cleanup before concurrent retry", async (mode) => {
  vi.stubEnv("NODE_ENV", mode);
  let finishCleanup!: () => void;
  mocks.connect.mockRejectedValueOnce(new Error("synthetic failure"));
  mocks.close.mockReturnValueOnce(new Promise<void>((resolve) => { finishCleanup = resolve; }));
  const firstModule = await import("./mongodb");
  const first = firstModule.getMongoClient();
  const observed = Promise.allSettled([first]);
  await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
  // HMR must preserve the in-flight failure/cleanup instead of opening a pool.
  if (mode === "development") vi.resetModules();
  const currentModule = await import("./mongodb");
  const second = currentModule.getMongoClient();
  const both = Promise.allSettled([first, second]);
  expect(mocks.construct).toHaveBeenCalledTimes(1);
  finishCleanup();
  expect((await observed)[0].status).toBe("rejected");
  expect((await both).map(({ status }) => status)).toEqual(["rejected", "rejected"]);
  const [a, b] = await Promise.all([currentModule.getMongoClient(), currentModule.getMongoClient()]);
  expect(a).toBe(b);
  expect(mocks.construct).toHaveBeenCalledTimes(2);
  expect(mocks.connect).toHaveBeenCalledTimes(2);
  expect(mocks.close).toHaveBeenCalledTimes(1);
});
