/**
 * Daily cron scheduler. Run as a separate process:
 *   pnpm cron
 *
 * Runs the full data sync every morning at 8:00 AM local time.
 */

import "dotenv/config";
import cron from "node-cron";
import { runDailySync } from "../src/lib/sync/daily-sync";

console.log("BMW M2 Tracker — Cron Scheduler started");
console.log("Scheduled: daily at 8:00 AM");
console.log(`Current time: ${new Date().toLocaleString()}\n`);

// Run immediately on startup if --now flag is passed
if (process.argv.includes("--now")) {
  console.log("--now flag detected, running sync immediately...\n");
  runDailySync()
    .then((results) => {
      for (const r of results) {
        console.log(
          `  ${r.source}: +${r.newListings} new, -${r.removedListings} removed (${r.durationMs}ms)`
        );
      }
    })
    .catch(console.error);
}

// Schedule daily at 8:00 AM
cron.schedule("0 8 * * *", async () => {
  console.log(`\n[cron] Triggering daily sync at ${new Date().toLocaleString()}`);
  try {
    const results = await runDailySync();
    for (const r of results) {
      console.log(
        `  ${r.source}: +${r.newListings} new, -${r.removedListings} removed` +
          (r.errors.length ? ` [${r.errors.length} errors]` : "") +
          ` (${r.durationMs}ms)`
      );
    }
  } catch (err) {
    console.error("[cron] Sync failed:", err);
  }
});

// Keep process alive
process.on("SIGINT", () => {
  console.log("\nCron scheduler stopped.");
  process.exit(0);
});
