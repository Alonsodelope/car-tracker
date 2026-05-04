import { db } from "@/lib/db/client";
import { dailyMarketSummary, listings, sources } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { MarketOverview } from "@/components/dashboard/MarketOverview";
import { DailySummary } from "@/components/dashboard/DailySummary";
import { ListingsSection } from "@/components/listings/ListingsSection";
import { VehicleSelector } from "@/components/VehicleSelector";
import { getProfile, VEHICLE_PROFILES } from "@/lib/collectors/base";
import { VariantAnalysis } from "@/components/porsche996/VariantAnalysis";
import { format } from "date-fns";
import { Suspense } from "react";

export const revalidate = 300;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { vehicle?: string };
}) {
  const profile = getProfile(searchParams.vehicle);

  const summaryHistory = await db
    .select()
    .from(dailyMarketSummary)
    .where(eq(dailyMarketSummary.vehicleKey, profile.key))
    .orderBy(desc(dailyMarketSummary.summaryDate))
    .limit(60);

  const todaySummary = summaryHistory[0] ?? null;
  const yesterdaySummary = summaryHistory[1] ?? null;

  const allListings = await db
    .select()
    .from(listings)
    .where(eq(listings.vehicleKey, profile.key))
    .orderBy(desc(listings.firstSeenAt));

  const allSources = await db.select().from(sources);
  const sourceNames: Record<number, string> = {};
  for (const s of allSources) sourceNames[s.id] = s.name;

  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-1">Market Intelligence</p>
          <h1 className="text-3xl font-black tracking-tight gradient-text">{profile.displayName}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {profile.stockType === "used" ? "Used" : "New"} ·{" "}
            {profile.yearMin === profile.yearMax
              ? String(profile.yearMin)
              : `${profile.yearMin}–${profile.yearMax}`}
            {profile.maxPrice ? ` · ≤$${(profile.maxPrice / 1000).toFixed(0)}k` : ""}
            {" "}· Cars.com + Autotrader
          </p>
        </div>
        <div className="flex flex-col sm:items-end gap-3">
          {/* Vehicle switcher */}
          <Suspense>
            <VehicleSelector currentKey={profile.key} />
          </Suspense>
          <p className="text-right hidden md:block">
            <span className="text-[11px] text-muted-foreground uppercase tracking-widest block">Last updated</span>
            <span className="text-sm font-semibold tabular">
              {todaySummary?.summaryDate
                ? new Date(todaySummary.summaryDate + "T12:00:00").toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })
                : "No data yet"}
            </span>
          </p>
        </div>
      </div>

      <MarketOverview today={todaySummary} yesterday={yesterdaySummary} />
      <DailySummary today={todaySummary} yesterday={yesterdaySummary} />
      <ListingsSection allListings={allListings} summaryHistory={summaryHistory} sourceNames={sourceNames} today={today} vehicleKey={profile.key} />
      {profile.key === "porsche-996-turbo" && <VariantAnalysis />}
    </div>
  );
}
