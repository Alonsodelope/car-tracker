import "dotenv/config";
import { db } from "../db/client";
import {
  listings,
  listingSnapshots,
  dailyMarketSummary,
  priceChanges,
  sources,
} from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { CarsComCollector } from "../collectors/cars-com";
import { AutotraderCollector } from "../collectors/autotrader";
import { BATCollector } from "../collectors/bat";
import { VEHICLE_PROFILES, VehicleProfile } from "../collectors/base";
import type { CollectorAdapter, ScrapedListing } from "../collectors/base";
import { format } from "date-fns";
import type { SyncResult } from "@/types";

// ─── Collectors registry — one set per vehicle profile ────────────────────────

function buildCollectors(profile: VehicleProfile): CollectorAdapter[] {
  return [
    new CarsComCollector(profile),
    new AutotraderCollector(profile),
    new BATCollector(profile),
  ];
}

// ─── Main sync entry point ────────────────────────────────────────────────────

export async function runDailySync(): Promise<SyncResult[]> {
  const today = format(new Date(), "yyyy-MM-dd");
  console.log(`\n═══ Daily Sync — ${today} ═══\n`);

  const results: SyncResult[] = [];

  for (const profile of VEHICLE_PROFILES) {
    console.log(`\n─── Vehicle: ${profile.displayName} ───`);
    const collectors = buildCollectors(profile);
    for (const collector of collectors) {
      const result = await syncSource(collector, profile, today);
      results.push(result);
    }
    // Compute and save daily market summary for this vehicle
    await saveDailyMarketSummary(today, profile, results.filter(r => r.vehicleKey === profile.key));
  }

  console.log(`\n═══ Sync complete ═══\n`);
  return results;
}

// ─── Per-source sync ──────────────────────────────────────────────────────────

async function syncSource(
  collector: CollectorAdapter,
  profile: VehicleProfile,
  today: string
): Promise<SyncResult> {
  const start = Date.now();
  const errors: string[] = [];
  let newCount = 0;
  let updatedCount = 0;
  let removedCount = 0;

  console.log(`\n[sync] Starting ${collector.sourceName} for ${profile.key}...`);

  try {
    // Ensure source exists
    const source = await ensureSource(collector.sourceName);

    // Get all currently active URLs for this source + vehicle
    const activeRows = await db
      .select({ id: listings.id, url: listings.url, askingPrice: listings.askingPrice })
      .from(listings)
      .where(
        and(
          eq(listings.sourceId, source.id),
          eq(listings.vehicleKey, profile.key),
          eq(listings.status, "active")
        )
      );

    const activeMap = new Map(activeRows.map((r) => [r.url, r]));

    // Collect listings from source
    let scraped: ScrapedListing[] = [];
    let collectionSucceeded = false;
    try {
      scraped = await collector.collect();
      collectionSucceeded = true;
      console.log(`[sync:${collector.sourceName}:${profile.key}] Scraped ${scraped.length} listings`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Collection failed: ${msg}`);
      console.error(`[sync:${collector.sourceName}:${profile.key}] Collection failed:`, err);
      // Do NOT mark existing listings as removed — source is unreachable, not empty
    }

    const scrapedUrls = new Set(scraped.map((l) => l.url));

    // Process each scraped listing
    for (const item of scraped) {
      try {
        const existing = activeMap.get(item.url);

        if (!existing) {
          // New listing — backdate firstSeenAt using source-reported days on market
          const firstSeenAt = item.sourceDaysOnMarket && item.sourceDaysOnMarket > 0
            ? new Date(Date.now() - item.sourceDaysOnMarket * 24 * 60 * 60 * 1000)
            : new Date();

          const [inserted] = await db
            .insert(listings)
            .values({
              externalId: item.externalId,
              sourceId: source.id,
              vehicleKey: profile.key,
              url: item.url,
              title: item.title,
              year: item.year,
              make: item.make,
              model: item.model,
              trim: item.trim,
              askingPrice: item.askingPrice,
              mileage: item.mileage,
              location: item.location,
              sellerName: item.sellerName,
              exteriorColor: item.exteriorColor,
              interiorColor: item.interiorColor,
              imageUrl: item.imageUrl,
              vin: item.vin,
              stockId: item.stockId,
              phone: item.phone,
              transmission: item.transmissionText ?? null,
              status: "active",
              firstSeenAt,
              lastSeenAt: new Date(),
            })
            // If this URL was previously removed and just reappeared, reactivate it
            .onConflictDoUpdate({
              target: listings.url,
              set: {
                status: "active",
                askingPrice: item.askingPrice,
                lastSeenAt: new Date(),
                updatedAt: new Date(),
                ...(item.mileage ? { mileage: item.mileage } : {}),
                ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
                ...(item.title ? { title: item.title } : {}),
                ...(item.location ? { location: item.location } : {}),
                ...(item.sellerName ? { sellerName: item.sellerName } : {}),
                ...(item.vin ? { vin: item.vin } : {}),
                ...(item.stockId ? { stockId: item.stockId } : {}),
                ...(item.phone ? { phone: item.phone } : {}),
                ...(item.transmissionText ? { transmission: item.transmissionText } : {}),
              },
            })
            .returning({ id: listings.id });

          await saveSnapshot(inserted.id, today, item);
          newCount++;
        } else {
          // Existing listing — update last seen and check price change
          await db
            .update(listings)
            .set({
              lastSeenAt: new Date(),
              updatedAt: new Date(),
              askingPrice: item.askingPrice,
              mileage: item.mileage ?? undefined,
              imageUrl: item.imageUrl ?? undefined,
              // Always refresh these from the scraper
              ...(item.title ? { title: item.title } : {}),
              ...(item.location ? { location: item.location } : {}),
              ...(item.sellerName ? { sellerName: item.sellerName } : {}),
              ...(item.vin ? { vin: item.vin } : {}),
              ...(item.stockId ? { stockId: item.stockId } : {}),
              ...(item.phone ? { phone: item.phone } : {}),
              ...(item.transmissionText ? { transmission: item.transmissionText } : {}),
            })
            .where(eq(listings.id, existing.id));

          // Detect price change
          if (
            existing.askingPrice !== null &&
            item.askingPrice !== existing.askingPrice
          ) {
            const changeAmount = item.askingPrice - existing.askingPrice;
            const changePct =
              existing.askingPrice > 0
                ? ((changeAmount / existing.askingPrice) * 100).toFixed(2)
                : "0";

            await db.insert(priceChanges).values({
              listingId: existing.id,
              changedAt: new Date(),
              oldPrice: existing.askingPrice,
              newPrice: item.askingPrice,
              changeAmount,
              changePercent: changePct,
            });

            console.log(
              `[sync] Price change on ${item.url}: $${existing.askingPrice} → $${item.askingPrice}`
            );
          }

          await saveSnapshot(existing.id, today, item);
          updatedCount++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed processing ${item.url}: ${msg}`);
        console.error(`[sync] Error processing listing ${item.url}:`, err);
      }
    }

    // Mark listings not seen today as removed — only when collection actually succeeded.
    // If the source returned an error (403, unavailable, etc.), skip this step so we
    // don't incorrectly remove listings that are still active on the market.
    if (!collectionSucceeded) {
      console.warn(
        `[sync:${collector.sourceName}:${profile.key}] Skipping removal step — collection did not succeed`
      );
    }
    for (const [url, row] of (collectionSucceeded ? activeMap : new Map()).entries()) {
      if (!scrapedUrls.has(url)) {
        await db
          .update(listings)
          .set({ status: "removed", lastSeenAt: new Date(), updatedAt: new Date() })
          .where(eq(listings.id, row.id));

        await db.insert(listingSnapshots).values({
          listingId: row.id,
          snapshotDate: today,
          askingPrice: row.askingPrice,
          status: "removed",
        }).onConflictDoNothing();

        removedCount++;
      }
    }

    console.log(
      `[sync:${collector.sourceName}:${profile.key}] Done — new: ${newCount}, updated: ${updatedCount}, removed: ${removedCount}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Sync failed: ${msg}`);
    console.error(`[sync:${collector.sourceName}:${profile.key}] Fatal error:`, err);
  }

  return {
    date: today,
    source: collector.sourceName,
    vehicleKey: profile.key,
    newListings: newCount,
    updatedListings: updatedCount,
    removedListings: removedCount,
    errors,
    durationMs: Date.now() - start,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ensureSource(name: string) {
  const existing = await db
    .select()
    .from(sources)
    .where(eq(sources.name, name))
    .limit(1);

  if (existing[0]) return existing[0];

  const baseUrlMap: Record<string, string> = {
    "cars.com": "https://www.cars.com",
    autotrader: "https://www.autotrader.com",
    bringatrailer: "https://bringatrailer.com",
  };

  const [created] = await db
    .insert(sources)
    .values({ name, baseUrl: baseUrlMap[name] ?? `https://${name}` })
    .returning();

  return created;
}

async function saveSnapshot(
  listingId: number,
  snapshotDate: string,
  item: ScrapedListing
): Promise<void> {
  await db
    .insert(listingSnapshots)
    .values({
      listingId,
      snapshotDate,
      askingPrice: item.askingPrice,
      mileage: item.mileage,
      status: "active",
      rawPayload: item.rawPayload as Record<string, unknown>,
    })
    .onConflictDoNothing(); // unique(listingId, snapshotDate)
}

async function saveDailyMarketSummary(
  today: string,
  profile: VehicleProfile,
  results: SyncResult[]
): Promise<void> {
  // Aggregate counts from all sources for this vehicle
  const totalNew = results.reduce((s, r) => s + r.newListings, 0);
  const totalRemoved = results.reduce((s, r) => s + r.removedListings, 0);

  // Compute stats from current active listings for this vehicle only
  const statsResult = await db.execute<{
    total: number;
    avg_price: number;
    avg_mileage: number;
  }>(
    sql`SELECT COUNT(*)::int AS total,
               AVG(asking_price)::float AS avg_price,
               AVG(mileage)::float AS avg_mileage
        FROM listings
        WHERE status = 'active' AND vehicle_key = ${profile.key}`
  );

  const medianPriceResult = await db.execute<{ median: number }>(
    sql`SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY asking_price) AS median
        FROM listings WHERE status = 'active' AND vehicle_key = ${profile.key} AND asking_price IS NOT NULL`
  );

  const medianMileageResult = await db.execute<{ median: number }>(
    sql`SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY mileage) AS median
        FROM listings WHERE status = 'active' AND vehicle_key = ${profile.key} AND mileage IS NOT NULL`
  );

  const stats = statsResult.rows[0];
  const medianPrice = medianPriceResult.rows[0]?.median ?? null;
  const medianMileage = medianMileageResult.rows[0]?.median ?? null;

  await db
    .insert(dailyMarketSummary)
    .values({
      summaryDate: today,
      vehicleKey: profile.key,
      totalActive: stats?.total ?? 0,
      newListings: totalNew,
      removedListings: totalRemoved,
      netChange: totalNew - totalRemoved,
      avgPrice: stats?.avg_price?.toFixed(2) ?? null,
      medianPrice: medianPrice?.toFixed(2) ?? null,
      avgMileage: stats?.avg_mileage?.toFixed(2) ?? null,
      medianMileage: medianMileage?.toFixed(2) ?? null,
    })
    .onConflictDoUpdate({
      target: [dailyMarketSummary.summaryDate, dailyMarketSummary.vehicleKey],
      set: {
        totalActive: stats?.total ?? 0,
        newListings: totalNew,
        removedListings: totalRemoved,
        netChange: totalNew - totalRemoved,
        avgPrice: stats?.avg_price?.toFixed(2) ?? null,
        medianPrice: medianPrice?.toFixed(2) ?? null,
        avgMileage: stats?.avg_mileage?.toFixed(2) ?? null,
        medianMileage: medianMileage?.toFixed(2) ?? null,
      },
    });

  console.log(
    `[sync:${profile.key}] Market summary saved — active: ${stats?.total}, new: ${totalNew}, removed: ${totalRemoved}`
  );
}
