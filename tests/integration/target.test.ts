import { expect, test } from "vitest";
import { integrationTarget } from "./target";

const approved = { RUN_MONGODB_INTEGRATION: "I_APPROVE_LOCAL_TEST_WRITES" };

test("missing opt-in fails without contacting a database", () => {
  expect(() => integrationTarget({})).toThrow("explicit approval");
  expect(() => integrationTarget({ RUN_MONGODB_INTEGRATION: "true" })).toThrow("explicit approval");
});

test.each([
  undefined, "mongodb+srv://remote.example/", "mongodb://remote.example:27017/",
  "mongodb://user:secret@localhost:27017/", "mongodb://localhost:27017/development",
  "mongodb://localhost:27017/?authSource=admin", "mongodb://localhost:0/", "mongodb://localhost:99999/",
])("rejects unsafe integration target %# with a fixed diagnostic", (uri) => {
  expect(() => integrationTarget({ ...approved, MONGODB_TEST_URI: uri })).toThrow();
  try { integrationTarget({ ...approved, MONGODB_TEST_URI: uri }); }
  catch (error) { expect(String(error)).not.toMatch(/secret|remote\.example|development/); }
});

test.each(["MONGODB_URI", "MONGODB_DB_NAME"])("refuses application variable %s", (key) => {
  expect(() => integrationTarget({ ...approved, MONGODB_TEST_URI: "mongodb://localhost:27018/", [key]: "application" }))
    .toThrow("Remove application database variables");
});

test("every approved run gets a fresh database name, never a caller-supplied database", () => {
  const env = { ...approved, MONGODB_TEST_URI: "mongodb://127.0.0.1:27018/?replicaSet=rs0" };
  const a = integrationTarget(env);
  const b = integrationTarget(env);
  expect(a.uri).toBe(env.MONGODB_TEST_URI);
  expect(a.dbName).toMatch(/^tednco_parkir_test_[a-f0-9]{32}$/);
  expect(a.dbName).not.toBe(b.dbName);
});

const atlasFile = {
  MONGODB_URI: "mongodb+srv://synthetic:synthetic-password@cluster.example.mongodb.net/application_db?retryWrites=true&w=majority",
  MONGODB_DB_NAME: "tednco_parkir_dev",
};
const atlasApproved = { RUN_MONGODB_INTEGRATION: "I_APPROVE_ATLAS_TEST_WRITES" };

test("Atlas mode requires its own token, never inferred from file credentials", () => {
  expect(() => integrationTarget({}, atlasFile)).toThrow("explicit approval");
  expect(() => integrationTarget(approved, atlasFile)).toThrow();
  expect(() => integrationTarget(atlasApproved)).toThrow("valid Atlas file configuration");
});

test("approved Atlas mode strips embedded application database and ignores database overrides", () => {
  const target = integrationTarget({ ...atlasApproved, MONGODB_DB_NAME: "production", MONGODB_TEST_DB_NAME: "production" }, atlasFile);
  const uri = new URL(target.uri);
  expect(uri.pathname).toBe("/");
  expect(uri.searchParams.get("retryWrites")).toBe("true");
  expect(uri.hostname).toBe("cluster.example.mongodb.net");
  expect(target.dbName).toMatch(/^tpk_t_[a-f0-9]{32}$/);
  expect(Buffer.byteLength(target.dbName, "utf8")).toBeLessThanOrEqual(38);
  expect(target.dbName).not.toBe(atlasFile.MONGODB_DB_NAME);
  expect(target.dbName).not.toBe("production");
  expect(target.dbName).not.toBe(integrationTarget(atlasApproved, atlasFile).dbName);
});

test.each([
  "mongodb+srv://synthetic:secret@cluster.example/",
  "mongodb+srv://synthetic:secret@cluster.mongodb.net.attacker.example/",
  "mongodb://localhost:27017/production", "not-a-uri",
])("Atlas guard rejects invalid/unapproved hosts without leaking configuration %#", (uri) => {
  expect(() => integrationTarget(atlasApproved, { ...atlasFile, MONGODB_URI: uri }))
    .toThrow("Approved Atlas integration requires valid Atlas file configuration.");
});
