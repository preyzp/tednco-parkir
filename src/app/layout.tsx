import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "../components/theme-provider";
import { Toaster } from "../components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TednCo Parkir",
  description: "Ruang kerja pengelolaan parkir TednCo Parkir.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          {/* One global toaster for login, Owner App and Platform Admin; follows the active theme. */}
          <Toaster position="top-center" closeButton containerAriaLabel="Notifikasi" toastOptions={{ closeButtonAriaLabel: "Tutup notifikasi" }} />
        </ThemeProvider>
      </body>
    </html>
  );
}
