"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor } from "lucide-react";

const subscribe = () => () => {};
export function ThemeSwitcher() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const { theme, setTheme } = useTheme();
  return (
    <label className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground">
      <Monitor className="size-4" aria-hidden="true" />
      <span className="sr-only">Tema tampilan</span>
      <select aria-label="Tema tampilan" className="min-h-11 max-w-28 rounded bg-card text-foreground outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring" value={mounted ? theme ?? "system" : "system"} onChange={(event) => setTheme(event.target.value)}>
        <option value="system">Sistem</option>
        <option value="light">Terang</option>
        <option value="dark">Gelap</option>
      </select>
    </label>
  );
}
