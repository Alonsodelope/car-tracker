import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { listings, listingSnapshots, priceChanges, sources } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const [row] = await db
    .select({ listing: listings, sourceName: sources.name })
    .from(listings)
    .innerJoin(sources, eq(listings.sourceId, sources.id))
    .where(eq(listings.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const snaps = await db
    .select()
    .from(listingSnapshots)
    .where(eq(listingSnapshots.listingId, id))
    .orderBy(asc(listingSnapshots.snapshotDate));

  const changes = await db
    .select()
    .from(priceChanges)
    .where(eq(priceChanges.listingId, id))
    .orderBy(asc(priceChanges.changedAt));

  return NextResponse.json({ ...row, snapshots: snaps, priceChanges: changes });
}
