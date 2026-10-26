import "server-only";
import { redirect } from "next/navigation";
import { getCurrentSession } from "../../lib/auth-session";
import { AUTHENTICATED_PATH } from "../../lib/login";
import { LoginForm } from "./login-form";

// Protected /app content lives in components/workspace (P2.10 guards).
export async function LoginContent() {
  let session;
  let unavailable = false;
  try { session = await getCurrentSession(); }
  catch { unavailable = true; }
  if (session) redirect(AUTHENTICATED_PATH);
  return <LoginForm initiallyUnavailable={unavailable} />;
}
