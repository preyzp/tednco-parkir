import type { ReactNode } from "react";
import Link from "next/link";
import { Building2, LayoutDashboard, ParkingCircle, ShieldCheck } from "lucide-react";
import { PLATFORM_PATH } from "../../lib/login";
import { PLATFORM_TENANTS_PATH } from "../../lib/platform-labels";
import { ThemeSwitcher } from "../theme-switcher";
import { Button } from "../ui/button";

const navigation = [
  { key: "overview", href: PLATFORM_PATH, label: "Ringkasan", icon: LayoutDashboard },
  { key: "tenants", href: PLATFORM_TENANTS_PATH, label: "Tenant", icon: Building2 },
] as const;
export type PlatformSection = (typeof navigation)[number]["key"];

// Visibly distinct from the operator workspace (DESIGN_SPEC 5.10). Navigation
// is presentation only; every /platform page enforces its own server guard.
export function PlatformFrame({ children, active }: { children: ReactNode; active?: PlatformSection }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-16 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-2 font-semibold tracking-tight">
            <ParkingCircle aria-hidden="true" className="size-7 text-primary" /><span>TednCo Parkir</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-3.5" />Platform Admin</span>
          </div>
          <ThemeSwitcher />
        </div>
        <nav aria-label="Navigasi Platform Admin" className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {navigation.map(({ key, href, label, icon: Icon }) => (
            <Button key={key} asChild variant={active === key ? "secondary" : "ghost"} className="h-11">
              <Link href={href} aria-current={active === key ? "page" : undefined}><Icon aria-hidden="true" />{label}</Link>
            </Button>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
