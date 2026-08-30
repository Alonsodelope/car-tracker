"use server";

import { runDailySync } from "@/lib/sync/daily-sync";
import { db } from "@/lib/db/client";
import { listings, listingSnapshots, priceChanges, sources } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { SyncResult } from "@/types";

/**
 * Server Action used by the Admin page's "Run Sync Now" button.
 *
 * This replaces the old client -> /api/sync fetch (which required the
 * browser to send a matching `x-sync-token` header via the
 * NEXT_PUBLIC_SYNC_TOKEN env var — that var was never set in production,
 * so the button always failed with 401). A Server Action runs on the
 * server only and never needs a shared secret for same-origin UI use.
 *
 * The /api/sync route (protected by SYNC_SECRET_TOKEN) is unchanged and
 * still there for external callers (curl, a future Vercel Cron job, etc).
 */
export async function triggerSync(): Promise<{
  ok: boolean;
  results?: SyncResult[];
  error?: string;
}> {
  try {
    const results = await runDailySync();
    return { ok: true, results };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * ONE-TIME CLEANUP — remove after use.
 *
 * A bug in the Visor collector (fixed same commit as this action) matched
 * every listing in a broad model family instead of just the target trim,
 * inserting ~973 regular C-Class listings mislabeled as the C63 S. This
 * purges every listing from a given source+vehicle combo so a corrected
 * sync can repopulate it cleanly. Not for routine use — there is
 * deliberately no UI affordance for arbitrary source/vehicle deletion
 * beyond the one button wired to this on the admin page, which should be
 * removed in the same change that removes this function.
 */
export async function purgeSourceListingsForVehicle(
  sourceName: string,
  vehicleKey: string
): Promise<{ ok: boolean; deleted?: number; error?: string }> {
  try {
    const [source] = await db
      .select()
      .from(sources)
      .where(eq(sources.name, sourceName))
      .limit(1);
    if (!source) return { ok: true, deleted: 0 };

    const rows = await db
      .select({ id: listings.id })
      .from(listings)
      .where(and(eq(listings.sourceId, source.id), eq(listings.vehicleKey, vehicleKey)));
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return { ok: true, deleted: 0 };

    await db.delete(priceChanges).where(inArray(priceChanges.listingId, ids));
    await db.delete(listingSnapshots).where(inArray(listingSnapshots.listingId, ids));
    await db.delete(listings).where(inArray(listings.id, ids));

    return { ok: true, deleted: ids.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
