import { expect, test, vi } from "vitest";

const getDb = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("../mongodb", () => ({ getDb }));

import { getTenantCollection, getLocationCollection, getPlatformCollection } from "./index";

test("real authorization integration fails closed for all accessors", async () => {
  await expect(getTenantCollection("vehicles")).rejects.toThrow("Database authorization is not implemented.");
  await expect(getLocationCollection("parkingSessions")).rejects.toThrow("Database authorization is not implemented.");
  await expect(getPlatformCollection("users")).rejects.toThrow("Database authorization is not implemented.");
  expect(getDb).not.toHaveBeenCalled();
});
