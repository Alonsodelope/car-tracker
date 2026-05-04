import type { DailyMarketSummary } from "@/lib/db/schema";
import { format } from "date-fns";

interface DailySummaryProps {
  today: DailyMarketSummary | null;
  yesterday: DailyMarketSummary | null;
}

export function DailySummary({ today, yesterday }: DailySummaryProps) {
  const lines: { text: string; type: "neutral" | "positive" | "negative" | "warning" }[] = [];

  if (!today) {
    lines.push({ text: "No market data yet. Run the sync to collect live listings.", type: "warning" });
  } else {
    const newCount = today.newListings ?? 0;
    const removedCount = today.removedListings ?? 0;

    if (newCount > 0) {
      lines.push({
        text: `${newCount} new listing${newCount === 1 ? "" : "s"} appeared today.`,
        type: "positive",
      });
    } else {
      lines.push({ text: "No new listings appeared today.", type: "neutral" });
    }

    if (removedCount > 0) {
      lines.push({
        text: `${removedCount} listing${removedCount === 1 ? " was" : "s were"} removed from the market.`,
        type: removedCount > 3 ? "negative" : "neutral",
      });
    }

    if (today.avgPrice && yesterday?.avgPrice) {
      const t = parseFloat(String(today.avgPrice));
      const y = parseFloat(String(yesterday.avgPrice));
      const d = t - y;
      if (Math.abs(d) > 50) {
        lines.push({
          text:
            `Average price is $${Math.round(t).toLocaleString()}, ` +
            `${d > 0 ? "up" : "down"} $${Math.abs(Math.round(d)).toLocaleString()} from yesterday. ` +
            `Market is ${d > 0 ? "tightening" : "softening"}.`,
          type: d > 0 ? "warning" : "positive",
        });
      } else {
        lines.push({
          text: `Average price is $${Math.round(t).toLocaleString()}, largely unchanged from yesterday.`,
          type: "neutral",
        });
      }
    } else if (today.avgPrice) {
      lines.push({
        text: `Current average asking price: $${Math.round(parseFloat(String(today.avgPrice))).toLocaleString()}.`,
        type: "neutral",
      });
    }

    if (today.totalActive != null) {
      lines.push({
        text: `${today.totalActive} active listing${today.totalActive === 1 ? "" : "s"} in the market.`,
        type: "neutral",
      });
    }
  }

  const dateLabel = today?.summaryDate
    ? format(new Date(today.summaryDate + "T12:00:00"), "MMMM d, yyyy")
    : format(new Date(), "MMMM d, yyyy");

  const dotColor: Record<string, string> = {
    positive: "bg-emerald-500",
    negative: "bg-red-500",
    warning: "bg-amber-500",
    neutral: "bg-gray-300",
  };

  return (
    <section>
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-base font-semibold text-foreground tracking-tight">Daily Summary</h2>
        <div className="flex-1 h-px bg-border/60" />
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Top accent bar */}
        <div className="m-stripe h-0.5 w-full" />
        <div className="p-5">
          <p className="text-[11px] text-muted-foreground uppercase tracking-widest mb-4">{dateLabel}</p>
          <div className="space-y-2.5">
            {lines.map((line, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${dotColor[line.type]}`} />
                <p className="text-sm leading-relaxed text-foreground/80">{line.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
