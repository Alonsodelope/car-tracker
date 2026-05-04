import type { Listing } from "../db/schema";
import type { DealStatus } from "@/types";

// ─── Good deal threshold ──────────────────────────────────────────────────────
// Good deal  = price is ≥8% BELOW fair value
// Fair deal  = price is within ±8% of fair value
// Overpriced = price is >8% ABOVE fair value

const GOOD_DEAL_THRESHOLD = -0.08;
const OVERPRICED_THRESHOLD = 0.08;

// ─── Median helper ────────────────────────────────────────────────────────────

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ─── Fair value estimation ────────────────────────────────────────────────────

export function estimateFairValue(
  listing: Listing,
  allActive: Listing[]
): number | null {
  if (!listing.askingPrice) return null;

  // Filter to close comparables: same year ±1, similar mileage ±20k
  const comparables = allActive.filter((c) => {
    if (c.id === listing.id) return false;
    if (!c.askingPrice) return false;
    if (listing.year && c.year && Math.abs(c.year - listing.year) > 1)
      return false;
    if (
      listing.mileage != null &&
      c.mileage != null &&
      Math.abs(c.mileage - listing.mileage) > 20_000
    )
      return false;
    return true;
  });

  // Need at least 3 comparables for a reliable estimate, otherwise use all
  const pool =
    comparables.length >= 3
      ? comparables
      : allActive.filter((c) => c.id !== listing.id && c.askingPrice);

  if (pool.length === 0) return listing.askingPrice;

  return median(pool.map((c) => c.askingPrice!));
}

// ─── Deal classification ──────────────────────────────────────────────────────

export function classifyDeal(
  price: number,
  fairValue: number | null
): DealStatus {
  if (fairValue === null) return "unknown";
  const pct = (price - fairValue) / fairValue;
  if (pct <= GOOD_DEAL_THRESHOLD) return "good";
  if (pct <= OVERPRICED_THRESHOLD) return "fair";
  return "overpriced";
}

export function priceDelta(
  price: number,
  fairValue: number | null
): { amount: number | null; pct: number | null } {
  if (fairValue === null) return { amount: null, pct: null };
  const amount = price - fairValue;
  const pct = (amount / fairValue) * 100;
  return { amount: Math.round(amount), pct: Math.round(pct * 10) / 10 };
}

// ─── Transmission classification ─────────────────────────────────────────────

export type TransmissionType = "manual" | "automatic" | "unknown";

/**
 * Derives transmission type for a listing.
 *
 * Priority order:
 * 1. Source-reported value stored in listings.transmission ("manual" | "automatic")
 * 2. Text signals in title + trim (catches cases where source didn't provide it)
 *
 * Returns "unknown" only when no signal is found after exhausting all checks.
 */
export function classifyTransmission(listing: Listing): TransmissionType {
  // 1. Use the source-reported value if it was stored during sync
  if (listing.transmission === "manual") return "manual";
  if (listing.transmission === "automatic") return "automatic";

  // 2. Text-based fallback — title and trim
  const text = `${listing.title ?? ""} ${listing.trim ?? ""}`.toLowerCase();

  const MANUAL_SIGNALS = [
    "manual", "6-speed manual", "6 speed manual",
    "6-spd", "6spd", " 6sp", "m/t", "stick shift",
    "3-speed", "4-speed manual", "5-speed manual",
  ];
  const AUTOMATIC_SIGNALS = [
    "tiptronic", "automatic", "auto trans", "pdk",
    "a/t", "dsg", "dct", "cvt",
    "4-speed auto", "5-speed auto", "6-speed auto",
    "7-speed", "8-speed", "9-speed", "10-speed",
  ];

  if (MANUAL_SIGNALS.some((s) => text.includes(s))) return "manual";
  if (AUTOMATIC_SIGNALS.some((s) => text.includes(s))) return "automatic";

  return "unknown";
}

// ─── Batch enrichment ─────────────────────────────────────────────────────────

export function enrichListingsWithDealStatus(listings: Listing[]): Array<
  Listing & {
    fairValue: number | null;
    dealStatus: DealStatus;
    priceDeltaAmount: number | null;
    priceDeltaPct: number | null;
  }
> {
  return listings.map((l) => {
    const fairValue = estimateFairValue(l, listings);
    const dealStatus = l.askingPrice
      ? classifyDeal(l.askingPrice, fairValue)
      : "unknown";
    const delta = l.askingPrice ? priceDelta(l.askingPrice, fairValue) : { amount: null, pct: null };

    return {
      ...l,
      fairValue,
      dealStatus,
      priceDeltaAmount: delta.amount,
      priceDeltaPct: delta.pct,
    };
  });
}
