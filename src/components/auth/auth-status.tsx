import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { LOGIN_PATH } from "../../lib/login";

export function AuthLoading() {
  return <Card><CardContent className="flex items-center justify-center gap-3 py-8 text-sm text-muted-foreground" role="status"><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />Memeriksa sesi...</CardContent></Card>;
}
export function AuthUnavailable() {
  return <Card><CardContent className="space-y-5"><h1 className="text-xl font-semibold">Layanan belum tersedia</h1><p className="text-sm leading-6 text-muted-foreground">Sesi Anda belum dapat diperiksa. Silakan coba lagi sebentar.</p><Button asChild variant="outline" className="h-12 w-full"><Link href={LOGIN_PATH}>Kembali ke halaman masuk</Link></Button></CardContent></Card>;
}
