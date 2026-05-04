import type { DailyMarketSummary } from "@/lib/db/schema";

interface MarketOverviewProps {
  today: DailyMarketSummary | null;
  yesterday: DailyMarketSummary | null;
}

function fmt(n: string | number | null | undefined, prefix = ""): string {
  if (n === null || n === undefined) return "–";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "–";
  return `${prefix}${Math.round(num).toLocaleString()}`;
}

function delta(
  today: string | number | null | undefined,
  yesterday: string | number | null | undefined
): { text: string; dir: "up" | "down" | "flat" | null } {
  const t = typeof today === "string" ? parseFloat(today) : today;
  const y = typeof yesterday === "string" ? parseFloat(yesterday) : yesterday;
  if (!t || !y || isNaN(t) || isNaN(y)) return { text: "", dir: null };
  const d = t - y;
  if (Math.abs(d) < 1) return { text: "Unchanged", dir: "flat" };
  const sign = d > 0 ? "+" : "";
  return {
    text: `${sign}${Math.round(d).toLocaleString()} vs yesterday`,
    dir: d > 0 ? "up" : "down",
  };
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  dir?: "up" | "down" | "flat" | null;
  /** Whether "up" direction is good (green) or bad (red) */
  upIsGood?: boolean;
  accent?: "blue" | "green" | "red" | "amber";
}

function StatCard({ label, value, sub, dir, upIsGood = false, accent }: StatCardProps) {
  const dirColor =
    dir === "flat"
      ? "text-muted-foreground"
      : dir === "up"
        ? upIsGood ? "text-emerald-600" : "text-red-600"
        : dir === "down"
          ? upIsGood ? "text-red-600" : "text-emerald-600"
          : "text-muted-foreground";

  const arrow = dir === "up" ? "↑" : dir === "down" ? "↓" : "";

  // Colored top-border accent (3px top, 1px others)
  const accentMap: Record<string, string> = {
    blue:  "border-t-[3px] border-t-blue-600",
    green: "border-t-[3px] border-t-emerald-600",
    red:   "border-t-[3px] border-t-red-600",
    amber: "border-t-[3px] border-t-amber-500",
  };
  const accentClass = accent ? accentMap[accent] : "";

  return (
    <div className={`stat-card rounded-xl border border-border bg-card shadow-sm p-5 ${accentClass}`}>
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-3">{label}</p>
      <p className="text-3xl font-bold tabular tracking-tight text-foreground">{value}</p>
      {sub && (
        <p className={`text-xs mt-2 font-medium ${dirColor}`}>
          {arrow && <span className="mr-0.5">{arrow}</span>}{sub}
        </p>
      )}
    </div>
  );
}

export function MarketOverview({ today, yesterday }: MarketOverviewProps) {
  const priceDelta = delta(today?.avgPrice, yesterday?.avgPrice);
  const medianDelta = delta(today?.medianPrice, yesterday?.medianPrice);

  const net = today?.netChange ?? 0;
  const netSign = net > 0 ? "+" : "";
  const netDir = net > 0 ? "up" : net < 0 ? "down" : "flat";

  return (
    <section>
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-base font-semibold text-foreground tracking-tight">Market Overview</h2>
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground tabular">
          {today?.summaryDate
            ? new Date(today.summaryDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            : new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Active Listings"
          value={String(today?.totalActive ?? "–")}
          sub={net !== 0 ? `${netSign}${net} today` : "No change today"}
          dir={netDir}
          upIsGood={true}
          accent="blue"
        />
        <StatCard
          label="New Today"
          value={String(today?.newListings ?? "–")}
          sub={today?.removedListings != null ? `${today.removedListings} removed` : undefined}
          accent="green"
        />
        <StatCard
          label="Average Price"
          value={fmt(today?.avgPrice, "$")}
          sub={priceDelta.text}
          dir={priceDelta.dir}
          upIsGood={false}
        />
        <StatCard
          label="Median Price"
          value={fmt(today?.medianPrice, "$")}
          sub={medianDelta.text}
          dir={medianDelta.dir}
          upIsGood={false}
        />
        <StatCard
          label="Average Mileage"
          value={`${fmt(today?.avgMileage)} mi`}
        />
        <StatCard
          label="Median Mileage"
          value={`${fmt(today?.medianMileage)} mi`}
        />
        <StatCard
          label="Removed Today"
          value={String(today?.removedListings ?? "–")}
          accent={today?.removedListings ? "red" : undefined}
        />
        <StatCard
          label="Net Change"
          value={net !== 0 ? `${netSign}${net}` : "0"}
          dir={netDir}
          upIsGood={true}
        />
      </div>
    </section>
  );
}
