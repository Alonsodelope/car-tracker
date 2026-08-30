"use server";

import { runDailySync } from "@/lib/sync/daily-sync";
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
