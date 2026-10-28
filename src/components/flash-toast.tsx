"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

// Shows a one-time toast for a server-rendered outcome flag (e.g. ?diperbarui=…)
// after a Server Action redirect, then removes the flag from the URL without a
// server round trip, so refresh/back/revalidation never repeat it. The stable
// id makes Sonner replace instead of stacking if it fires again anyway.
export function FlashToast({ id, kind, title, description, clearParams }: { id: string; kind: "success" | "error"; title: string; description?: string; clearParams: readonly string[] }) {
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast[kind](title, { id, description });
    const url = new URL(window.location.href);
    let changed = false;
    for (const param of clearParams) if (url.searchParams.has(param)) { url.searchParams.delete(param); changed = true; }
    if (changed) window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [id, kind, title, description, clearParams]);
  return null;
}
