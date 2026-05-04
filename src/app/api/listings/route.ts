import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { listings, sources } from "@/lib/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const status = searchParams.get("status") ?? "active";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "500"), 1000);

  const conditions = [];
  if (status !== "all") {
    conditions.push(eq(listings.status, status));
  }
  const minPrice = searchParams.get("minPrice");
  const maxPrice = searchParams.get("maxPrice");
  if (minPrice) conditions.push(gte(listings.askingPrice, parseInt(minPrice)));
  if (maxPrice) conditions.push(lte(listings.askingPrice, parseInt(maxPrice)));

  const rows = await db
    .select({ listing: listings, sourceName: sources.name })
    .from(listings)
    .innerJoin(sources, eq(listings.sourceId, sources.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(listings.firstSeenAt))
    .limit(limit);

  return NextResponse.json(rows);
}
