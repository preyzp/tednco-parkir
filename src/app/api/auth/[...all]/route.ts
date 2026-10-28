import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "../../../../lib/auth";
import { authenticatedUserSchema, resolveAuthenticatedSession } from "../../../../lib/auth-session";
import { AppError, normalizeError, type ErrorCode, type FieldIssue } from "../../../../lib/errors";
import { requireOwnerAccount } from "../../../../lib/dal";
import { changePasswordSchema } from "../../../../lib/login";
import { toValidationError } from "../../../../lib/validations/errors";

// Node.js is the default. An explicit runtime export is incompatible with
// this project's Next.js Cache Components setting.

function errorResponse(code: ErrorCode, headers: Headers): Response {
  const { status, body } = normalizeError(new AppError(code));
  return Response.json(body, { status, headers });
}

const passwordFields = ["currentPassword", "newPassword"] as const;
function validationResponse(fields: FieldIssue[], headers: Headers): Response {
  const { status, body } = normalizeError(new AppError("VALIDATION_ERROR", fields), passwordFields);
  return Response.json(body, { status, headers });
}
// Change password: enforce the app password policy and the Owner gate before
// Better Auth runs, and always revoke every other session. Only the two known
// fields are forwarded; the client cannot opt out of revocation.
async function prepareChangePassword(request: Request, headers: Headers): Promise<Request | Response> {
  const text = await request.text();
  if (text.length > 4096) return validationResponse([], headers);
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return validationResponse([], headers); }
  const picked = typeof raw === "object" && raw !== null ? { currentPassword: (raw as Record<string, unknown>).currentPassword, newPassword: (raw as Record<string, unknown>).newPassword } : {};
  const parsed = changePasswordSchema.safeParse(picked);
  if (!parsed.success) return toValidationResponse(parsed.error, headers);
  try { await requireOwnerAccount(); }
  catch (error) { return errorResponse(error instanceof AppError ? error.code : "SERVICE_UNAVAILABLE", headers); }
  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.delete("content-length");
  forwardHeaders.set("content-type", "application/json");
  return new Request(request.url, { method: "POST", headers: forwardHeaders, body: JSON.stringify({ ...parsed.data, revokeOtherSessions: true }) });
}
function toValidationResponse(error: Parameters<typeof toValidationError>[0], headers: Headers): Response {
  const { status, body } = normalizeError(toValidationError(error, passwordFields), passwordFields);
  return Response.json(body, { status, headers });
}
// Maps Better Auth's documented error codes to field issues without echoing
// native messages. A wrong current password stays a plain field error.
async function changePasswordFailure(native: Response, headers: Headers): Promise<Response> {
  if (native.status !== 400) return errorResponse(nativeErrorCode(native.status), headers);
  const payload: unknown = await native.json().catch(() => null);
  const code = typeof payload === "object" && payload !== null && "code" in payload ? String(payload.code) : "";
  if (code === "INVALID_PASSWORD") return validationResponse([{ field: "currentPassword", code: "INVALID" }], headers);
  if (code === "PASSWORD_TOO_SHORT") return validationResponse([{ field: "newPassword", code: "TOO_SMALL" }], headers);
  if (code === "PASSWORD_TOO_LONG") return validationResponse([{ field: "newPassword", code: "TOO_LARGE" }], headers);
  return validationResponse([], headers);
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
    const changePassword = path === "/api/auth/change-password" && request.method === "POST";
    // Expose only the backend flows implemented for MVP. Native endpoints such
    // as list-sessions/accounts must not expose sensitive auth records.
    if (!signIn && !signOut && !currentSession && !changePassword) return errorResponse("RESOURCE_NOT_FOUND", responseHeaders);
    let forwarded = request;
    if (changePassword) {
      const prepared = await prepareChangePassword(request, responseHeaders);
      if (prepared instanceof Response) return prepared;
      forwarded = prepared;
    }
    const auth = await getAuth();
    // Keep official CSRF/origin validation, rate limiting and cookie issuance.
    const native = await auth.handler(forwarded);
    responseHeaders = new Headers(native.headers);
    responseHeaders.delete("content-length");
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("set-auth-token");
    responseHeaders.delete("set-auth-jwt");
    responseHeaders.set("cache-control", "no-store");
    responseHeaders.set("pragma", "no-cache");
    if (changePassword) {
      if (!native.ok) return changePasswordFailure(native, responseHeaders);
      // New session cookie (all sessions were revoked) is forwarded; the native
      // token and user record are not.
      return Response.json({ ok: true }, { headers: responseHeaders });
    }
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
