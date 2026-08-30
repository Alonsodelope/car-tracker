"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The header shows "Car Tracker" everywhere, except on /bragi — that link
// is Bragi's personal copy of the dashboard, so it's branded with his name
// instead.
export function BrandName() {
  const pathname = usePathname();
  const isBragi = pathname?.startsWith("/bragi");

  return (
    <Link
      href="/"
      className="text-sm font-semibold text-foreground hover:text-primary transition-colors tracking-tight"
    >
      {isBragi ? "Bragi" : "Car Tracker"}
    </Link>
  );
}
