import { db } from "@/lib/db/client";
import { listings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { Listing } from "@/lib/db/schema";
import { classifyTransmission } from "@/lib/market/fair-value";

// ─── Types ────────────────────────────────────────────────────────────────────

type Transmission = "manual" | "tiptronic" | "unknown";
type BodyType = "coupe" | "cabriolet" | "unknown";

interface ClassifiedListing extends Listing {
  transmission: Transmission;
  bodyType: BodyType;
  rareFlags: string[];
}

interface VariantStats {
  count: number;
  priceMin: number | null;
  priceMax: number | null;
  priceMedian: number | null;
  avgMileage: number | null;
  medianMileage: number | null;
}

// ─── Rare color definitions ───────────────────────────────────────────────────
// Standard/common 996 Turbo colors vs rare ones.
// Rare = low production, PTS, or high collector demand.

const RARE_COLORS = [
  "speed yellow",
  "cobalt blue",
  "lapis blue",
  "midnight blue",
  "rainforest green",
  "zanzibar",
  "orient red",
  "forest green",
  "basalt black",
  "ocean blue",
  "turquoise",
  "slate grey",
  "viola",
  "arena red",
  "paint to sample",
  "pts",
];

// ─── Classification helpers ───────────────────────────────────────────────────

function classify(listing: Listing): ClassifiedListing {
  const text = `${listing.title ?? ""} ${listing.trim ?? ""}`.toLowerCase();
  const colorText = (listing.exteriorColor ?? "").toLowerCase();

  // Transmission — use shared classifier (source-reported value first, text fallback)
  const txResult = classifyTransmission(listing);
  const transmission: Transmission =
    txResult === "manual" ? "manual"
    : txResult === "automatic" ? "tiptronic"
    : "unknown";

  // Body type
  let bodyType: BodyType = "unknown";
  if (
    text.includes("cabriolet") ||
    text.includes("cabrio") ||
    text.includes("convertible")
  ) {
    bodyType = "cabriolet";
  } else if (text.includes("coupe") || text.includes("hardtop") || text.includes("targa")) {
    bodyType = "coupe";
  }

  // Rare flags
  const rareFlags: string[] = [];

  // Turbo S — most valuable 996 Turbo variant (~550 hp, 2004-2005 only)
  if (text.includes("turbo s")) {
    rareFlags.push("Turbo S");
  }

  // X50 power kit (optional factory upgrade: 450→480 hp)
  if (text.includes("x50")) {
    rareFlags.push("X50 Power Kit");
  }

  // Aerokit Cup (factory sport aero package)
  if (text.includes("aerokit") || text.includes("aero kit")) {
    rareFlags.push("Aerokit Cup");
  }

  // Rare exterior colors
  const matchedColor = RARE_COLORS.find((rc) => colorText.includes(rc));
  if (matchedColor) {
    rareFlags.push(`Rare Color: ${listing.exteriorColor}`);
  }

  // Guards Red — common but highly desirable
  if (colorText.includes("guards red")) {
    rareFlags.push("Guards Red");
  }

  // Low mileage tiers
  if (listing.mileage != null && listing.mileage < 10_000) {
    rareFlags.push("Ultra-Low Mileage (<10k)");
  } else if (listing.mileage != null && listing.mileage < 20_000) {
    rareFlags.push("Low Mileage (<20k)");
  }

  return { ...listing, transmission, bodyType, rareFlags };
}

// ─── Stats computation ────────────────────────────────────────────────────────

function medianOf(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function computeStats(group: ClassifiedListing[]): VariantStats {
  const prices = group.map((l) => l.askingPrice).filter((p): p is number => p != null);
  const miles = group.map((l) => l.mileage).filter((m): m is number => m != null);

  return {
    count: group.length,
    priceMin: prices.length ? Math.min(...prices) : null,
    priceMax: prices.length ? Math.max(...prices) : null,
    priceMedian: medianOf(prices),
    avgMileage: miles.length ? Math.round(miles.reduce((a, b) => a + b, 0) / miles.length) : null,
    medianMileage: medianOf(miles),
  };
}

function fmt(n: number | null, prefix = ""): string {
  if (n == null) return "–";
  return `${prefix}${Math.round(n).toLocaleString()}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VariantCard({
  label,
  badge,
  badgeColor,
  stats,
  note,
}: {
  label: string;
  badge: string;
  badgeColor: string;
  stats: VariantStats;
  note?: string;
}) {
  if (stats.count === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 opacity-50">
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full ${badgeColor}`}>
            {badge}
          </span>
          <p className="text-sm font-semibold text-foreground">{label}</p>
        </div>
        <p className="text-xs text-muted-foreground">No listings found</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full ${badgeColor}`}>
          {badge}
        </span>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <span className="ml-auto text-xs text-muted-foreground tabular">{stats.count} listing{stats.count !== 1 ? "s" : ""}</span>
      </div>

      <div className="space-y-2.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Price range</span>
          <span className="font-medium tabular text-foreground">
            {stats.priceMin != null && stats.priceMax != null
              ? `${fmt(stats.priceMin, "$")} – ${fmt(stats.priceMax, "$")}`
              : "–"}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Median price</span>
          <span className="font-semibold tabular text-foreground">{fmt(stats.priceMedian, "$")}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Avg mileage</span>
          <span className="tabular text-muted-foreground">{fmt(stats.avgMileage)} mi</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Median mileage</span>
          <span className="tabular text-muted-foreground">{fmt(stats.medianMileage)} mi</span>
        </div>
      </div>

      {note && (
        <p className="mt-4 text-[11px] text-muted-foreground italic border-t border-border pt-3">{note}</p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export async function VariantAnalysis() {
  const raw = await db
    .select()
    .from(listings)
    .where(
      and(
        eq(listings.vehicleKey, "porsche-996-turbo"),
        eq(listings.status, "active")
      )
    );

  if (raw.length === 0) {
    return (
      <section>
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-base font-semibold text-foreground tracking-tight">996 Turbo Analysis</h2>
          <div className="flex-1 h-px bg-border/60" />
        </div>
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No active listings yet. Run a sync to populate data.</p>
        </div>
      </section>
    );
  }

  const classified = raw.map(classify);

  // ── Groups ──
  const manuals = classified.filter((l) => l.transmission === "manual");
  const tiptronic = classified.filter((l) => l.transmission === "tiptronic");
  const unknownTx = classified.filter((l) => l.transmission === "unknown");

  const coupes = classified.filter((l) => l.bodyType === "coupe");
  const cabriolets = classified.filter((l) => l.bodyType === "cabriolet");
  const unknownBody = classified.filter((l) => l.bodyType === "unknown");

  // ── Cross-groups (transmission × body) ──
  const manualCoupe = classified.filter((l) => l.transmission === "manual" && l.bodyType === "coupe");
  const manualCab   = classified.filter((l) => l.transmission === "manual" && l.bodyType === "cabriolet");
  const tipCoupe    = classified.filter((l) => l.transmission === "tiptronic" && l.bodyType === "coupe");
  const tipCab      = classified.filter((l) => l.transmission === "tiptronic" && l.bodyType === "cabriolet");

  // ── Rare listings ──
  const rareListings = classified.filter((l) => l.rareFlags.length > 0);
  const turboS = classified.filter((l) => l.rareFlags.includes("Turbo S"));

  // ── Market comparison notes ──
  const medManual = medianOf(manuals.map((l) => l.askingPrice).filter((p): p is number => p != null));
  const medTip    = medianOf(tiptronic.map((l) => l.askingPrice).filter((p): p is number => p != null));
  const medCoupe  = medianOf(coupes.map((l) => l.askingPrice).filter((p): p is number => p != null));
  const medCab    = medianOf(cabriolets.map((l) => l.askingPrice).filter((p): p is number => p != null));

  const manualPremium = medManual != null && medTip != null
    ? Math.round(medManual - medTip)
    : null;
  const cabPremium = medCab != null && medCoupe != null
    ? Math.round(medCab - medCoupe)
    : null;

  return (
    <div className="space-y-8">
      {/* ── Variant Classification Overview ── */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-base font-semibold text-foreground tracking-tight">996 Turbo — Variant Analysis</h2>
          <div className="flex-1 h-px bg-border/60" />
          <span className="text-xs text-muted-foreground tabular">{raw.length} total listings</span>
        </div>

        {/* Transmission + Body summary pills */}
        <div className="flex flex-wrap gap-3 mb-6">
          {[
            { label: "Manual", count: manuals.length, color: "bg-blue-100 text-blue-700" },
            { label: "Tiptronic", count: tiptronic.length, color: "bg-slate-100 text-slate-600" },
            { label: "Tx Unknown", count: unknownTx.length, color: "bg-amber-100 text-amber-700" },
            { label: "Coupe", count: coupes.length, color: "bg-indigo-100 text-indigo-700" },
            { label: "Cabriolet", count: cabriolets.length, color: "bg-teal-100 text-teal-700" },
            { label: "Body Unknown", count: unknownBody.length, color: "bg-amber-100 text-amber-700" },
          ].map(({ label, count, color }) => (
            <div key={label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${color}`}>
              <span>{label}</span>
              <span className="opacity-70">·</span>
              <span className="tabular">{count}</span>
            </div>
          ))}
        </div>

        {/* Variant cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <VariantCard
            label="Manual Coupe"
            badge="Manual · Coupe"
            badgeColor="bg-blue-100 text-blue-700"
            stats={computeStats(manualCoupe)}
            note="Most sought-after configuration. Manual 6-speed coupes command a premium with enthusiasts."
          />
          <VariantCard
            label="Tiptronic Coupe"
            badge="Tiptronic · Coupe"
            badgeColor="bg-slate-100 text-slate-600"
            stats={computeStats(tipCoupe)}
            note="Most common configuration in the market. Typically lower asking price than manual equivalent."
          />
          <VariantCard
            label="Manual Cabriolet"
            badge="Manual · Cabriolet"
            badgeColor="bg-teal-100 text-teal-700"
            stats={computeStats(manualCab)}
            note="Rarest and most valuable combination. Very limited production — commands a significant premium."
          />
          <VariantCard
            label="Tiptronic Cabriolet"
            badge="Tiptronic · Cabriolet"
            badgeColor="bg-teal-100 text-teal-700"
            stats={computeStats(tipCab)}
            note="Cabriolet open-top experience with automatic transmission. Rarer than coupe variants."
          />
        </div>
      </section>

      {/* ── Market Differentials ── */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-base font-semibold text-foreground tracking-tight">Market Differentials</h2>
          <div className="flex-1 h-px bg-border/60" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Manual vs Tiptronic */}
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Manual vs Tiptronic</p>
            <div className="flex gap-6 mb-4">
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">Manual median</p>
                <p className="text-2xl font-bold tabular text-foreground">{fmt(medManual, "$")}</p>
              </div>
              <div className="w-px bg-border" />
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">Tiptronic median</p>
                <p className="text-2xl font-bold tabular text-foreground">{fmt(medTip, "$")}</p>
              </div>
            </div>
            {manualPremium != null && (
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${manualPremium > 0 ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-600"}`}>
                {manualPremium > 0
                  ? `Manual commands +${fmt(manualPremium, "$")} premium`
                  : manualPremium < 0
                  ? `Tiptronic is ${fmt(Math.abs(manualPremium), "$")} higher`
                  : "No price differential detected"}
              </div>
            )}
            {manualPremium == null && (
              <p className="text-xs text-muted-foreground">Insufficient data for comparison</p>
            )}
          </div>

          {/* Coupe vs Cabriolet */}
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Coupe vs Cabriolet</p>
            <div className="flex gap-6 mb-4">
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">Coupe median</p>
                <p className="text-2xl font-bold tabular text-foreground">{fmt(medCoupe, "$")}</p>
              </div>
              <div className="w-px bg-border" />
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">Cabriolet median</p>
                <p className="text-2xl font-bold tabular text-foreground">{fmt(medCab, "$")}</p>
              </div>
            </div>
            {cabPremium != null && (
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${cabPremium > 0 ? "bg-teal-50 text-teal-700" : "bg-slate-50 text-slate-600"}`}>
                {cabPremium > 0
                  ? `Cabriolet commands +${fmt(cabPremium, "$")} premium`
                  : cabPremium < 0
                  ? `Coupe is ${fmt(Math.abs(cabPremium), "$")} higher`
                  : "No price differential detected"}
              </div>
            )}
            {cabPremium == null && (
              <p className="text-xs text-muted-foreground">Insufficient data for comparison</p>
            )}
          </div>
        </div>
      </section>

      {/* ── Rare Specs & Colors ── */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-base font-semibold text-foreground tracking-tight">Rare Specs & Colors</h2>
          <div className="flex-1 h-px bg-border/60" />
          <span className="text-xs text-muted-foreground tabular">
            {rareListings.length} flagged listing{rareListings.length !== 1 ? "s" : ""}
          </span>
        </div>

        {rareListings.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-5 text-center">
            <p className="text-sm text-muted-foreground">No rare specs detected in current listings.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-gray-50">
                    {["Year", "Vehicle", "Price", "Mileage", "Color", "Rare Flags"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rareListings.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3.5 text-sm font-semibold tabular text-foreground">{l.year ?? "–"}</td>
                      <td className="px-4 py-3.5 text-sm min-w-[180px]">
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-foreground hover:text-primary transition-colors"
                        >
                          {l.title ?? "Porsche 911 Turbo"}
                        </a>
                        {l.trim && <p className="text-[11px] text-muted-foreground mt-0.5">{l.trim}</p>}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-bold tabular text-foreground">
                        {l.askingPrice ? `$${l.askingPrice.toLocaleString()}` : "–"}
                      </td>
                      <td className="px-4 py-3.5 text-sm tabular text-muted-foreground">
                        {l.mileage ? `${l.mileage.toLocaleString()} mi` : "–"}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-muted-foreground max-w-[120px] truncate">
                        {l.exteriorColor ?? "–"}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          {l.rareFlags.map((flag) => (
                            <span
                              key={flag}
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap
                                ${flag === "Turbo S"
                                  ? "bg-amber-100 text-amber-800 border border-amber-200"
                                  : flag.startsWith("Rare Color")
                                  ? "bg-purple-100 text-purple-800 border border-purple-200"
                                  : flag.includes("Low Mileage") || flag.includes("Ultra-Low")
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  : "bg-blue-100 text-blue-800 border border-blue-200"
                                }`}
                            >
                              {flag.startsWith("Rare Color") ? "◆ " : flag === "Turbo S" ? "★ " : ""}
                              {flag}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Summary & Key Observations ── */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-base font-semibold text-foreground tracking-tight">Market Summary</h2>
          <div className="flex-1 h-px bg-border/60" />
        </div>

        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Key Observations · Porsche 911 996 Turbo 2000–2005</p>

          <ul className="space-y-3">
            <li className="flex gap-3 text-sm">
              <span className="text-muted-foreground shrink-0 mt-0.5">—</span>
              <span className="text-foreground">
                <strong>{raw.length} active listings</strong> tracked across Cars.com and Autotrader.
                {` `}{manuals.length > 0 && `${manuals.length} manual (${Math.round(manuals.length / raw.length * 100)}%), `}
                {tiptronic.length > 0 && `${tiptronic.length} Tiptronic (${Math.round(tiptronic.length / raw.length * 100)}%).`}
              </span>
            </li>

            {manualPremium != null && manualPremium !== 0 && (
              <li className="flex gap-3 text-sm">
                <span className="text-muted-foreground shrink-0 mt-0.5">—</span>
                <span className="text-foreground">
                  Manual transmission listings show a{" "}
                  <strong className="text-blue-700">{manualPremium > 0 ? "+" : ""}{fmt(manualPremium, "$")} median price differential</strong>{" "}
                  vs Tiptronic — consistent with enthusiast demand for the 6-speed.
                </span>
              </li>
            )}

            {cabPremium != null && cabriolets.length > 0 && (
              <li className="flex gap-3 text-sm">
                <span className="text-muted-foreground shrink-0 mt-0.5">—</span>
                <span className="text-foreground">
                  Cabriolets represent <strong>{cabriolets.length} listings ({Math.round(cabriolets.length / raw.length * 100)}%)</strong> of the market.
                  {cabPremium !== 0 && ` Median ${cabPremium > 0 ? "premium" : "discount"} of ${fmt(Math.abs(cabPremium), "$")} vs coupe.`}
                </span>
              </li>
            )}

            {turboS.length > 0 && (
              <li className="flex gap-3 text-sm">
                <span className="text-muted-foreground shrink-0 mt-0.5">—</span>
                <span className="text-foreground">
                  <strong className="text-amber-700">{turboS.length} Turbo S</strong> variant{turboS.length > 1 ? "s" : ""} detected — the highest-spec factory 996 Turbo, with ~540 hp and significant collector premium.
                </span>
              </li>
            )}

            {rareListings.length > 0 && (
              <li className="flex gap-3 text-sm">
                <span className="text-muted-foreground shrink-0 mt-0.5">—</span>
                <span className="text-foreground">
                  <strong>{rareListings.length} listing{rareListings.length > 1 ? "s" : ""}</strong> flagged with rare specs or colors.
                  {` `}Rare-spec units typically trade significantly above median market value.
                </span>
              </li>
            )}

            {unknownTx.length > 0 && (
              <li className="flex gap-3 text-sm">
                <span className="text-muted-foreground shrink-0 mt-0.5">—</span>
                <span className="text-muted-foreground text-xs italic">
                  {unknownTx.length} listing{unknownTx.length > 1 ? "s" : ""} could not be classified by transmission from available title/trim data. Check individual listings for specs.
                </span>
              </li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
