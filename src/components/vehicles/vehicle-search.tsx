"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { VEHICLES_PATH, VEHICLE_EXIT_PATH } from "../../lib/owner-navigation";
import { vehicleExitSearchHref, vehicleListHref, vehicleSearchKey, vehicleSearchMax, vehicleSearchValue } from "../../lib/vehicle-list";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export const vehicleSearchDebounceMs = 350;

// Live plate search for /app/kendaraan ("list") and the checkout search
// /app/kendaraan/keluar ("exit", active only). It only changes the URL (q, page
// reset to 1, list status/type kept); the server page re-runs the guarded,
// tenant/location scoped repository. Without JS the GET form still works.
export function VehicleSearch({ q, status = "active", type = "all", target = "list" }: { q?: string; status?: string; type?: string; target?: "list" | "exit" }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(q ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Key of the newest search we asked for, and every key requested so far.
  const latest = useRef(vehicleSearchKey(q));
  const requested = useRef(new Set<string>());

  // A new `q` from the server is either our latest search (nothing to do), an
  // older one of ours (stale: never overwrite the input) or an external
  // navigation such as a filter/pagination link (sync the input).
  useEffect(() => {
    const key = vehicleSearchKey(q);
    // Once the latest search lands, older ones are superseded for good.
    if (key === latest.current) { requested.current.clear(); return; }
    if (requested.current.has(key)) return;
    latest.current = key;
    setValue(q ?? "");
  }, [q]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function search(raw: string) {
    clearTimeout(timer.current);
    const key = vehicleSearchKey(raw);
    if (key === latest.current) return; // same effective query: no request
    latest.current = key;
    requested.current.add(key);
    const href = target === "exit" ? vehicleExitSearchHref({ q: vehicleSearchValue(raw) }) : vehicleListHref({ q: vehicleSearchValue(raw), status, type });
    // Navigation is a transition: the newest one wins and the old rows stay
    // visible (with the indicator) until the new result is ready.
    startTransition(() => router.replace(href, { scroll: false }));
  }
  function onChange(next: string) {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(next), vehicleSearchDebounceMs);
  }
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    search(value);
  }

  return (
    <form action={target === "exit" ? VEHICLE_EXIT_PATH : VEHICLES_PATH} method="get" role="search" onSubmit={onSubmit} className="space-y-2">
      {target === "list" && status !== "active" && <input type="hidden" name="status" value={status} />}
      {target === "list" && type !== "all" && <input type="hidden" name="type" value={type} />}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="vehicle-search">Cari nomor polisi</Label>
          <Input id="vehicle-search" name="q" type="search" value={value} onChange={(event) => onChange(event.target.value)} maxLength={vehicleSearchMax} placeholder="Contoh: B 1234 atau 1234" autoCapitalize="characters" autoComplete="off" className="h-11 uppercase" />
        </div>
        <Button type="submit" className="h-11"><Search aria-hidden="true" />Cari</Button>
        {value && <Button type="button" variant="ghost" className="h-11" onClick={() => { setValue(""); search(""); }}><X aria-hidden="true" />Hapus pencarian</Button>}
      </div>
      <p role="status" aria-live="polite" className="flex min-h-5 items-center gap-2 text-sm text-muted-foreground">
        {isPending && <><Loader2 aria-hidden="true" className="size-4 animate-spin" />Memperbarui hasil…</>}
      </p>
    </form>
  );
}
