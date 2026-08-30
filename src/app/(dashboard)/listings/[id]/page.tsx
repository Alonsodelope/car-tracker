import { db } from "@/lib/db/client";
import { listings, listingSnapshots, priceChanges, sources } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DealBadge } from "@/components/listings/DealBadge";
import { PriceHistoryChart } from "@/components/listings/PriceHistoryChart";
import { estimateFairValue, classifyDeal, priceDelta, classifyTransmission } from "@/lib/market/fair-value";
import { format, differenceInDays } from "date-fns";
import { ExternalLink, ArrowLeft, Calendar, MapPin, Gauge, Tag, Phone, Hash, Car } from "lucide-react";

function isSeedListing(externalId: string | null) {
  return externalId?.startsWith("SEED-") ?? false;
}

function formatPhone(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

export default async function ListingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound();

  const listingRows = await db
    .select({ listing: listings, sourceName: sources.name })
    .from(listings)
    .innerJoin(sources, eq(listings.sourceId, sources.id))
    .where(eq(listings.id, id))
    .limit(1);

  if (!listingRows[0]) notFound();
  const { listing, sourceName } = listingRows[0];

  const snaps = await db.select().from(listingSnapshots).where(eq(listingSnapshots.listingId, id)).orderBy(asc(listingSnapshots.snapshotDate));
  const changes = await db.select().from(priceChanges).where(eq(priceChanges.listingId, id)).orderBy(asc(priceChanges.changedAt));
  const activeListings = await db.select().from(listings).where(eq(listings.status, "active"));

  const fairValue = estimateFairValue(listing, activeListings);
  const deal = listing.askingPrice ? classifyDeal(listing.askingPrice, fairValue) : "unknown";
  const delta = listing.askingPrice ? priceDelta(listing.askingPrice, fairValue) : { amount: null, pct: null };

  const transmission = classifyTransmission(listing);
  const transmissionLabel = transmission === "manual" ? "Manual" : transmission === "automatic" ? "Automatic" : "Unknown";

  const daysActive = differenceInDays(
    listing.status === "removed" ? new Date(listing.lastSeenAt) : new Date(),
    new Date(listing.firstSeenAt)
  );
  const isNew = format(new Date(listing.firstSeenAt), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
  const isSeed = isSeedListing(listing.externalId);
  const formattedPhone = formatPhone(listing.phone);

  const similar = activeListings
    .filter(l =>
      l.id !== listing.id &&
      l.year != null && listing.year != null && Math.abs(l.year - listing.year) <= 1 &&
      l.mileage != null && listing.mileage != null && Math.abs(l.mileage - listing.mileage) <= 20_000
    )
    .sort((a, b) => Math.abs((a.askingPrice ?? 0) - (listing.askingPrice ?? 0)) - Math.abs((b.askingPrice ?? 0) - (listing.askingPrice ?? 0)))
    .slice(0, 4);

  function Row({ label, value, icon, mono }: { label: string; value?: string | null; icon?: React.ReactNode; mono?: boolean }) {
    if (!value) return null;
    return (
      <div className="flex justify-between items-start gap-4 py-2.5 border-b border-border last:border-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          {icon && <span className="text-muted-foreground w-3.5">{icon}</span>}
          <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
        </div>
        <span className={`text-sm font-medium text-foreground text-right break-all ${mono ? "font-mono" : "tabular"}`}>{value}</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Back */}
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" />
        Dashboard
      </Link>

      {/* Hero header */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="m-stripe h-0.5 w-full" />
        <div className="p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                  {sourceName}
                </Badge>
                {listing.status === "removed" && <Badge variant="ghost">Removed</Badge>}
                {isNew && listing.status === "active" && <Badge variant="info">New Today</Badge>}
                {listing.trim && <Badge variant="secondary">{listing.trim}</Badge>}
                {isSeed && <Badge variant="warning">Demo Data</Badge>}
              </div>

              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                {listing.title ?? "BMW M2"}
              </h1>

              <div className="flex flex-wrap gap-4 mt-3">
                {listing.mileage && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Gauge className="w-3.5 h-3.5" />
                    {listing.mileage.toLocaleString()} mi
                  </div>
                )}
                {listing.location && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5" />
                    {listing.location}
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  {daysActive > 0 ? `${daysActive}d on market` : "New listing"}
                </div>
              </div>
            </div>

            {/* Price + deal block */}
            <div className="flex flex-col items-end gap-3">
              <div className="text-4xl font-black tabular text-foreground tracking-tight">
                {listing.askingPrice ? `$${listing.askingPrice.toLocaleString()}` : "–"}
              </div>
              <DealBadge status={deal} pctDiff={delta.pct} />
              {fairValue && (
                <p className="text-xs text-muted-foreground">
                  Fair value est.{" "}
                  <span className="text-foreground font-semibold">${Math.round(fairValue).toLocaleString()}</span>
                  {delta.amount != null && (
                    <span className={delta.amount < 0 ? "text-emerald-600 ml-1.5" : "text-red-600 ml-1.5"}>
                      ({delta.amount > 0 ? "+" : ""}${delta.amount.toLocaleString()})
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Source link card — full identifying info ──────────────────────────── */}
      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-primary/10 flex items-center justify-between gap-4">
          <p className="text-xs font-semibold text-primary uppercase tracking-widest">Original Listing</p>
          {listing.status === "removed" && (
            <Badge variant="destructive" className="text-[10px]">Listing Removed</Badge>
          )}
        </div>
        <div className="p-5 space-y-4">
          {/* Big open button */}
          <a
            href={isSeed ? "#" : listing.url}
            target={isSeed ? undefined : "_blank"}
            rel="noopener noreferrer"
            onClick={isSeed ? (e) => e.preventDefault() : undefined}
            className={`flex items-center justify-center gap-2.5 w-full py-3 rounded-lg font-semibold text-sm transition-all shadow-md ${
              isSeed
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/25"
            }`}
          >
            <ExternalLink className="w-4 h-4" />
            {isSeed ? "Demo listing — no real URL" : `Open on ${sourceName === "cars.com" ? "Cars.com" : "Autotrader"}`}
          </a>

          {/* URL visible as text */}
          {!isSeed && (
            <div className="rounded-md bg-white border border-border px-3 py-2">
              <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-widest">Exact URL</p>
              <a
                href={listing.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary font-mono break-all hover:underline"
              >
                {listing.url}
              </a>
            </div>
          )}

          {/* Identifying fields grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            {listing.externalId && !isSeed && (
              <div className="flex justify-between items-start py-2 border-b border-border/60">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Hash className="w-3 h-3" />Listing ID</span>
                <span className="text-xs font-mono text-foreground font-semibold">{listing.externalId}</span>
              </div>
            )}
            {listing.vin && (
              <div className="flex justify-between items-start py-2 border-b border-border/60">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Car className="w-3 h-3" />VIN</span>
                <span className="text-xs font-mono text-foreground font-semibold tracking-wide">{listing.vin}</span>
              </div>
            )}
            {listing.stockId && listing.stockId !== listing.vin && (
              <div className="flex justify-between items-start py-2 border-b border-border/60">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Tag className="w-3 h-3" />Stock #</span>
                <span className="text-xs font-mono text-foreground font-semibold">{listing.stockId}</span>
              </div>
            )}
            {listing.sellerName && (
              <div className="flex justify-between items-start py-2 border-b border-border/60">
                <span className="text-xs text-muted-foreground">Dealer / Seller</span>
                <span className="text-xs text-foreground font-semibold text-right">{listing.sellerName}</span>
              </div>
            )}
            {formattedPhone && (
              <div className="flex justify-between items-start py-2 border-b border-border/60">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Phone className="w-3 h-3" />Phone</span>
                <a
                  href={`tel:${listing.phone}`}
                  className="text-xs text-primary font-semibold hover:underline"
                >
                  {formattedPhone}
                </a>
              </div>
            )}
            {listing.location && (
              <div className="flex justify-between items-start py-2 border-b border-border/60">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5"><MapPin className="w-3 h-3" />Location</span>
                <span className="text-xs text-foreground font-semibold">{listing.location}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Image */}
      {listing.imageUrl && !listing.imageUrl.includes("dealer.com") && (
        <div className="rounded-xl overflow-hidden border border-border h-64 bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={listing.imageUrl} alt={listing.title ?? "BMW M2"} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Specs */}
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">Vehicle Details</p>
          <Row label="Year" value={String(listing.year ?? "–")} />
          <Row label="Make / Model" value={`${listing.make ?? "BMW"} ${listing.model ?? "M2"}`} />
          <Row label="Trim" value={listing.trim} icon={<Tag className="w-3 h-3" />} />
          <Row label="Transmission" value={transmissionLabel} />
          <Row label="Price" value={listing.askingPrice ? `$${listing.askingPrice.toLocaleString()}` : undefined} />
          <Row label="Mileage" value={listing.mileage ? `${listing.mileage.toLocaleString()} mi` : undefined} icon={<Gauge className="w-3 h-3" />} />
          <Row label="Exterior" value={listing.exteriorColor} />
          <Row label="Interior" value={listing.interiorColor} />
          <Row label="Location" value={listing.location} icon={<MapPin className="w-3 h-3" />} />
          <Row label="First Seen" value={format(new Date(listing.firstSeenAt), "MMM d, yyyy")} icon={<Calendar className="w-3 h-3" />} />
          <Row label="Days on Market" value={daysActive > 0 ? `${daysActive} days` : "New listing"} />
          <div className="pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Status</span>
              <Badge variant={listing.status === "active" ? "success" : "ghost"} className="capitalize">
                {listing.status}
              </Badge>
            </div>
          </div>
        </div>

        {/* Price history chart */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 pt-5 pb-3 border-b border-border">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Price History</p>
          </div>
          <div className="p-5">
            <PriceHistoryChart snapshots={snaps} priceChanges={changes} />
          </div>
        </div>
      </div>

      {/* Similar listings */}
      {similar.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-semibold tracking-tight">Similar Listings</h2>
            <div className="flex-1 h-px bg-border/60" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {similar.map((s) => (
              <Link key={s.id} href={`/listings/${s.id}`}>
                <div className="group rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer">
                  <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                    {s.title ?? "BMW M2"}
                  </p>
                  <p className="text-xl font-bold tabular mt-1">
                    {s.askingPrice ? `$${s.askingPrice.toLocaleString()}` : "–"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {s.mileage ? `${s.mileage.toLocaleString()} mi` : ""}
                    {s.mileage && s.location ? " · " : ""}
                    {s.location ?? ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
