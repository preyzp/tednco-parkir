import { execFileSync, spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { developmentDatabase } from "./dev-provisioning-core.mjs";
const runtime = () => ({ ...process.env, NODE_ENV: "development" as const, TEDNCO_ENABLE_DEV_PROVISIONING: "1", MONGODB_DB_NAME: developmentDatabase, TEDNCO_DEV_OWNER_EMAIL: "synthetic@example.test", TEDNCO_DEV_OWNER_PASSWORD: "synthetic-password-for-cli-test", MONGODB_URI: "invalid-uri-proves-offline-dry-run" });
it("CLI default dry-run succeeds without even constructing a MongoDB connection", () => {
  const output = execFileSync(process.execPath, ["scripts/provision-dev-owner.mjs"], { env: runtime(), encoding: "utf8" });
  expect(output).toContain("DRY RUN (offline)"); expect(output).toContain("NOT been checked");
  expect(output).not.toContain(runtime().TEDNCO_DEV_OWNER_PASSWORD); expect(output).not.toContain(runtime().MONGODB_URI);
});
it("CLI apply without confirmation fails before connecting and does not print inputs", () => {
  const result = spawnSync(process.execPath, ["scripts/provision-dev-owner.mjs", "--apply"], { env: { ...runtime(), TEDNCO_DEV_WRITE_CONFIRMATION: "" }, encoding: "utf8" });
  expect(result.status).toBe(1); expect(result.stderr).toContain("not confirmed");
  expect(result.stderr).not.toContain(runtime().TEDNCO_DEV_OWNER_PASSWORD); expect(result.stderr).not.toContain(runtime().MONGODB_URI);
});
it("CLI production mode is rejected even when opt-in is present", () => {
  const result = spawnSync(process.execPath, ["scripts/provision-dev-owner.mjs"], { env: { ...runtime(), NODE_ENV: "production" }, encoding: "utf8" });
  expect(result.status).toBe(1); expect(result.stdout).not.toContain("committed");
});
