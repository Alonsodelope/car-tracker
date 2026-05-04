import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Sources ──────────────────────────────────────────────────────────────────

export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // 'cars.com' | 'autotrader'
  baseUrl: text("base_url").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Listings ─────────────────────────────────────────────────────────────────

export const listings = pgTable("listings", {
  id: serial("id").primaryKey(),
  externalId: text("external_id"),
  sourceId: integer("source_id")
    .references(() => sources.id)
    .notNull(),
  url: text("url").notNull().unique(),
  title: text("title"),
  year: integer("year"),
  make: text("make"),
  model: text("model"),
  trim: text("trim"),
  askingPrice: integer("asking_price"),
  mileage: integer("mileage"),
  location: text("location"),
  sellerName: text("seller_name"),
  exteriorColor: text("exterior_color"),
  interiorColor: text("interior_color"),
  imageUrl: text("image_url"),
  vin: text("vin"),
  stockId: text("stock_id"),
  phone: text("phone"),
  /** Source-reported transmission type, normalised to "manual" | "automatic" | null */
  transmission: text("transmission"),
  vehicleKey: text("vehicle_key").notNull().default("bmw-m2"), // e.g. "bmw-m2" | "ford-bronco-fe"
  status: text("status").default("active").notNull(), // 'active' | 'removed'
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Listing Snapshots ────────────────────────────────────────────────────────

export const listingSnapshots = pgTable(
  "listing_snapshots",
  {
    id: serial("id").primaryKey(),
    listingId: integer("listing_id")
      .references(() => listings.id)
      .notNull(),
    snapshotDate: date("snapshot_date").notNull(),
    askingPrice: integer("asking_price"),
    mileage: integer("mileage"),
    status: text("status"),
    rawPayload: jsonb("raw_payload"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniq: unique().on(t.listingId, t.snapshotDate),
  })
);

// ─── Daily Market Summary ─────────────────────────────────────────────────────

export const dailyMarketSummary = pgTable(
  "daily_market_summary",
  {
    id: serial("id").primaryKey(),
    summaryDate: date("summary_date").notNull(),
    vehicleKey: text("vehicle_key").notNull().default("bmw-m2"),
    totalActive: integer("total_active"),
    newListings: integer("new_listings"),
    removedListings: integer("removed_listings"),
    netChange: integer("net_change"),
    avgPrice: numeric("avg_price", { precision: 10, scale: 2 }),
    medianPrice: numeric("median_price", { precision: 10, scale: 2 }),
    avgMileage: numeric("avg_mileage", { precision: 10, scale: 2 }),
    medianMileage: numeric("median_mileage", { precision: 10, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniq: unique().on(t.summaryDate, t.vehicleKey),
  })
);

// ─── Price Changes ────────────────────────────────────────────────────────────

export const priceChanges = pgTable("price_changes", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .references(() => listings.id)
    .notNull(),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  oldPrice: integer("old_price"),
  newPrice: integer("new_price"),
  changeAmount: integer("change_amount"), // signed: negative = price drop
  changePercent: numeric("change_percent", { precision: 5, scale: 2 }),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const sourcesRelations = relations(sources, ({ many }) => ({
  listings: many(listings),
}));

export const listingsRelations = relations(listings, ({ one, many }) => ({
  source: one(sources, {
    fields: [listings.sourceId],
    references: [sources.id],
  }),
  snapshots: many(listingSnapshots),
  priceChanges: many(priceChanges),
}));

export const listingSnapshotsRelations = relations(
  listingSnapshots,
  ({ one }) => ({
    listing: one(listings, {
      fields: [listingSnapshots.listingId],
      references: [listings.id],
    }),
  })
);

export const priceChangesRelations = relations(priceChanges, ({ one }) => ({
  listing: one(listings, {
    fields: [priceChanges.listingId],
    references: [listings.id],
  }),
}));

// ─── Type Exports ─────────────────────────────────────────────────────────────

export type Source = typeof sources.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type ListingSnapshot = typeof listingSnapshots.$inferSelect;
export type DailyMarketSummary = typeof dailyMarketSummary.$inferSelect;
export type PriceChange = typeof priceChanges.$inferSelect;

export type NewListing = typeof listings.$inferInsert;
export type NewListingSnapshot = typeof listingSnapshots.$inferInsert;
export type NewDailyMarketSummary = typeof dailyMarketSummary.$inferInsert;
export type NewPriceChange = typeof priceChanges.$inferInsert;
