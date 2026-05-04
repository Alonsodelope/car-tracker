"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { ListingSnapshot, PriceChange } from "@/lib/db/schema";
import { format, parseISO } from "date-fns";

interface PriceHistoryChartProps {
  snapshots: ListingSnapshot[];
  priceChanges: PriceChange[];
}

export function PriceHistoryChart({ snapshots, priceChanges }: PriceHistoryChartProps) {
  if (snapshots.length === 0) {
    return (
      <div className="h-48 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <div className="w-8 h-8 rounded-full border border-border/60 flex items-center justify-center text-muted-foreground/40">–</div>
        No price history yet. Check back after the first sync.
      </div>
    );
  }

  const data = snapshots.map(s => ({
    date: format(parseISO(s.snapshotDate + "T12:00:00"), "MMM d"),
    price: s.askingPrice,
  }));

  const changeDates = new Set(priceChanges.map(c => format(new Date(c.changedAt), "MMM d")));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "hsl(215 15% 44%)" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 11, fill: "hsl(215 15% 44%)" }}
          tickLine={false}
          axisLine={false}
          domain={["auto", "auto"]}
        />
        <Tooltip
          formatter={(v: number) => [`$${v.toLocaleString()}`, "Price"]}
          contentStyle={{
            background: "#ffffff",
            border: "1px solid hsl(220 15% 88%)",
            borderRadius: "0.5rem",
            fontSize: 12,
            color: "hsl(222 25% 10%)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
          }}
        />
        {Array.from(changeDates).map(d => (
          <ReferenceLine
            key={d}
            x={d}
            stroke="hsl(160 84% 39%)"
            strokeDasharray="3 3"
            strokeOpacity={0.6}
          />
        ))}
        <Line
          type="monotone"
          dataKey="price"
          stroke="hsl(217 91% 60%)"
          strokeWidth={2}
          dot={{ r: 3, fill: "hsl(217 91% 60%)", strokeWidth: 0 }}
          activeDot={{ r: 5, fill: "hsl(217 91% 60%)" }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
