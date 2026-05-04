"use client";

import { useState, useMemo } from "react";
import { PriceTrends } from "@/components/dashboard/PriceTrends";
import { ListingsTable } from "@/components/listings/ListingsTable";
import type { Listing, DailyMarketSummary } from "@/lib/db/schema";

interface ListingsSectionProps {
  allListings: Listing[];
  summaryHistory: DailyMarketSummary[];
  sourceNames: Record<number, string>;
  today: string;
  vehicleKey: string;
}

function isFloridaListing(location: string | null): boolean {
  if (!location) return false;
  const loc = location.toLowerCase();
  return loc.endsWith(", fl") || loc.includes(", fl ") || loc === "fl" || loc.includes("florida");
}

export function ListingsSection({ allListings, summaryHistory, sourceNames, today, vehicleKey }: ListingsSectionProps) {
  const [floridaOnly, setFloridaOnly] = useState(false);
  const [bestDealsOnly, setBestDealsOnly] = useState(false);

  const activeListings = useMemo(
    () => allListings.filter((l) => l.status === "active"),
    [allListings]
  );

  const filteredActiveListings = useMemo(() => {
    let list = activeListings;
    if (floridaOnly) list = list.filter((l) => isFloridaListing(l.location));
    return list;
  }, [activeListings, floridaOnly]);

  return (
    <>
      <PriceTrends history={summaryHistory} activeListings={filteredActiveListings} />
      <ListingsTable
        listings={allListings}
        sourceNames={sourceNames}
        today={today}
        vehicleKey={vehicleKey}
        floridaOnly={floridaOnly}
        onFloridaOnlyChange={setFloridaOnly}
        bestDealsOnly={bestDealsOnly}
        onBestDealsOnlyChange={vehicleKey === "bmw-m2" ? setBestDealsOnly : undefined}
      />
    </>
  );
}
