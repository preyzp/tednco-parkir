import type { ReactNode } from "react";
import { ParkingCircle, ShieldCheck } from "lucide-react";
import { ThemeSwitcher } from "../theme-switcher";

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-[1fr_1fr]">
      <aside className="hidden flex-col justify-between bg-[#073d32] px-12 py-10 text-white xl:px-20 lg:flex" aria-label="TednCo Parkir">
        <div className="flex items-center gap-3 text-xl font-semibold tracking-tight"><ParkingCircle aria-hidden="true" className="size-9 text-emerald-300" />TednCo Parkir</div>
        <div className="max-w-lg space-y-6 py-16">
          <p className="text-sm font-medium tracking-[0.18em] text-emerald-200 uppercase">Ruang kerja Anda</p>
          <h2 className="text-4xl leading-tight font-semibold tracking-tight xl:text-5xl">Operasional parkir,<br />lebih tertata.</h2>
          <p className="max-w-sm text-base leading-7 text-emerald-100/85">Masuk dan lanjutkan aktivitas Anda. Satu tempat untuk pekerjaan parkir sehari-hari.</p>
        </div>
        <p className="flex items-center gap-2 text-sm text-emerald-100/80"><ShieldCheck aria-hidden="true" className="size-4" />Gunakan akun yang diberikan pengelola Anda.</p>
      </aside>
      <section className="flex min-w-0 flex-col px-4 py-5 sm:px-8 lg:px-12">
        <header className="flex min-h-11 items-center justify-between gap-3 lg:justify-end">
          <div className="flex items-center gap-2 font-semibold tracking-tight lg:hidden"><ParkingCircle aria-hidden="true" className="size-7 text-primary" /><span>TednCo Parkir</span></div>
          <ThemeSwitcher />
        </header>
        <div className="flex flex-1 items-center justify-center py-10 sm:py-16"><div className="w-full max-w-[440px]">{children}</div></div>
        <footer className="pb-2 text-center text-xs text-muted-foreground">TednCo Parkir · Akses untuk pengelola parkir</footer>
      </section>
    </main>
  );
}
