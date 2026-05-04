/**
 * Seed 30 days of realistic BMW M2 market data so the dashboard
 * renders with real-looking trend data before live collection runs.
 *
 * Run: pnpm seed
 */

import "dotenv/config";
import { db } from "../src/lib/db/client";
import {
  sources,
  listings,
  listingSnapshots,
  dailyMarketSummary,
  priceChanges,
} from "../src/lib/db/schema";
import { format, subDays } from "date-fns";
import { eq, sql } from "drizzle-orm";

// ─── Seed data ────────────────────────────────────────────────────────────────

const TRIMS = ["Base", "Base", "Base", "Competition Package", "M xDrive"];
const COLORS = ["Black Sapphire", "Zandvoort Blue", "Isle of Man Green", "Brooklyn Grey", "Alpine White", "Frozen Portimao Blue"];
const COLORS_INT = ["Black", "Cognac", "Silverstone", "Kyalami Orange"];
const CITIES = [
  "Los Angeles, CA", "New York, NY", "Chicago, IL", "Houston, TX",
  "Miami, FL", "Seattle, WA", "Denver, CO", "Atlanta, GA",
  "Phoenix, AZ", "San Francisco, CA", "Austin, TX", "Boston, MA",
  "Portland, OR", "Las Vegas, NV", "Dallas, TX",
];
const DEALERS = [
  "BMW of Beverly Hills", "Iconic BMW", "Fields BMW", "Hendrick BMW",
  "BMW of Orland Park", "Circle BMW", "Private Seller", "AutoNation BMW",
  "Park Place BMW", "Tom Bush BMW",
];

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Base prices by year — newer = more expensive
const BASE_PRICES: Record<number, number> = {
  2023: 52000,
  2024: 55000,
  2025: 58000,
};

function generatePrice(year: number, mileage: number, dayOffset: number): number {
  const base = BASE_PRICES[year] ?? 54000;
  // Higher mileage = lower price (roughly $0.10/mile depreciation)
  const mileageDiscount = Math.floor(mileage * 0.08);
  // Slight market drift: prices drop ~$50/week
  const marketDrift = Math.floor((dayOffset / 7) * 50);
  // Random variance ±$2500
  const noise = rand(-2500, 2500);
  const price = base - mileageDiscount - marketDrift + noise;
  // Clamp to $42k–$60k
  return Math.max(42000, Math.min(60000, Math.round(price / 100) * 100));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log("🌱 Seeding BMW M2 tracker database...");

  // ── Sources ────────────────────────────────────────────────────────────────
  const [carsCom] = await db
    .insert(sources)
    .values({ name: "cars.com", baseUrl: "https://www.cars.com", enabled: true })
    .onConflictDoUpdate({ target: sources.name, set: { enabled: true } })
    .returning();

  const [autotrader] = await db
    .insert(sources)
    .values({ name: "autotrader", baseUrl: "https://www.autotrader.com", enabled: true })
    .onConflictDoUpdate({ target: sources.name, set: { enabled: true } })
    .returning();

  console.log("✓ Sources seeded");

  // ── Generate persistent listing pool ──────────────────────────────────────
  // We create ~35 "real" listings with stable IDs that persist across days

  type ListingSpec = {
    id?: number;
    sourceId: number;
    externalId: string;
    url: string;
    title: string;
    year: number;
    trim: string;
    basePrice: number;
    mileage: number;
    location: string;
    dealer: string;
    color: string;
    colorInt: string;
    imageUrl: string;
    status: string;
    firstSeenDaysAgo: number;
    removedDaysAgo: number | null;
  };

  const listingSpecs: ListingSpec[] = Array.from({ length: 35 }, (_, i) => {
    const year = pick([2023, 2023, 2024, 2024, 2025]);
    const mileage = rand(800, 38000);
    const isAutotrader = i % 3 === 0;
    const sourceId = isAutotrader ? autotrader.id : carsCom.id;
    // Clean seed ID — stable, no timestamp
    const externalId = `SEED-${i + 1}`;
    const trim = pick(TRIMS);
    const color = pick(COLORS);
    const colorInt = pick(COLORS_INT);
    const location = pick(CITIES);
    const dealer = pick(DEALERS);
    const basePrice = generatePrice(year, mileage, 0);
    const firstSeenDaysAgo = rand(1, 28);
    // ~20% of listings removed
    const removedDaysAgo = Math.random() < 0.2 ? rand(0, firstSeenDaysAgo - 1) : null;
    const trimLabel = trim !== "Base" ? ` ${trim}` : "";
    const title = `${year} BMW M2${trimLabel}`;

    return {
      sourceId,
      externalId,
      // Match each site's actual vehicle detail page URL structure
      url: isAutotrader
        ? `https://www.autotrader.com/cars-for-sale/vehicle/${externalId}`
        : `https://www.cars.com/vehicledetail/${externalId}/`,
      title,
      year,
      trim,
      basePrice,
      mileage,
      location,
      dealer,
      color,
      colorInt,
      imageUrl: `https://images.dealer.com/ddc/vehicles/2024/BMW/M2/Coupe/${color.replace(/ /g, "_")}.jpg`,
      status: removedDaysAgo !== null ? "removed" : "active",
      firstSeenDaysAgo,
      removedDaysAgo,
    };
  });

  // ── Insert listings ────────────────────────────────────────────────────────
  for (const spec of listingSpecs) {
    const firstSeen = subDays(new Date(), spec.firstSeenDaysAgo);
    const lastSeen =
      spec.removedDaysAgo !== null
        ? subDays(new Date(), spec.removedDaysAgo)
        : new Date();

    const [inserted] = await db
      .insert(listings)
      .values({
        externalId: spec.externalId,
        sourceId: spec.sourceId,
        url: spec.url,
        title: spec.title,
        year: spec.year,
        make: "BMW",
        model: "M2",
        trim: spec.trim !== "Base" ? spec.trim : null,
        askingPrice: spec.basePrice,
        mileage: spec.mileage,
        location: spec.location,
        sellerName: spec.dealer,
        exteriorColor: spec.color,
        interiorColor: spec.colorInt,
        imageUrl: spec.imageUrl,
        status: spec.status,
        firstSeenAt: firstSeen,
        lastSeenAt: lastSeen,
        createdAt: firstSeen,
        updatedAt: lastSeen,
      })
      .onConflictDoNothing()
      .returning({ id: listings.id });

    if (inserted) {
      spec.id = inserted.id;
    }
  }

  console.log("✓ Listings seeded");

  // ── Insert daily snapshots and price changes ───────────────────────────────
  for (const spec of listingSpecs) {
    if (!spec.id) continue;

    const totalDays = spec.firstSeenDaysAgo;

    for (let daysAgo = totalDays; daysAgo >= 0; daysAgo--) {
      // Skip days after removal
      if (spec.removedDaysAgo !== null && daysAgo < spec.removedDaysAgo) continue;

      const snapshotDate = format(subDays(new Date(), daysAgo), "yyyy-MM-dd");
      const dayOffset = totalDays - daysAgo;
      const price = generatePrice(spec.year, spec.mileage, dayOffset);
      const status = spec.removedDaysAgo !== null && daysAgo <= spec.removedDaysAgo
        ? "removed"
        : "active";

      await db
        .insert(listingSnapshots)
        .values({
          listingId: spec.id,
          snapshotDate,
          askingPrice: price,
          mileage: spec.mileage,
          status,
        })
        .onConflictDoNothing();

      // Insert price change if price dropped significantly vs prior day
      if (dayOffset > 0 && Math.random() < 0.08) {
        const drop = rand(500, 2500);
        await db.insert(priceChanges).values({
          listingId: spec.id!,
          changedAt: subDays(new Date(), daysAgo),
          oldPrice: price + drop,
          newPrice: price,
          changeAmount: -drop,
          changePercent: ((-drop / (price + drop)) * 100).toFixed(2),
        }).catch(() => {});
      }
    }
  }

  console.log("✓ Snapshots and price changes seeded");

  // ── Compute daily market summaries ────────────────────────────────────────
  for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
    const summaryDate = format(subDays(new Date(), daysAgo), "yyyy-MM-dd");

    // Active listings on this day
    const activeOnDay = listingSpecs.filter((s) => {
      const firstSeenDaysAgo = s.firstSeenDaysAgo;
      if (firstSeenDaysAgo < daysAgo) return false; // not yet listed
      if (s.removedDaysAgo !== null && s.removedDaysAgo > daysAgo) return false; // already removed
      return true;
    });

    const prices = activeOnDay
      .map((s) => generatePrice(s.year, s.mileage, s.firstSeenDaysAgo - daysAgo))
      .filter((p) => p > 0)
      .sort((a, b) => a - b);

    const mileages = activeOnDay.map((s) => s.mileage).sort((a, b) => a - b);

    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

    const med = (arr: number[]) => {
      if (!arr.length) return null;
      const mid = Math.floor(arr.length / 2);
      return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    };

    // New listings on this day
    const newOnDay = listingSpecs.filter(
      (s) => s.firstSeenDaysAgo === daysAgo
    ).length;

    // Removed on this day
    const removedOnDay = listingSpecs.filter(
      (s) => s.removedDaysAgo === daysAgo
    ).length;

    await db
      .insert(dailyMarketSummary)
      .values({
        summaryDate,
        totalActive: activeOnDay.length,
        newListings: newOnDay,
        removedListings: removedOnDay,
        netChange: newOnDay - removedOnDay,
        avgPrice: avg(prices)?.toFixed(2) ?? null,
        medianPrice: med(prices)?.toFixed(2) ?? null,
        avgMileage: avg(mileages)?.toFixed(2) ?? null,
        medianMileage: med(mileages)?.toFixed(2) ?? null,
      })
      .onConflictDoUpdate({
        target: dailyMarketSummary.summaryDate,
        set: {
          totalActive: activeOnDay.length,
          newListings: newOnDay,
          removedListings: removedOnDay,
          netChange: newOnDay - removedOnDay,
          avgPrice: avg(prices)?.toFixed(2) ?? null,
          medianPrice: med(prices)?.toFixed(2) ?? null,
          avgMileage: avg(mileages)?.toFixed(2) ?? null,
          medianMileage: med(mileages)?.toFixed(2) ?? null,
        },
      });
  }

  console.log("✓ Daily market summaries seeded");

  const count = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(listings);

  console.log(`\n🎉 Seed complete! ${count[0].n} listings in DB.\n`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
