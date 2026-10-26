import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { LOGIN_PATH } from "./lib/login";

// Optimistic pre-filter only: checks that a session cookie exists, never its
// validity. Pages and Server Actions still verify session, membership and
// location on the server for every request.
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
}

export const config = { matcher: ["/app/:path*", "/platform/:path*"] };
