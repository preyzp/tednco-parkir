"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogOut } from "lucide-react";
import { logoutCurrentSession } from "../../lib/auth-client";
import { LOGIN_PATH } from "../../lib/login";
import { Button } from "../ui/button";

export function LogoutButton() {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await logoutCurrentSession();
      if (!result.ok) { setError(result.message); return; }
      router.replace(LOGIN_PATH); router.refresh();
    } catch { setError("Keluar belum dapat dikonfirmasi. Silakan coba lagi."); }
    finally { busy.current = false; setPending(false); }
  }
  return <div className="space-y-3"><Button onClick={logout} disabled={pending} className="h-12 w-full">{pending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <LogOut aria-hidden="true" />}{pending ? "Mengakhiri sesi..." : "Keluar"}</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>;
}
