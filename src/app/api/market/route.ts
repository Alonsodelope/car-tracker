import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { dailyMarketSummary } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await db
    .select()
    .from(dailyMarketSummary)
    .orderBy(desc(dailyMarketSummary.summaryDate))
    .limit(2);

  return NextResponse.json({
    today: rows[0] ?? null,
    yesterday: rows[1] ?? null,
  });
}
