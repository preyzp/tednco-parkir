import { randomUUID } from "node:crypto";

type Environment = Readonly<Record<string, string | undefined>>;

/** Atlas reuse requires a separate explicit token and file configuration.
 * Neither mode ever accepts a caller-supplied target database name. */
export function integrationTarget(env: Environment, atlasFile?: Environment): { uri: string; dbName: string } {
  if (env.RUN_MONGODB_INTEGRATION === "I_APPROVE_ATLAS_TEST_WRITES") {
    let uri: URL;
    try {
      if (!atlasFile?.MONGODB_URI || !atlasFile.MONGODB_DB_NAME?.trim()) throw new Error();
      uri = new URL(atlasFile.MONGODB_URI);
      if (uri.protocol !== "mongodb+srv:" || !uri.hostname.endsWith(".mongodb.net")) throw new Error();
    } catch {
      throw new Error("Approved Atlas integration requires valid Atlas file configuration.");
    }
    // Remove any URI-embedded application database before using the existing
    // client helper. Preserve credentials/options only in memory, never logs.
    uri.pathname = "/";
    uri.hash = "";
    // Atlas Free database names are limited to 38 bytes. Keep the full random
    // UUID (128 bits) with a short test-only prefix: 6 + 32 ASCII bytes.
    const dbName = `tpk_t_${randomUUID().replaceAll("-", "")}`;
    if (dbName === atlasFile?.MONGODB_DB_NAME) throw new Error("Unsafe integration database target.");
    return { uri: uri.toString(), dbName };
  }
  if (env.RUN_MONGODB_INTEGRATION !== "I_APPROVE_LOCAL_TEST_WRITES") {
    throw new Error("Live database tests require explicit approval and opt-in.");
  }
  if (env.MONGODB_URI || env.MONGODB_DB_NAME) {
    throw new Error("Remove application database variables from the integration process.");
  }
  const uri = env.MONGODB_TEST_URI;
  if (!uri || !/^mongodb:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):([0-9]{1,5})\/(?:\?replicaSet=[a-zA-Z0-9_-]+)?$/.test(uri)) {
    throw new Error("Use an isolated loopback MongoDB test service with no credentials or database path.");
  }
  const port = Number(new URL(uri).port);
  if (port < 1 || port > 65535) throw new Error("Invalid local test port.");
  return { uri, dbName: `tednco_parkir_test_${randomUUID().replaceAll("-", "")}` };
}
