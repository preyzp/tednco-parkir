"use client";
import Link from "next/link";
import { AlertTriangle, Home, RotateCw } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { WorkspaceFrame } from "../../components/workspace/workspace-frame";
import { AUTHENTICATED_PATH } from "../../lib/login";

// Fallback for unexpected render errors in the Owner app. It never shows the
// error itself and never claims an operation succeeded or failed: a
// submission made just before may or may not have been saved. Only the
// digest (a hash Next.js also writes to the server log) is shown.
const safeDigest = /^[\w-]{1,64}$/;

export default function OwnerAppError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" && safeDigest.test(error.digest) ? error.digest : undefined;
  return (
    <WorkspaceFrame>
      <Card role="alert">
        <CardContent className="space-y-5">
          <AlertTriangle aria-hidden="true" className="size-8 text-muted-foreground" />
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Halaman belum dapat ditampilkan</h1>
            <p className="text-sm leading-6 text-muted-foreground">Terjadi gangguan saat memuat halaman ini. Jika Anda baru saja mencatat kendaraan, memproses keluar, atau menyimpan pengaturan, periksa hasilnya di daftar kendaraan atau halaman terkait sebelum mengulanginya.</p>
            {digest && <p className="text-xs text-muted-foreground">Kode referensi: <span className="font-mono">{digest}</span></p>}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" className="h-12" onClick={() => retry()}><RotateCw aria-hidden="true" />Coba lagi</Button>
            <Button asChild variant="outline" className="h-12"><Link href={AUTHENTICATED_PATH}><Home aria-hidden="true" />Kembali ke Beranda</Link></Button>
          </div>
        </CardContent>
      </Card>
    </WorkspaceFrame>
  );
}
