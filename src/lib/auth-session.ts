import "server-only";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getAuth } from "./auth";
import { getDb } from "./mongodb";
import { authCollectionNames } from "./auth-schema";
import { AppError } from "./errors";
import type { User } from "../types";

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const authenticatedUserSchema = z.object({
  id: objectId,
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  image: z.string().nullable().optional(),
});
const verifiedSessionSchema = z.object({
  user: z.object({ id: objectId }),
  session: z.object({ id: objectId, userId: objectId, expiresAt: z.coerce.date() }),
}).refine((value) => value.user.id === value.session.userId);

// Safe identity projection only. A valid identity grants no tenant/location role.
export interface AuthenticatedSession {
  user: z.infer<typeof authenticatedUserSchema>;
  session: { expiresAt: string };
}

// Internal boundary for results from Better Auth ONLY, never browser claims.
// Cookie signatures/session persistence remain entirely owned by Better Auth.
export async function resolveAuthenticatedSession(value: unknown): Promise<AuthenticatedSession | null> {
  const result = verifiedSessionSchema.safeParse(value);
  if (!result.success || result.data.session.expiresAt.getTime() <= Date.now()) return null;
  const db = await getDb();
  const user = await db.collection<User>(authCollectionNames.user).findOne(
    { _id: new ObjectId(result.data.user.id), status: "active" },
    { projection: { _id: 1, name: 1, email: 1, emailVerified: 1, image: 1 } },
  );
  if (!user) return null;
  const safeUser = authenticatedUserSchema.safeParse({
    id: user._id.toHexString(), name: user.name, email: user.email,
    emailVerified: user.emailVerified, ...(user.image !== undefined ? { image: user.image } : {}),
  });
  if (!safeUser.success || safeUser.data.id !== result.data.user.id) return null;
  return { user: safeUser.data, session: { expiresAt: result.data.session.expiresAt.toISOString() } };
}

// No cross-request cache. RSC reads never refresh a session whose Set-Cookie
// cannot be forwarded. HTTP get-session remains the cookie refresh boundary.
export async function getCurrentSession(requestHeaders?: Headers): Promise<AuthenticatedSession | null> {
  try {
    const incoming = requestHeaders ?? await headers();
    if (!incoming.has("cookie")) return null;
    const auth = await getAuth();
    const verified = await auth.api.getSession({
      headers: incoming,
      query: { disableCookieCache: true, disableRefresh: true },
    });
    return await resolveAuthenticatedSession(verified);
  } catch (error) {
    if (error instanceof APIError && error.statusCode === 401) return null;
    throw new AppError("SERVICE_UNAVAILABLE");
  }
}

export async function requireAuthenticatedSession(requestHeaders?: Headers): Promise<AuthenticatedSession> {
  const session = await getCurrentSession(requestHeaders);
  if (!session) throw new AppError("UNAUTHENTICATED");
  return session;
}
