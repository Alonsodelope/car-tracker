import { db } from "@/lib/db/client";
import { dailyMarketSummary, sources, listings } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { SyncButton } from "./SyncButton";
import { VEHICLE_PROFILES } from "@/lib/collectors/base";
import { format } from "date-fns";

export const revalidate = 0;

export default async function AdminPage() {
  const recentSummaries = await db
    .select()
    .from(dailyMarketSummary)
    .orderBy(desc(dailyMarketSummary.summaryDate), desc(dailyMarketSummary.vehicleKey))
    .limit(28); // 14 days × 2 vehicles

  const allSources = await db.select().from(sources);

  const counts = await Promise.all(
    allSources.map(async s => {
      const [row] = await db
        .select({ count: sql<number>`COUNT(*)::int`, active: sql<number>`COUNT(*) FILTER (WHERE status = 'active')::int` })
        .from(listings)
        .where(eq(listings.sourceId, s.id));
      return { source: s, count: row?.count ?? 0, active: row?.active ?? 0 };
    })
  );

  const [totals] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      active: sql<number>`COUNT(*) FILTER (WHERE status = 'active')::int`,
    })
    .from(listings);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-1">Settings</p>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">Manual sync, source status, sync history</p>
      </div>

      {/* Sync control */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="m-stripe h-0.5 w-full" />
        <div className="p-6">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">Manual Sync</p>
          <p className="text-sm text-muted-foreground mb-4">
            The daily sync runs automatically at 8:00 AM via the cron process.
            Use this button to trigger an immediate data collection from all sources.
          </p>
          <SyncButton />
          <p className="text-xs text-muted-foreground/60 mt-3">
            Sync runs in the background and may take 3–10 minutes. Refresh the dashboard afterward.
          </p>
        </div>
      </div>

      {/* DB Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Listings", value: totals?.total ?? 0 },
          { label: "Active Listings", value: totals?.active ?? 0 },
          { label: "Sources Active", value: allSources.filter(s => s.enabled).length },
          { label: "Days of History", value: recentSummaries.length },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-5">
            <p className="text-[11px] text-muted-foreground uppercase tracking-widest mb-2">{label}</p>
            <p className="text-2xl font-bold tabular">{value}</p>
          </div>
        ))}
      </div>

      {/* Sources */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-base font-semibold tracking-tight">Sources</h2>
          <div className="flex-1 h-px bg-border/60" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {counts.map(({ source, count, active }) => (
            <div key={source.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-foreground">{source.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{source.baseUrl}</p>
                </div>
                <Badge variant={source.enabled ? "success" : "ghost"}>
                  {source.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <div className="flex gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-semibold tabular">{count}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Active</p>
                  <p className="font-semibold tabular text-emerald-600">{active}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sync history */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-base font-semibold tracking-tight">Sync History</h2>
          <div className="flex-1 h-px bg-border/60" />
        </div>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {["Vehicle", "Date", "Active", "New", "Removed", "Avg Price", "Net"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentSummaries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No sync history yet. Run <code className="bg-muted px-1.5 py-0.5 rounded text-xs">pnpm seed</code> or trigger a sync above.
                  </td>
                </tr>
              )}
              {recentSummaries.map(s => {
                const net = s.netChange ?? 0;
                const vehicleName = VEHICLE_PROFILES.find(p => p.key === s.vehicleKey)?.shortName ?? s.vehicleKey;
                return (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs font-medium text-muted-foreground">{vehicleName}</td>
                    <td className="px-4 py-3 text-sm font-medium">
                      {format(new Date(s.summaryDate + "T12:00:00"), "MMM d, yyyy")}
                    </td>
                    <td className="px-4 py-3 text-sm tabular">{s.totalActive ?? "–"}</td>
                    <td className="px-4 py-3 text-sm tabular text-emerald-600">+{s.newListings ?? 0}</td>
                    <td className="px-4 py-3 text-sm tabular text-red-600">-{s.removedListings ?? 0}</td>
                    <td className="px-4 py-3 text-sm tabular">
                      {s.avgPrice ? `$${Math.round(parseFloat(String(s.avgPrice))).toLocaleString()}` : "–"}
                    </td>
                    <td className={`px-4 py-3 text-sm tabular font-semibold ${net > 0 ? "text-emerald-600" : net < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      {net > 0 ? "+" : ""}{net}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
