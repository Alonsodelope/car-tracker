import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { dailyMarketSummary } from "@/lib/db/schema";
import { desc, gte } from "drizzle-orm";
import { format, subDays } from "date-fns";

export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "60");
  const since = format(subDays(new Date(), days), "yyyy-MM-dd");

  const rows = await db
    .select()
    .from(dailyMarketSummary)
    .where(gte(dailyMarketSummary.summaryDate, since))
    .orderBy(desc(dailyMarketSummary.summaryDate));

  return NextResponse.json(rows);
}
