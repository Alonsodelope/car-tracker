import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { listings } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

// GET /api/reviews?vehicleKey=bmw-m2
// Returns { [listingId]: "good" | "bad" } for all reviewed listings of a vehicle
export async function GET(req: NextRequest) {
  const vehicleKey = req.nextUrl.searchParams.get("vehicleKey");

  const rows = await db
    .select({ id: listings.id, review: listings.review })
    .from(listings)
    .where(vehicleKey ? eq(listings.vehicleKey, vehicleKey) : inArray(listings.review, ["good", "bad"]));

  const result: Record<number, string> = {};
  for (const row of rows) {
    if (row.review) result[row.id] = row.review;
  }

  return NextResponse.json(result);
}

// POST /api/reviews  body: { listingId: number, review: "good" | "bad" | null }
export async function POST(req: NextRequest) {
  const body = await req.json() as { listingId?: number; review?: string | null };
  const { listingId, review } = body;

  if (!listingId || typeof listingId !== "number") {
    return NextResponse.json({ error: "listingId required" }, { status: 400 });
  }
  if (review !== null && review !== "good" && review !== "bad" && review !== undefined) {
    return NextResponse.json({ error: "review must be 'good', 'bad', or null" }, { status: 400 });
  }

  await db
    .update(listings)
    .set({ review: review ?? null })
    .where(eq(listings.id, listingId));

  return NextResponse.json({ ok: true });
}
