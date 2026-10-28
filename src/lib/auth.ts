import "server-only";

import { betterAuth } from "better-auth/minimal";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { ObjectId, type Db, type MongoClient } from "mongodb";
import { getAuthEnv } from "./env";
import { getDb, getMongoClient } from "./mongodb";
import { authCollectionNames, authSchemaOptions } from "./auth-schema";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./login";
import type { User } from "../types";

function createAuth(db: Db, client: MongoClient, env: ReturnType<typeof getAuthEnv>) {
  return betterAuth({
    ...authSchemaOptions,
    appName: "TednCo Parkir",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: mongodbAdapter(db, { client, transaction: true }),
    // Explicit app policy (6–128); Better Auth would otherwise default to 8.
    emailAndPassword: { enabled: true, disableSignUp: true, revokeSessionsOnPasswordReset: true, minPasswordLength: PASSWORD_MIN_LENGTH, maxPasswordLength: PASSWORD_MAX_LENGTH },
    advanced: {
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    },
    // Raw library/driver diagnostics may include indexed or credential values.
    logger: { disabled: true },
    telemetry: { enabled: false },
    databaseHooks: {
      session: { create: { before: async (session) => {
        if (!/^[a-f\d]{24}$/i.test(session.userId)) return false;
        const user = await db.collection<User>(authCollectionNames.user).findOne(
          { _id: new ObjectId(session.userId), status: "active" },
          { projection: { _id: 1 } },
        );
        return user ? undefined : false;
      } } },
    },
  });
}

type AuthInstance = ReturnType<typeof createAuth>;
let pendingAuth: Promise<AuthInstance> | undefined;

// Import/build never reads env, connects, initializes auth or creates indexes.
// Shared connections are owned by mongodb.ts, never closed per request here.
export function getAuth(): Promise<AuthInstance> {
  if (!pendingAuth) {
    pendingAuth = Promise.resolve().then(async () => {
      try {
        const env = getAuthEnv();
        const [db, client] = await Promise.all([getDb(), getMongoClient()]);
        const auth = createAuth(db, client, env);
        await auth.$context;
        return auth;
      } catch {
        pendingAuth = undefined;
        throw new Error("Authentication service is unavailable.");
      }
    });
  }
  return pendingAuth;
}
