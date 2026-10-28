import { MongoNetworkError, MongoNetworkTimeoutError, MongoOperationTimeoutError, MongoServerError } from "mongodb";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { hasUniquePartialIndex } from "./index-verification";
import type { Db } from "mongodb";

const index = { key: { tenantId: 1, plate: 1 }, partialFilterExpression: { status: "active" } } as const;
const dbWith = (listIndexes: () => Promise<unknown[]>) => ({ collection: vi.fn(() => ({ listIndexes: () => ({ toArray: listIndexes }) })) }) as unknown as Db & { collection: ReturnType<typeof vi.fn> };
const exact = { name: "x", key: { tenantId: 1, plate: 1 }, unique: true, partialFilterExpression: { status: "active" } };

describe("hasUniquePartialIndex (read-only)", () => {
  it("is true only for the exact unique partial index of the named collection", async () => {
    const db = dbWith(async () => [{ name: "_id_", key: { _id: 1 } }, exact]);
    expect(await hasUniquePartialIndex(db, "parkingSessions", index)).toBe(true);
    expect(db.collection).toHaveBeenCalledWith("parkingSessions");
  });
  it.each([
    ["not unique", { ...exact, unique: false }],
    ["not partial", { ...exact, partialFilterExpression: undefined }],
    ["sparse", { ...exact, sparse: true }],
    ["collation", { ...exact, collation: { locale: "id" } }],
    ["other key", { ...exact, key: { tenantId: 1 } }],
  ])("is false for a %s index", async (_label, row) => {
    expect(await hasUniquePartialIndex(dbWith(async () => [row]), "tariffs", index)).toBe(false);
  });
  it("is false when the collection does not exist yet (NamespaceNotFound)", async () => {
    expect(await hasUniquePartialIndex(dbWith(async () => { throw new MongoServerError({ message: "ns not found", code: 26 }); }), "tariffs", index)).toBe(false);
  });
  it.each([
    ["network", new MongoNetworkError("synthetic secret host unreachable")],
    ["TLS handshake timeout", new MongoNetworkTimeoutError("synthetic secret TLS handshake")],
    ["timeout", new MongoOperationTimeoutError("synthetic secret timed out")],
    ["other server error", new MongoServerError({ message: "synthetic secret unauthorized", code: 13 })],
    ["non-driver error", new Error("synthetic secret")],
  ])("a failed check (%s) is SERVICE_UNAVAILABLE, never 'index missing'", async (_label, error) => {
    const caught = await hasUniquePartialIndex(dbWith(async () => { throw error; }), "tariffs", index).then(() => undefined, (failure: Error) => failure);
    expect(caught).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(caught?.message).not.toContain("synthetic");
  });
});
