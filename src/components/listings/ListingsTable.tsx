"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DealBadge } from "./DealBadge";
import { enrichListingsWithDealStatus, classifyTransmission, type TransmissionType } from "@/lib/market/fair-value";
import { useReviewStatus } from "@/lib/useReviewStatus";
import type { Listing } from "@/lib/db/schema";
import { format, differenceInDays } from "date-fns";
import { ExternalLink } from "lucide-react";

type SortKey = "askingPrice" | "mileage" | "year" | "daysOnMarket" | "dealStatus";
type SortDir = "asc" | "desc";

const M2_BEST_DEAL_MAX_PRICE = 63_000;
const M2_BEST_DEAL_MAX_MILEAGE = 18_000;

interface ListingsTableProps {
  listings: Listing[];
  sourceNames: Record<number, string>;
  today?: string;
  vehicleKey: string;
  floridaOnly?: boolean;
  onFloridaOnlyChange?: (v: boolean) => void;
  bestDealsOnly?: boolean;
  onBestDealsOnlyChange?: (v: boolean) => void;
}

function isSeedListing(externalId: string | null): boolean {
  return externalId?.startsWith("SEED-") ?? false;
}

function isFloridaListing(location: string | null): boolean {
  if (!location) return false;
  const loc = location.toLowerCase();
  return loc.endsWith(", fl") || loc.includes(", fl ") || loc === "fl" || loc.includes("florida");
}

function isM2BestDeal(l: { askingPrice: number | null; mileage: number | null }): boolean {
  return (
    l.askingPrice != null &&
    l.mileage != null &&
    l.askingPrice <= M2_BEST_DEAL_MAX_PRICE &&
    l.mileage < M2_BEST_DEAL_MAX_MILEAGE
  );
}

function Toggle({ on, onChange, label, color }: { on: boolean; onChange: () => void; label: string; color: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer ml-1">
      <div
        onClick={onChange}
        className={`w-8 h-4 rounded-full transition-colors cursor-pointer ${on ? color : "bg-muted-foreground/20"}`}
      >
        <div className={`w-3 h-3 rounded-full bg-white shadow mt-0.5 transition-transform ${on ? "translate-x-4.5" : "translate-x-0.5"}`} />
      </div>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </label>
  );
}

export function ListingsTable({
  listings,
  sourceNames,
  today,
  vehicleKey,
  floridaOnly = false,
  onFloridaOnlyChange,
  bestDealsOnly = false,
  onBestDealsOnlyChange,
}: ListingsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("askingPrice");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterGoodOnly, setFilterGoodOnly] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"active" | "all">("active");
  const [filterTransmission, setFilterTransmission] = useState<TransmissionType | "all">("all");

  const { reviews, toggle } = useReviewStatus(vehicleKey);

  const todayStr = today ?? format(new Date(), "yyyy-MM-dd");
  const enriched = useMemo(() => enrichListingsWithDealStatus(listings), [listings]);

  const withMeta = useMemo(() =>
    enriched.map((l) => ({
      ...l,
      daysOnMarket: differenceInDays(new Date(), new Date(l.firstSeenAt)),
      isNew: format(new Date(l.firstSeenAt), "yyyy-MM-dd") === todayStr,
      isSeed: isSeedListing(l.externalId),
      transmission: classifyTransmission(l),
      isFL: isFloridaListing(l.location),
      isBestDeal: vehicleKey === "bmw-m2" ? isM2BestDeal(l) : false,
    })), [enriched, todayStr, vehicleKey]);

  const uniqueSources = useMemo(() => Array.from(new Set(Object.values(sourceNames))), [sourceNames]);
  const uniqueYears = useMemo(() =>
    Array.from(new Set(listings.map(l => l.year).filter(Boolean) as number[])).sort((a, b) => b - a),
    [listings]);

  const filtered = useMemo(() =>
    withMeta.filter(l => {
      if (filterStatus === "active" && l.status !== "active") return false;
      if (filterSource !== "all" && sourceNames[l.sourceId] !== filterSource) return false;
      if (filterYear !== "all" && String(l.year) !== filterYear) return false;
      if (filterTransmission !== "all" && l.transmission !== filterTransmission) return false;
      if (floridaOnly && !l.isFL) return false;
      if (filterGoodOnly && l.dealStatus !== "good") return false;
      if (bestDealsOnly && vehicleKey === "bmw-m2" && !l.isBestDeal) return false;
      return true;
    }), [withMeta, filterStatus, filterSource, filterYear, filterTransmission, floridaOnly, filterGoodOnly, bestDealsOnly, sourceNames]);

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "askingPrice": av = a.askingPrice ?? Infinity; bv = b.askingPrice ?? Infinity; break;
        case "mileage":     av = a.mileage ?? Infinity;     bv = b.mileage ?? Infinity;     break;
        case "year":        av = a.year ?? 0;               bv = b.year ?? 0;               break;
        case "daysOnMarket":av = a.daysOnMarket;            bv = b.daysOnMarket;            break;
        case "dealStatus": {
          const o = { good: 0, fair: 1, overpriced: 2, unknown: 3 };
          av = o[a.dealStatus] ?? 3; bv = o[b.dealStatus] ?? 3; break;
        }
        default: av = 0; bv = 0;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    }), [filtered, sortKey, sortDir]);

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="ml-1 opacity-20">↕</span>;
    return <span className="ml-1 text-primary">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const th = "px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-widest cursor-pointer hover:text-foreground select-none whitespace-nowrap";
  const td = "px-4 py-3.5 text-sm";

  const bestDealsCount = useMemo(() => withMeta.filter(l => l.status === "active" && l.isBestDeal).length, [withMeta]);

  return (
    <section>
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-base font-semibold text-foreground tracking-tight">Listings</h2>
        <div className="flex-1 h-px bg-border/60" />
        <span className="text-xs text-muted-foreground tabular">{sorted.length} listing{sorted.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Filter bar */}
        <div className="px-4 py-3 border-b border-border flex flex-wrap gap-3 items-center bg-gray-50">
          {[
            { label: "Source",       value: filterSource,       onChange: setFilterSource,       opts: [["all","All Sources"], ...uniqueSources.map(s => [s, s])] },
            { label: "Year",         value: filterYear,         onChange: setFilterYear,         opts: [["all","All Years"],   ...uniqueYears.map(y => [String(y), String(y)])] },
            { label: "Status",       value: filterStatus,       onChange: (v: string) => setFilterStatus(v as "active" | "all"),           opts: [["active","Active Only"],["all","Show All"]] },
            { label: "Transmission", value: filterTransmission, onChange: (v: string) => setFilterTransmission(v as TransmissionType | "all"), opts: [["all","All Transmissions"],["manual","Manual"],["automatic","Automatic"],["unknown","Unknown"]] },
          ].map(({ label, value, onChange, opts }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{label}</span>
              <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="text-xs bg-white border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}

          <Toggle on={floridaOnly} onChange={() => onFloridaOnlyChange?.(!floridaOnly)} label="🌴 Florida only" color="bg-sky-500" />
          <Toggle on={filterGoodOnly} onChange={() => setFilterGoodOnly(v => !v)} label="Good deals only" color="bg-emerald-500" />
          {vehicleKey === "bmw-m2" && onBestDealsOnlyChange && (
            <Toggle
              on={bestDealsOnly}
              onChange={() => onBestDealsOnlyChange(!bestDealsOnly)}
              label={`⭐ M2 Best Deals${bestDealsOnly ? "" : bestDealsCount > 0 ? ` (${bestDealsCount})` : ""}`}
              color="bg-amber-400"
            />
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className={th}>Source</th>
                <th className={th} onClick={() => handleSort("year")}>Year <SortIcon k="year" /></th>
                <th className={`${th} min-w-[200px]`}>Vehicle</th>
                <th className={th} onClick={() => handleSort("askingPrice")}>Price <SortIcon k="askingPrice" /></th>
                <th className={th} onClick={() => handleSort("mileage")}>Mileage <SortIcon k="mileage" /></th>
                <th className={th}>Location</th>
                <th className={th} onClick={() => handleSort("daysOnMarket")}>DOM <SortIcon k="daysOnMarket" /></th>
                <th className={th} onClick={() => handleSort("dealStatus")}>Deal <SortIcon k="dealStatus" /></th>
                <th className={th}>Review</th>
                <th className={th}>Link</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No listings match your filters.
                  </td>
                </tr>
              )}
              {sorted.map((l) => {
                const reviewKey = l.id;
                const review = reviews[l.id] ?? null;
                const isBad = review === "bad";
                const isGood = review === "good";

                return (
                  <tr
                    key={l.id}
                    className={`table-row-hover border-b border-border last:border-0 transition-opacity ${
                      l.status === "removed" ? "opacity-40" :
                      isBad ? "opacity-30" : ""
                    } ${isGood ? "bg-emerald-50/60" : ""}`}
                  >
                    {/* Source */}
                    <td className={td}>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {sourceNames[l.sourceId] === "cars.com" ? "Cars.com" : sourceNames[l.sourceId] === "autotrader" ? "AutoTrdr" : sourceNames[l.sourceId] === "bringatrailer" ? "BaT" : sourceNames[l.sourceId] ?? "–"}
                      </Badge>
                    </td>

                    {/* Year */}
                    <td className={`${td} font-semibold tabular text-foreground`}>{l.year ?? "–"}</td>

                    {/* Vehicle + badges */}
                    <td className={td}>
                      <div className="flex items-start gap-2">
                        <div>
                          <Link
                            href={`/listings/${l.id}`}
                            className="font-medium text-foreground hover:text-primary transition-colors"
                          >
                            {l.isBestDeal && <span className="mr-1" title="M2 Best Deal">⭐</span>}
                            {l.title ?? "BMW M2"}
                          </Link>
                          {l.trim && <p className="text-[11px] text-muted-foreground mt-0.5">{l.trim}</p>}
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {l.isNew && l.status === "active" && <Badge variant="info" className="text-[10px]">New</Badge>}
                            {l.status === "removed" && <Badge variant="ghost" className="text-[10px]">Removed</Badge>}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Price */}
                    <td className={`${td} font-bold tabular text-foreground text-base`}>
                      {l.askingPrice ? `$${l.askingPrice.toLocaleString()}` : "–"}
                    </td>

                    {/* Mileage */}
                    <td className={`${td} tabular text-muted-foreground`}>
                      {l.mileage ? `${l.mileage.toLocaleString()} mi` : "–"}
                    </td>

                    {/* Location */}
                    <td className={`${td} text-muted-foreground text-xs max-w-[140px]`}>
                      <span className="flex items-center gap-1 truncate">
                        {l.isFL && <span title="Florida">🌴</span>}
                        <span className="truncate">{l.location ?? "–"}</span>
                      </span>
                    </td>

                    {/* Days on market */}
                    <td className={`${td} tabular text-muted-foreground`}>
                      {l.daysOnMarket > 0 ? `${l.daysOnMarket}d` : "New"}
                    </td>

                    {/* Deal badge */}
                    <td className={td}>
                      <DealBadge status={l.dealStatus} pctDiff={l.priceDeltaPct} />
                    </td>

                    {/* Review */}
                    <td className={td}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggle(l.id, "good")}
                          title="Good option"
                          className={`text-base leading-none px-1.5 py-1 rounded transition-all ${
                            isGood
                              ? "bg-emerald-100 ring-1 ring-emerald-400 scale-110"
                              : "opacity-30 hover:opacity-80"
                          }`}
                        >
                          👍
                        </button>
                        <button
                          onClick={() => toggle(l.id, "bad")}
                          title="Not interested"
                          className={`text-base leading-none px-1.5 py-1 rounded transition-all ${
                            isBad
                              ? "bg-red-100 ring-1 ring-red-400 scale-110"
                              : "opacity-30 hover:opacity-80"
                          }`}
                        >
                          👎
                        </button>
                      </div>
                    </td>

                    {/* Direct external link */}
                    <td className={td}>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={l.isSeed ? "Demo listing — link may not resolve" : "Open original listing"}
                        className="ext-link-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-all"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
