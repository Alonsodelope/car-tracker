import { db } from "../client";
import { listingSnapshots } from "../schema";
import { eq, asc, desc, gte } from "drizzle-orm";
import { subDays, format } from "date-fns";

export async function getSnapshotsForListing(listingId: number) {
  return db
    .select()
    .from(listingSnapshots)
    .where(eq(listingSnapshots.listingId, listingId))
    .orderBy(asc(listingSnapshots.snapshotDate));
}

export async function getRecentSnapshots(days = 60) {
  const since = format(subDays(new Date(), days), "yyyy-MM-dd");
  return db
    .select()
    .from(listingSnapshots)
    .where(gte(listingSnapshots.snapshotDate, since))
    .orderBy(desc(listingSnapshots.snapshotDate));
}
