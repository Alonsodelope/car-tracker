import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Car Tracker",
  description: "Daily market intelligence for used car listings",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <div className="min-h-screen bg-background">
          {/* Top nav */}
          <header className="sticky top-0 z-50 border-b border-border bg-white/95 backdrop-blur-xl shadow-sm">
            <div className="h-0.5 w-full bg-[hsl(215,77%,46%)]" />
            <div className="mx-auto max-w-7xl px-6 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Logo mark */}
                <div className="relative w-8 h-8">
                  <div className="absolute inset-0 rounded-lg bg-[hsl(215,77%,46%)]/20 blur-sm" />
                  <div className="relative w-8 h-8 rounded-lg flex items-center justify-center shadow-lg overflow-hidden bg-[hsl(215,77%,46%)]">
                    <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
                      <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
                    </svg>
                  </div>
                </div>
                <div>
                  <Link href="/" className="text-sm font-semibold text-foreground hover:text-primary transition-colors tracking-tight">
                    Car Tracker
                  </Link>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-dot" />
                    <p className="text-[10px] text-muted-foreground tracking-wide uppercase">
                      Market Intelligence
                    </p>
                  </div>
                </div>
              </div>
              <nav className="flex items-center gap-1">
                <Link
                  href="/"
                  className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-gray-100 rounded-md transition-all"
                >
                  Dashboard
                </Link>
                <Link
                  href="/admin"
                  className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-gray-100 rounded-md transition-all"
                >
                  Admin
                </Link>
              </nav>
            </div>
          </header>

          <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>

          <footer className="border-t border-border mt-16">
            <div className="mx-auto max-w-7xl px-6 py-4 flex justify-between items-center">
              <span className="text-xs text-muted-foreground/60">Car Tracker · Personal use only</span>
              <span className="text-xs text-muted-foreground/60">Cars.com · Autotrader</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
