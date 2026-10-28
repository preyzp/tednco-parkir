import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "./ui/button";

// Shared "Kembali" control placed above a sub-page title. Always a plain
// internal link (no router.back()), so it works on direct visits too; `to`
// names the destination for screen readers.
export function BackLink({ href, to }: { href: string; to: string }) {
  return (
    <Button asChild variant="ghost" className="-ml-3 h-11 w-fit">
      <Link href={href} aria-label={`Kembali ke ${to}`}><ArrowLeft aria-hidden="true" />Kembali</Link>
    </Button>
  );
}
