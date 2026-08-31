/**
 * One-shot sync runner. Runs all collectors and exits.
 * Run: pnpm sync
 * Or, to sync only specific vehicles: pnpm sync -- bmw-m2 mercedes-c63s-w206
 * (matches VehicleProfile.key in src/lib/collectors/base.ts)
 */

import "dotenv/config";
import { runDailySync } from "../src/lib/sync/daily-sync";

const vehicleKeys = process.argv.slice(2).filter(Boolean);

runDailySync(vehicleKeys.length ? vehicleKeys : undefined)
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
