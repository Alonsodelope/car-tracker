export type DealStatus = "good" | "fair" | "overpriced" | "unknown";

export interface ListingWithMeta {
  id: number;
  externalId: string | null;
  sourceId: number;
  sourceName: string;
  url: string;
  title: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  askingPrice: number | null;
  mileage: number | null;
  location: string | null;
  sellerName: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  imageUrl: string | null;
  status: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  // computed
  daysOnMarket: number;
  fairValue: number | null;
  dealStatus: DealStatus;
  priceDelta: number | null; // vs fair value
  priceDeltaPct: number | null;
  isNew: boolean; // first seen today
  hasPriceDrop: boolean;
  priceDropAmount: number | null;
}

export interface MarketStats {
  totalActive: number;
  newToday: number;
  removedToday: number;
  netChange: number;
  avgPrice: number | null;
  medianPrice: number | null;
  avgMileage: number | null;
  medianMileage: number | null;
  prevAvgPrice: number | null;
  prevMedianPrice: number | null;
}

export interface ChartDataPoint {
  date: string;
  avgPrice: number | null;
  medianPrice: number | null;
  totalActive: number | null;
  newListings: number | null;
  removedListings: number | null;
}

export interface SyncResult {
  date: string;
  source: string;
  vehicleKey: string;
  newListings: number;
  updatedListings: number;
  removedListings: number;
  errors: string[];
  durationMs: number;
}
