import "server-only";
import type { BetterAuthOptions } from "better-auth";
import { collectionNames } from "./collection-names";

export const authCollectionNames = Object.freeze({
  user: collectionNames.users,
  session: "authSessions",
  account: "authAccounts",
  verification: "authVerifications",
  rateLimit: "authRateLimits",
} as const);

// Shared by the actual adapter and explicit maintenance. No environment or IO.
export const authSchemaOptions = {
  user: {
    modelName: authCollectionNames.user,
    additionalFields: {
      status: { type: ["active", "inactive", "locked"], required: true, defaultValue: "inactive", input: false, returned: false },
      platformRole: { type: ["platform_admin"], required: false, input: false, returned: false },
      lastLoginAt: { type: "date", required: false, input: false, returned: false },
    },
  },
  session: {
    modelName: authCollectionNames.session,
    storeSessionInDatabase: true,
    cookieCache: { enabled: false },
    expiresIn: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  account: { modelName: authCollectionNames.account, accountLinking: { enabled: false } },
  verification: { modelName: authCollectionNames.verification, storeIdentifier: "hashed" },
  rateLimit: { enabled: true, storage: "database", modelName: authCollectionNames.rateLimit },
  plugins: [{
    id: "tednco-auth-schema",
    schema: {
      user: {
        // Keep Phase 1 index names instead of a second email index.
        fields: {},
        indexes: [
          { name: "users_email_unique", fields: ["email"], unique: true },
          { name: "users_status", fields: ["status"] },
        ],
      },
      account: { fields: {}, indexes: [
        { name: "auth_accounts_provider_account_unique", fields: ["providerId", "accountId"], unique: true },
        { name: "auth_accounts_user", fields: ["userId"] },
      ] },
      session: { fields: {}, indexes: [
        { name: "auth_sessions_token_unique", fields: ["token"], unique: true },
        { name: "auth_sessions_user", fields: ["userId"] },
        { name: "auth_sessions_expiry", fields: ["expiresAt"] },
      ] },
      verification: { fields: {}, indexes: [
        { name: "auth_verifications_identifier", fields: ["identifier"] },
        { name: "auth_verifications_expiry", fields: ["expiresAt"] },
      ] },
    },
  }],
} satisfies BetterAuthOptions;
