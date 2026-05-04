import { db } from "../client";
import { dailyMarketSummary, listings } from "../schema";
import { desc, eq, sql, and, gte } from "drizzle-orm";
import { subDays, format } from "date-fns";

export async function getLatestMarketSummary() {
  const result = await db
    .select()
    .from(dailyMarketSummary)
    .orderBy(desc(dailyMarketSummary.summaryDate))
    .limit(1);
  return result[0] ?? null;
}

export async function getMarketSummaryHistory(days = 60) {
  const since = format(subDays(new Date(), days), "yyyy-MM-dd");
  return db
    .select()
    .from(dailyMarketSummary)
    .where(gte(dailyMarketSummary.summaryDate, since))
    .orderBy(desc(dailyMarketSummary.summaryDate));
}

export async function getTodayNewListings() {
  const today = format(new Date(), "yyyy-MM-dd");
  return db
    .select()
    .from(listings)
    .where(
      and(
        eq(listings.status, "active"),
        sql`DATE(${listings.firstSeenAt}) = ${today}`
      )
    );
}

export async function getTodayRemovedListings() {
  const today = format(new Date(), "yyyy-MM-dd");
  return db
    .select()
    .from(listings)
    .where(
      and(
        eq(listings.status, "removed"),
        sql`DATE(${listings.lastSeenAt}) = ${today}`
      )
    );
}

export async function computeCurrentMarketStats() {
  const active = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
      avgPrice: sql<number>`AVG(asking_price)::float`,
      avgMileage: sql<number>`AVG(mileage)::float`,
    })
    .from(listings)
    .where(eq(listings.status, "active"));

  // Median requires window functions
  const medianPrice = await db.execute<{ median: number }>(
    sql`SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY asking_price) AS median
        FROM listings WHERE status = 'active' AND asking_price IS NOT NULL`
  );

  const medianMileage = await db.execute<{ median: number }>(
    sql`SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY mileage) AS median
        FROM listings WHERE status = 'active' AND mileage IS NOT NULL`
  );

  return {
    ...active[0],
    medianPrice: medianPrice.rows[0]?.median ?? null,
    medianMileage: medianMileage.rows[0]?.median ?? null,
  };
}
