import { db } from "../client";
import { listings, sources, priceChanges } from "../schema";
import { eq, and, gte, lte, inArray, desc, asc, sql } from "drizzle-orm";
import type { Listing } from "../schema";

export interface ListingFilters {
  status?: "active" | "removed";
  sourceNames?: string[];
  years?: number[];
  minPrice?: number;
  maxPrice?: number;
  minMileage?: number;
  maxMileage?: number;
  dealStatus?: "good" | "fair" | "overpriced";
  limit?: number;
  offset?: number;
  sortBy?: "price" | "mileage" | "year" | "firstSeenAt" | "askingPrice";
  sortDir?: "asc" | "desc";
}

export async function getListings(filters: ListingFilters = {}) {
  const conditions = [];

  if (filters.status) {
    conditions.push(eq(listings.status, filters.status));
  }
  if (filters.years && filters.years.length > 0) {
    conditions.push(inArray(listings.year, filters.years));
  }
  if (filters.minPrice !== undefined) {
    conditions.push(gte(listings.askingPrice, filters.minPrice));
  }
  if (filters.maxPrice !== undefined) {
    conditions.push(lte(listings.askingPrice, filters.maxPrice));
  }
  if (filters.minMileage !== undefined) {
    conditions.push(gte(listings.mileage, filters.minMileage));
  }
  if (filters.maxMileage !== undefined) {
    conditions.push(lte(listings.mileage, filters.maxMileage));
  }

  const query = db
    .select({
      listing: listings,
      sourceName: sources.name,
    })
    .from(listings)
    .innerJoin(sources, eq(listings.sourceId, sources.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(listings.firstSeenAt))
    .limit(filters.limit ?? 500)
    .offset(filters.offset ?? 0);

  return query;
}

export async function getListingById(id: number) {
  const result = await db
    .select({
      listing: listings,
      sourceName: sources.name,
    })
    .from(listings)
    .innerJoin(sources, eq(listings.sourceId, sources.id))
    .where(eq(listings.id, id))
    .limit(1);

  return result[0] ?? null;
}

export async function getActiveListings(): Promise<Listing[]> {
  return db
    .select()
    .from(listings)
    .where(eq(listings.status, "active"));
}

export async function getActiveListingUrls(): Promise<Set<string>> {
  const rows = await db
    .select({ url: listings.url })
    .from(listings)
    .where(eq(listings.status, "active"));
  return new Set(rows.map((r) => r.url));
}

export async function getListingByUrl(url: string) {
  const result = await db
    .select()
    .from(listings)
    .where(eq(listings.url, url))
    .limit(1);
  return result[0] ?? null;
}

export async function getPriceHistory(listingId: number) {
  return db
    .select()
    .from(priceChanges)
    .where(eq(priceChanges.listingId, listingId))
    .orderBy(asc(priceChanges.changedAt));
}

export async function getSimilarListings(
  listing: Listing,
  limit = 5
): Promise<Listing[]> {
  if (!listing.year || !listing.mileage) return [];

  return db
    .select()
    .from(listings)
    .where(
      and(
        eq(listings.status, "active"),
        sql`${listings.year} BETWEEN ${listing.year - 1} AND ${listing.year + 1}`,
        sql`${listings.mileage} BETWEEN ${listing.mileage - 20000} AND ${listing.mileage + 20000}`,
        sql`${listings.id} != ${listing.id}`
      )
    )
    .orderBy(asc(sql`ABS(${listings.askingPrice} - ${listing.askingPrice})`))
    .limit(limit);
}
