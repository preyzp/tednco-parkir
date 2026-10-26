import type { ReactNode } from "react";
import { ParkingCircle } from "lucide-react";
import { ThemeSwitcher } from "../theme-switcher";

export function WorkspaceFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-16 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2 font-semibold tracking-tight"><ParkingCircle aria-hidden="true" className="size-7 text-primary" /><span>TednCo Parkir</span></div>
          <ThemeSwitcher />
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    </div>
  );
}
