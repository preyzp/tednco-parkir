import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthFrame } from "../../components/auth/auth-frame";
import { AuthLoading } from "../../components/auth/auth-status";
import { LoginContent } from "../../components/auth/session-content";

export const metadata: Metadata = { title: "Masuk — TednCo Parkir" };

export default function LoginPage() {
  return <AuthFrame><Suspense fallback={<AuthLoading />}><LoginContent /></Suspense></AuthFrame>;
}
