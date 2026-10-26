import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthFrame } from "../../components/auth/auth-frame";
import { AuthLoading } from "../../components/auth/auth-status";
import { AuthenticatedContent } from "../../components/auth/session-content";
export const metadata: Metadata = { title: "Akun ? TednCo Parkir" };

export default function AccountPage() {
  return <AuthFrame><Suspense fallback={<AuthLoading />}><AuthenticatedContent /></Suspense></AuthFrame>;
}
