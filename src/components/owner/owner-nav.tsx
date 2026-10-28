import Link from "next/link";
import { ArrowLeftRight, Car, LayoutDashboard, ReceiptText, Settings, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { visibleOwnerNavigation, type OwnerSection } from "../../lib/owner-navigation";
import type { TenantRole } from "../../types";
import { Badge } from "../ui/badge";

const icons: Record<OwnerSection, LucideIcon> = { dashboard: LayoutDashboard, kendaraan: Car, transaksi: ReceiptText, prabayar: Wallet, laporan: TrendingUp, pengaturan: Settings };

// Shared by the desktop sidebar (server) and the mobile sheet (client).
// Unbuilt modules are plain, non-focusable text marked "Segera" — not links.
export function OwnerNavList({ active, role, onNavigate }: { active: OwnerSection; role: TenantRole; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {visibleOwnerNavigation(role).map(({ key, label, href }) => {
        const Icon = icons[key];
        const base = "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium";
        if (!href) {
          return (
            <li key={key}>
              <span aria-disabled="true" className={`${base} cursor-not-allowed text-muted-foreground opacity-70`}>
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="flex-1">{label}</span>
                <Badge variant="outline" className="text-[11px]">Segera</Badge>
                <span className="sr-only">(belum tersedia)</span>
              </span>
            </li>
          );
        }
        const current = key === active;
        return (
          <li key={key}>
            <Link href={href} onClick={onNavigate} aria-current={current ? "page" : undefined} className={`${base} transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${current ? "bg-accent text-accent-foreground" : "text-foreground"}`}>
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="flex-1">{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function SwitchLocationLink({ href, onNavigate, compact = false }: { href: string; onNavigate?: () => void; compact?: boolean }) {
  return (
    <Link href={href} onClick={onNavigate} aria-label="Ganti lokasi aktif" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
      <ArrowLeftRight aria-hidden="true" className="size-4" />
      <span className={compact ? "hidden sm:inline" : undefined}>Ganti lokasi</span>
    </Link>
  );
}
