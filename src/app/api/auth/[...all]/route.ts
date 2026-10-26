import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "../../../../lib/auth";
import { authenticatedUserSchema, resolveAuthenticatedSession } from "../../../../lib/auth-session";
import { AppError, normalizeError, type ErrorCode } from "../../../../lib/errors";

// Node.js is the default. An explicit runtime export is incompatible with
// this project's Next.js Cache Components setting.

function errorResponse(code: ErrorCode, headers: Headers): Response {
  const { status, body } = normalizeError(new AppError(code));
  return Response.json(body, { status, headers });
}

function nativeErrorCode(status: number): ErrorCode {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 429) return "RATE_LIMITED";
  if (status === 400 || status === 422) return "VALIDATION_ERROR";
  if (status === 404 || status === 405) return "RESOURCE_NOT_FOUND";
  return "SERVICE_UNAVAILABLE";
}

async function handle(request: Request): Promise<Response> {
  let responseHeaders = new Headers();
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("pragma", "no-cache");
  try {
    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    const signIn = path === "/api/auth/sign-in/email" && request.method === "POST";
    const signOut = path === "/api/auth/sign-out" && request.method === "POST";
    const currentSession = path === "/api/auth/get-session" && request.method === "GET";
    // Expose only the backend flows implemented for MVP. Native endpoints such
    // as list-sessions/accounts must not expose sensitive auth records.
    if (!signIn && !signOut && !currentSession) return errorResponse("RESOURCE_NOT_FOUND", responseHeaders);
    const auth = await getAuth();
    // Keep official CSRF/origin validation, rate limiting and cookie issuance.
    const native = await auth.handler(request);
    responseHeaders = new Headers(native.headers);
    responseHeaders.delete("content-length");
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("set-auth-token");
    responseHeaders.delete("set-auth-jwt");
    responseHeaders.set("cache-control", "no-store");
    responseHeaders.set("pragma", "no-cache");
    if (!native.ok) return errorResponse(nativeErrorCode(native.status), responseHeaders);
    if (signOut) {
      // 1.7.13 signOut catches persistence errors. Never report confirmed
      // logout if the original cookie still authenticates after signOut.
      const remaining = await auth.api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true, disableRefresh: true },
      });
      if (remaining) return errorResponse("SERVICE_UNAVAILABLE", responseHeaders);
      return Response.json({ ok: true }, { headers: responseHeaders });
    }
    const payload: unknown = await native.json();
    if (signIn) {
      const user = authenticatedUserSchema.safeParse(
        typeof payload === "object" && payload !== null && "user" in payload ? payload.user : undefined,
      );
      if (!user.success) return errorResponse("SERVICE_UNAVAILABLE", responseHeaders);
      // Explicit allowlist; no native session token, records, claims or callback URL.
      return Response.json({ ok: true, user: user.data }, { headers: responseHeaders });
    }
    const session = await resolveAuthenticatedSession(payload);
    if (!session) return errorResponse("UNAUTHENTICATED", responseHeaders);
    return Response.json({ ok: true, ...session }, { headers: responseHeaders });
  } catch {
    return errorResponse("SERVICE_UNAVAILABLE", responseHeaders);
  }
}

export const { GET, POST } = toNextJsHandler(handle);
