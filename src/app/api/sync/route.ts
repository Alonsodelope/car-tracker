import { NextRequest, NextResponse } from "next/server";
import { runDailySync } from "@/lib/sync/daily-sync";

// POST /api/sync — trigger a sync manually
// Optionally protected by SYNC_SECRET_TOKEN header
export async function POST(req: NextRequest) {
  const token = process.env.SYNC_SECRET_TOKEN;
  if (token) {
    const authHeader = req.headers.get("x-sync-token");
    if (authHeader !== token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    console.log("[api/sync] Manual sync triggered");
    // Run async — don't await so request returns immediately
    runDailySync()
      .then((results) => {
        console.log("[api/sync] Sync completed:", results);
      })
      .catch((err) => {
        console.error("[api/sync] Sync failed:", err);
      });

    return NextResponse.json({
      ok: true,
      message: "Sync started in background",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[api/sync] Error:", err);
    return NextResponse.json(
      { error: "Failed to start sync" },
      { status: 500 }
    );
  }
}

// GET /api/sync — check if sync is available
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "POST to this endpoint to trigger a sync",
  });
}
