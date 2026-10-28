"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle, LogOut } from "lucide-react";
import { toast } from "sonner";
import { logoutCurrentSession } from "../../lib/auth-client";
import { LOGIN_PATH, SECURITY_SETTINGS_PATH } from "../../lib/login";
import { roleLabel } from "../../lib/workspace-labels";
import type { TenantRole } from "../../types";
import { Button } from "../ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";

// Same confirmed-logout flow as LogoutButton: navigate only after the server
// confirms the session ended.
export function OwnerProfileMenu({ name, email, role }: { name: string; email: string; role: TenantRole }) {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  async function logout() {
    if (busy.current) return;
    busy.current = true; setPending(true);
    try {
      const result = await logoutCurrentSession();
      if (!result.ok) { toast.error("Belum dapat keluar.", { id: "logout", description: result.message }); return; }
      router.replace(LOGIN_PATH); router.refresh();
    } finally { busy.current = false; setPending(false); }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-11 gap-2 px-2" aria-label={`Profil ${name}`}>
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials(name)}</span>
          <span className="hidden max-w-36 truncate text-sm font-medium md:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-0.5">
          <span className="block truncate">{name}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">{email}</span>
          <span className="block text-xs font-normal text-muted-foreground">Peran: {roleLabel(role)}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {role === "owner" && <DropdownMenuItem asChild className="min-h-11"><Link href={SECURITY_SETTINGS_PATH}><KeyRound aria-hidden="true" />Keamanan akun</Link></DropdownMenuItem>}
        <DropdownMenuItem className="min-h-11" disabled={pending} onSelect={(event) => { event.preventDefault(); void logout(); }}>
          {pending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <LogOut aria-hidden="true" />}{pending ? "Mengakhiri sesi..." : "Keluar"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
