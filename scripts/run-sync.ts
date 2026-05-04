/**
 * One-shot sync runner. Runs all collectors and exits.
 * Run: pnpm sync
 */

import "dotenv/config";
import { runDailySync } from "../src/lib/sync/daily-sync";

runDailySync()
  .then((results) => {
    console.log("\nSync results:");
    for (const r of results) {
      console.log(
        `  [${r.vehicleKey}] ${r.source}: +${r.newListings} new, ~${r.updatedListings} updated, -${r.removedListings} removed` +
          (r.errors.length ? ` [${r.errors.length} errors]` : "") +
          ` (${r.durationMs}ms)`
      );
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
  });
