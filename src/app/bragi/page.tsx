import { db } from "@/lib/db/client";
import { dailyMarketSummary, listings, sources } from "@/lib/db/schema";
import { desc, eq, and } from "drizzle-orm";
import { getProfile } from "@/lib/collectors/base";
import { enrichListingsWithDealStatus } from "@/lib/market/fair-value";
import type { Metadata } from "next";
import { ExternalLink, MapPin, Gauge, Clock } from "lucide-react";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Future Garage — Mercedes-AMG C 63 S",
  description: "Live market feed for the Mercedes-AMG C 63 S.",
};

const VEHICLE_KEY = "mercedes-c63s-w206";

function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  return `$${Math.round(n).toLocaleString()}`;
}

export default async function BragiPage() {
  const profile = getProfile(VEHICLE_KEY);

  const [todaySummary] = await db
    .select()
    .from(dailyMarketSummary)
    .where(eq(dailyMarketSummary.vehicleKey, profile.key))
    .orderBy(desc(dailyMarketSummary.summaryDate))
    .limit(1);

  const activeListings = await db
    .select()
    .from(listings)
    .where(and(eq(listings.vehicleKey, profile.key), eq(listings.status, "active")))
    .orderBy(listings.askingPrice);

  const allSources = await db.select().from(sources);
  const sourceNames: Record<number, string> = {};
  for (const s of allSources) sourceNames[s.id] = s.name;

  const enriched = enrichListingsWithDealStatus(activeListings).sort(
    (a, b) => (a.askingPrice ?? 0) - (b.askingPrice ?? 0)
  );

  const lastUpdated = todaySummary?.summaryDate
    ? new Date(todaySummary.summaryDate + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(255,90,160,0.18), transparent), radial-gradient(ellipse 60% 40% at 90% 10%, rgba(0,220,255,0.12), transparent), #07070d",
        color: "#eef0fb",
      }}
    >
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-white/10">
        {/* Horizon grid */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-40 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0,220,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,220,255,0.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "linear-gradient(to top, black, transparent)",
            WebkitMaskImage: "linear-gradient(to top, black, transparent)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 py-16 sm:py-20 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] mb-4" style={{ color: "#ff5aa0" }}>
            For Bragi
          </p>
          <h1
            className="text-5xl sm:text-6xl font-black tracking-tight uppercase"
            style={{
              backgroundImage: "linear-gradient(135deg, #ff5aa0 0%, #ffb454 45%, #00dcff 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              letterSpacing: "0.04em",
            }}
          >
            Future Garage
          </h1>
          <p className="mt-4 text-base sm:text-lg text-white/70">
            Live market feed · {profile.displayName}
          </p>
          {lastUpdated && (
            <p className="mt-2 text-xs uppercase tracking-widest text-white/40">Updated {lastUpdated}</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
          {[
            { label: "Active Listings", value: String(todaySummary?.totalActive ?? enriched.length) },
            { label: "Avg Price", value: money(todaySummary?.avgPrice ? parseFloat(String(todaySummary.avgPrice)) : null) },
            { label: "Median Price", value: money(todaySummary?.medianPrice ? parseFloat(String(todaySummary.medianPrice)) : null) },
            { label: "Avg Mileage", value: todaySummary?.avgMileage ? `${Math.round(parseFloat(String(todaySummary.avgMileage))).toLocaleString()} mi` : "–" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl p-5 border"
              style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)" }}
            >
              <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">{s.label}</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: "#00dcff" }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Listings */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {enriched.map((l) => {
            const dealStyle =
              l.dealStatus === "good"
                ? { label: `Good Deal${l.priceDeltaPct != null ? ` ${Math.abs(l.priceDeltaPct).toFixed(0)}% below` : ""}`, color: "#3ddc84", bg: "rgba(61,220,132,0.12)" }
                : l.dealStatus === "overpriced"
                  ? { label: `Overpriced${l.priceDeltaPct != null ? ` +${l.priceDeltaPct.toFixed(0)}%` : ""}`, color: "#ff5a6e", bg: "rgba(255,90,110,0.12)" }
                  : l.dealStatus === "fair"
                    ? { label: "Fair", color: "#ffb454", bg: "rgba(255,180,84,0.12)" }
                    : { label: "–", color: "rgba(255,255,255,0.4)", bg: "rgba(255,255,255,0.05)" };

            return (
              <a
                key={l.id}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-xl overflow-hidden border transition-all hover:-translate-y-0.5"
                style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)" }}
              >
                {l.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.imageUrl} alt={l.title ?? "Listing photo"} className="w-full h-40 object-cover" />
                )}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                      {sourceNames[l.sourceId] ?? "source"}
                    </span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ color: dealStyle.color, background: dealStyle.bg }}
                    >
                      {dealStyle.label}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-white/90 leading-snug mb-1">
                    {l.year} {l.trim ? `Mercedes-AMG ${l.trim}` : l.title}
                  </p>
                  <p className="text-2xl font-black mb-3" style={{ color: "#ffb454" }}>
                    {money(l.askingPrice)}
                  </p>
                  <div className="space-y-1.5 text-xs text-white/50">
                    {l.mileage != null && (
                      <div className="flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5" /> {l.mileage.toLocaleString()} mi
                      </div>
                    )}
                    {l.location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" /> {l.location}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2">
                      <span className="flex items-center gap-1.5 text-white/30">
                        <Clock className="w-3.5 h-3.5" />
                        {Math.max(0, Math.round((Date.now() - new Date(l.firstSeenAt).getTime()) / 86_400_000))}d listed
                      </span>
                      <span
                        className="flex items-center gap-1 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: "#00dcff" }}
                      >
                        Open <ExternalLink className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </div>
              </a>
            );
          })}
        </div>

        {enriched.length === 0 && (
          <p className="text-center text-white/40 py-20">No active listings right now — check back soon.</p>
        )}

        <p className="text-center text-[11px] text-white/25 uppercase tracking-widest mt-16 pb-8">
          Future Garage · Mercedes-AMG C 63 S market feed
        </p>
      </div>
    </div>
  );
}
