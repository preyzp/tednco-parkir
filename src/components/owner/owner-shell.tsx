import type { ReactNode } from "react";
import { MapPin, ParkingCircle } from "lucide-react";
import { SELECT_WORKSPACE_PATH } from "../../lib/login";
import type { OwnerSection } from "../../lib/owner-navigation";
import type { TenantRole } from "../../types";
import { LogoutButton } from "../auth/logout-button";
import { ThemeSwitcher } from "../theme-switcher";
import { OwnerMobileNav } from "./owner-mobile-nav";
import { OwnerNavList, SwitchLocationLink } from "./owner-nav";
import { OwnerProfileMenu } from "./owner-profile-menu";

// Display strings only — resolved and authorized on the server for this request.
export interface OwnerChrome {
  readonly tenantName: string;
  readonly locationName: string;
  readonly role: TenantRole;
  readonly canSwitch: boolean;
  readonly userName: string;
  readonly userEmail: string;
}

// Presentation only. Every page inside still enforces its own server guards;
// the shell grants nothing and is never the authorization boundary.
export function OwnerShell({ section, chrome, children }: { section: OwnerSection; chrome: OwnerChrome; children: ReactNode }) {
  const switchHref = chrome.canSwitch ? SELECT_WORKSPACE_PATH : undefined;
  return (
    <div className="flex min-h-svh bg-background">
      <aside aria-label="Sidebar" className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="space-y-1 border-b border-border px-5 py-5">
          <p className="flex items-center gap-2 font-semibold tracking-tight"><ParkingCircle aria-hidden="true" className="size-7 text-primary" />TednCo Parkir</p>
          <p className="truncate text-sm text-muted-foreground" title={chrome.tenantName}>{chrome.tenantName}</p>
        </div>
        <nav aria-label="Navigasi utama" className="flex-1 overflow-y-auto p-3">
          <OwnerNavList active={section} role={chrome.role} />
        </nav>
        <div className="space-y-3 border-t border-border p-4">
          <div className="min-w-0 text-sm">
            <p className="text-xs text-muted-foreground">Lokasi aktif</p>
            <p className="flex items-center gap-1 truncate font-medium" title={chrome.locationName}><MapPin aria-hidden="true" className="size-4 shrink-0 text-primary" />{chrome.locationName}</p>
          </div>
          {switchHref && <SwitchLocationLink href={switchHref} />}
          <LogoutButton />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="flex min-h-16 items-center gap-2 px-4 sm:gap-3 sm:px-6">
            <OwnerMobileNav active={section} role={chrome.role} tenantName={chrome.tenantName} locationName={chrome.locationName} switchHref={switchHref} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-muted-foreground lg:hidden">{chrome.tenantName}</p>
              <p className="flex min-w-0 items-center gap-1 text-sm font-medium" aria-label={`Lokasi aktif: ${chrome.locationName}`}>
                <MapPin aria-hidden="true" className="size-4 shrink-0 text-primary" /><span className="truncate">{chrome.locationName}</span>
              </p>
            </div>
            {switchHref && <SwitchLocationLink href={switchHref} compact />}
            <ThemeSwitcher />
            <OwnerProfileMenu name={chrome.userName} email={chrome.userEmail} role={chrome.role} />
          </div>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
