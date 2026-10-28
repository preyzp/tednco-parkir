"use client";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

export const SLOW_PENDING_MS = 10_000;

/** true once `pending` has lasted `delayMs`; false again as soon as it ends.
 * The timer is cleared when pending ends or the component unmounts. */
export function useSlowPending(pending: boolean, delayMs: number = SLOW_PENDING_MS): boolean {
  const [slow, setSlow] = useState(false);
  const [wasPending, setWasPending] = useState(pending);
  // Reset during render when pending changes (no stale "slow" for the next request).
  if (pending !== wasPending) {
    setWasPending(pending);
    setSlow(false);
  }
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(timer);
  }, [pending, delayMs]);
  return pending && slow;
}

// Shown while a request is still running after 10 s. It never suggests
// resubmitting: the same request (and idempotency key) is still in flight.
export function SlowPendingNotice({ pending, delayMs }: { pending: boolean; delayMs?: number }) {
  const slow = useSlowPending(pending, delayMs);
  return (
    <p role="status" aria-live="polite" className={slow ? "flex items-start gap-2 text-sm text-muted-foreground" : "sr-only"}>
      {slow && <><Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Server masih memproses permintaan ini. Mohon tunggu dan jangan menutup atau memuat ulang halaman.</>}
    </p>
  );
}
