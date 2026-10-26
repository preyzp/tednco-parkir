import Link from "next/link";
import { Inbox, LoaderCircle, ServerCrash, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { LogoutButton } from "../auth/logout-button";
import { SELECT_WORKSPACE_PATH } from "../../lib/login";

export function WorkspaceLoading() {
  return <Card><CardContent className="flex items-center justify-center gap-3 py-8 text-sm text-muted-foreground" role="status"><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />Memuat ruang kerja...</CardContent></Card>;
}
export function WorkspaceUnavailable() {
  return <Card><CardContent className="space-y-5"><ServerCrash aria-hidden="true" className="size-8 text-muted-foreground" /><div className="space-y-2"><h1 className="text-xl font-semibold">Layanan belum tersedia</h1><p className="text-sm leading-6 text-muted-foreground">Akses ruang kerja Anda belum dapat diperiksa. Muat ulang halaman sebentar lagi.</p></div><Button asChild variant="outline" className="h-12 w-full"><Link href="/app">Coba lagi</Link></Button></CardContent></Card>;
}
export function WorkspaceEmpty() {
  return <Card><CardContent className="space-y-5"><Inbox aria-hidden="true" className="size-8 text-muted-foreground" /><div className="space-y-2"><h1 className="text-xl font-semibold">Belum ada akses lokasi</h1><p className="text-sm leading-6 text-muted-foreground">Akun Anda belum terhubung ke lokasi parkir yang aktif. Hubungi pemilik usaha atau pengelola Anda.</p></div><LogoutButton /></CardContent></Card>;
}
export function WorkspaceForbidden() {
  return <Card><CardContent className="space-y-5"><ShieldAlert aria-hidden="true" className="size-8 text-destructive" /><div className="space-y-2"><h1 className="text-xl font-semibold">Akses lokasi ditolak</h1><p className="text-sm leading-6 text-muted-foreground">Lokasi yang terakhir dipilih tidak aktif, tidak ditemukan, atau di luar izin Anda. Pilih lokasi lain untuk melanjutkan.</p></div><Button asChild className="h-12 w-full"><Link href={SELECT_WORKSPACE_PATH}>Pilih lokasi</Link></Button><LogoutButton /></CardContent></Card>;
}
