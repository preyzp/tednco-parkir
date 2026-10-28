"use client";
import { useState } from "react";
import { MapPin, Menu, ParkingCircle } from "lucide-react";
import type { OwnerSection } from "../../lib/owner-navigation";
import type { TenantRole } from "../../types";
import { LogoutButton } from "../auth/logout-button";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "../ui/sheet";
import { OwnerNavList, SwitchLocationLink } from "./owner-nav";

// Below `lg` the sidebar is replaced by this drawer (same items and guards).
export function OwnerMobileNav({ active, role, tenantName, locationName, switchHref }: { active: OwnerSection; role: TenantRole; tenantName: string; locationName: string; switchHref?: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="size-11 lg:hidden" aria-label="Buka menu navigasi"><Menu aria-hidden="true" /></Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[85%] max-w-xs gap-0 p-0">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2"><ParkingCircle aria-hidden="true" className="size-6 text-primary" />TednCo Parkir</SheetTitle>
          <SheetDescription className="space-y-0.5">
            <span className="block break-words font-medium text-foreground">{tenantName}</span>
            <span className="flex items-center gap-1"><MapPin aria-hidden="true" className="size-3.5" />{locationName}</span>
          </SheetDescription>
        </SheetHeader>
        <nav aria-label="Navigasi utama" className="flex-1 overflow-y-auto p-3">
          <OwnerNavList active={active} role={role} onNavigate={close} />
        </nav>
        <SheetFooter className="border-t">
          {switchHref && <SwitchLocationLink href={switchHref} onNavigate={close} />}
          <LogoutButton />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
