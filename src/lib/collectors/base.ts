// ─── Vehicle profile system ───────────────────────────────────────────────────

export interface VehicleProfile {
  /** Unique slug used as DB key and URL param — e.g. "bmw-m2", "ford-bronco-fe" */
  key: string;
  /** Human-readable name shown in the UI */
  displayName: string;
  /** Short label for tabs / badges */
  shortName: string;
  /** Lowercase make for building search URLs (e.g. "bmw", "ford") */
  make: string;
  /** Lowercase model slug for building search URLs (e.g. "m2", "bronco") */
  model: string;
  /** Display-case make (e.g. "BMW", "Ford") */
  makeDisplay: string;
  /** Display-case model (e.g. "M2", "Bronco") */
  modelDisplay: string;
  yearMin: number;
  yearMax: number;
  /** If undefined, no price cap is applied */
  maxPrice?: number;
  stockType: "used" | "new" | "all";
  /**
   * If set, only listings whose trim/title contains this string (case-insensitive)
   * are accepted. Used for edition-specific tracking (e.g. "first edition").
   */
  trimFilter?: string;
  /**
   * If set, the Autotrader model-code / model-name check uses this string.
   * Defaults to model.toUpperCase() if omitted.
   */
  modelCodeFilter?: string;
  /**
   * Cars.com uses underscores for multi-word makes (e.g. "mercedes_benz").
   * If omitted, falls back to `make`. Single-word makes (bmw, ford, porsche)
   * don't need this.
   */
  carsComMake?: string;
  /**
   * Cars.com model slug if it differs from `model`
   * (e.g. "sl_class" instead of "sl-class").
   */
  carsComModel?: string;
}

export const VEHICLE_PROFILES: VehicleProfile[] = [
  {
    key: "bmw-m2",
    displayName: "BMW M2",
    shortName: "BMW M2",
    make: "bmw",
    model: "m2",
    makeDisplay: "BMW",
    modelDisplay: "M2",
    yearMin: 2023,
    yearMax: 2025,
    maxPrice: 60_000,
    stockType: "used",
    modelCodeFilter: "M2",
  },
  {
    key: "ford-bronco-fe",
    displayName: "Ford Bronco First Edition",
    shortName: "Bronco FE",
    make: "ford",
    model: "bronco",
    makeDisplay: "Ford",
    modelDisplay: "Bronco",
    yearMin: 2021,
    yearMax: 2022,
    stockType: "used",
    // Strict trim filter — only "First Edition" listings are kept
    trimFilter: "first edition",
  },
  {
    key: "porsche-996-turbo",
    displayName: "Porsche 911 996 Turbo",
    shortName: "996 Turbo",
    make: "porsche",
    model: "911",
    makeDisplay: "Porsche",
    modelDisplay: "911",
    yearMin: 2000,
    yearMax: 2005,
    stockType: "used",
    // Filter to Turbo only — excludes Carrera, GT3, Targa, Boxster etc.
    trimFilter: "turbo",
    // Explicit model code to avoid Autotrader matching other Porsche models
    modelCodeFilter: "911",
  },
  {
    key: "porsche-997-carrera-s",
    displayName: "Porsche 911 Carrera S (997.1)",
    shortName: "997.1 CS",
    make: "porsche",
    model: "911",
    makeDisplay: "Porsche",
    modelDisplay: "911",
    yearMin: 2005,
    yearMax: 2008,
    stockType: "used",
    // "carrera s" is NOT a substring of "carrera 4s" (the "4" breaks the match),
    // so Carrera 4S (AWD) listings are naturally excluded. Tiptronic can't be
    // excluded via trimFilter — mark those 👎 manually.
    trimFilter: "carrera s",
    modelCodeFilter: "911",
  },
  {
    key: "mercedes-sl600-r129",
    displayName: "Mercedes-Benz SL 600",
    shortName: "SL 600",
    make: "mercedes-benz",
    model: "sl-class",
    makeDisplay: "Mercedes-Benz",
    modelDisplay: "SL 600",
    yearMin: 1994,
    yearMax: 2002,
    stockType: "used",
    trimFilter: "600",
    modelCodeFilter: "SL",
    carsComMake: "mercedes_benz",
    carsComModel: "sl_class",
  },
];

/** Look up a profile by key; defaults to the first profile if not found */
export function getProfile(key: string | undefined): VehicleProfile {
  return VEHICLE_PROFILES.find((p) => p.key === key) ?? VEHICLE_PROFILES[0];
}

// ─── Scraped listing shape ────────────────────────────────────────────────────

export interface ScrapedListing {
  externalId?: string;
  url: string;
  title: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  askingPrice: number;
  mileage?: number;
  location?: string;
  sellerName?: string;
  exteriorColor?: string;
  interiorColor?: string;
  imageUrl?: string;
  vin?: string;
  stockId?: string;
  phone?: string;
  /** Source-reported days the listing has been on the market (used to backdate firstSeenAt) */
  sourceDaysOnMarket?: number;
  /** Source-reported transmission type normalised to "manual" | "automatic" */
  transmissionText?: "manual" | "automatic";
  rawPayload?: Record<string, unknown>;
}

// ─── Adapter interface ────────────────────────────────────────────────────────

export interface CollectorAdapter {
  readonly sourceName: string;
  collect(): Promise<ScrapedListing[]>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function parsePrice(raw: string | undefined | null): number | undefined {
  if (!raw) return undefined;
  const num = parseInt(raw.replace(/[^0-9]/g, ""), 10);
  return isNaN(num) ? undefined : num;
}

export function parseMileage(raw: string | undefined | null): number | undefined {
  if (!raw) return undefined;
  const num = parseInt(raw.replace(/[^0-9]/g, ""), 10);
  return isNaN(num) ? undefined : num;
}

export function parseYear(raw: string | undefined | null): number | undefined {
  if (!raw) return undefined;
  const num = parseInt(raw, 10);
  return isNaN(num) || num < 1980 || num > 2030 ? undefined : num;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function jitter(baseMs: number, rangeMs = 500): number {
  return baseMs + Math.floor(Math.random() * rangeMs);
}

/**
 * Returns true if the listing's trim, title, or subtitle contains the filter
 * string (case-insensitive). Used for edition-specific matching.
 */
export function matchesTrimFilter(
  filter: string,
  trim?: string,
  title?: string
): boolean {
  const f = filter.toLowerCase();
  if (trim && trim.toLowerCase().includes(f)) return true;
  if (title && title.toLowerCase().includes(f)) return true;
  return false;
}
