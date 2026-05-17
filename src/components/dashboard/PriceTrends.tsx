"use client";

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { DailyMarketSummary, Listing } from "@/lib/db/schema";
import { enrichListingsWithDealStatus } from "@/lib/market/fair-value";
import { format, parseISO } from "date-fns";
import { PriceMileageChart } from "./PriceMileageChart";

interface PriceTrendsProps {
  history: DailyMarketSummary[];
  activeListings: Listing[];
  vehicleKey: string;
}

function fmtDate(s: string) {
  try { return format(parseISO(s + "T12:00:00"), "MMM d"); } catch { return s; }
}

// Darker palette for readability on white/light backgrounds
const C = {
  blue:    "#1c69d3",   // BMW M Blue
  violet:  "#7c3aed",   // violet-700
  emerald: "#059669",   // emerald-600
  green:   "#16a34a",   // green-600
  red:     "#dc2626",   // red-600
  amber:   "#d97706",   // amber-600
};

type TooltipPayloadItem = { name: string; value: number; color: string };

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-white shadow-lg p-3 text-xs">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="text-foreground font-semibold tabular">
            {String(p.name).includes("Price") ? `$${p.value.toLocaleString()}` : p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}


function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function PriceTrends({ history, activeListings, vehicleKey }: PriceTrendsProps) {
  const sorted = [...history]
    .sort((a, b) => a.summaryDate.localeCompare(b.summaryDate))
    .map((d) => ({
      date: fmtDate(d.summaryDate),
      avgPrice: d.avgPrice ? Math.round(parseFloat(String(d.avgPrice))) : null,
      medianPrice: d.medianPrice ? Math.round(parseFloat(String(d.medianPrice))) : null,
      totalActive: d.totalActive,
      newListings: d.newListings,
      removedListings: d.removedListings,
    }));

  const enriched = enrichListingsWithDealStatus(activeListings);
  const toPoint = (l: typeof enriched[number]) => ({
    id: l.id,
    mileage: l.mileage!,
    price: l.askingPrice!,
    title: l.title ?? undefined,
    url: l.url,
  });
  const scatter = {
    good:       enriched.filter(l => l.mileage != null && l.askingPrice != null && l.dealStatus === "good").map(toPoint),
    fair:       enriched.filter(l => l.mileage != null && l.askingPrice != null && l.dealStatus === "fair").map(toPoint),
    overpriced: enriched.filter(l => l.mileage != null && l.askingPrice != null && l.dealStatus === "overpriced").map(toPoint),
  };

  const axisProps = {
    tick: { fontSize: 11, fill: "hsl(215 15% 44%)" },
    tickLine: false as const,
    axisLine: false as const,
  };

  return (
    <section>
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-base font-semibold text-foreground tracking-tight">Price Trends</h2>
        <div className="flex-1 h-px bg-border/60" />
        <span className="text-xs text-muted-foreground">{sorted.length} days</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Price over time */}
        <ChartCard title="Price Over Time">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={sorted}>
              <CartesianGrid strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="date" {...axisProps} />
              <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} {...axisProps} domain={["auto","auto"]} />
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="avgPrice" name="Avg Price" stroke={C.blue} strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="medianPrice" name="Median Price" stroke={C.violet} strokeWidth={2} dot={false} strokeDasharray="5 3" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Inventory */}
        <ChartCard title="Inventory Count">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={sorted}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.emerald} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={C.emerald} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="date" {...axisProps} />
              <YAxis {...axisProps} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="totalActive" name="Active Listings" stroke={C.emerald} fill="url(#areaGrad)" strokeWidth={2} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Daily activity */}
        <ChartCard title="Daily Listing Activity">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={sorted} barGap={2}>
              <CartesianGrid strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="date" {...axisProps} />
              <YAxis {...axisProps} />
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="newListings" name="New" fill={C.green} radius={[3, 3, 0, 0]} opacity={0.85} />
              <Bar dataKey="removedListings" name="Removed" fill={C.red} radius={[3, 3, 0, 0]} opacity={0.75} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Price vs mileage */}
        <ChartCard title="Price vs Mileage">
          <PriceMileageChart
            good={scatter.good}
            fair={scatter.fair}
            overpriced={scatter.overpriced}
            vehicleKey={vehicleKey}
          />
        </ChartCard>
      </div>
    </section>
  );
}
