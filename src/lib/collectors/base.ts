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
  /**
   * If set, listings whose trim/title contains ANY of these strings
   * (case-insensitive) are rejected, even if trimFilter otherwise matches.
   * Used to keep a body-style-specific profile from picking up a
   * differently-bodied variant sharing the same trim name.
   */
  excludeKeywords?: string[];
  /**
   * Visor.vin API make override. Visor's `make`/`model` params identify the
   * model FAMILY (not a trim-specific display name) — e.g. for the C63 S,
   * Visor's model is "C-Class" even though modelDisplay is "C 63 AMG S".
   * Defaults to makeDisplay if omitted.
   */
  visorMake?: string;
  /**
   * Visor.vin API model override — see visorMake. Defaults to modelDisplay
   * if omitted, which is correct for most profiles (e.g. "M2", "911",
   * "Bronco") but wrong for ones where modelDisplay is actually a trim of a
   * broader model family (e.g. "C 63 AMG S" → "C-Class", "SL 600" →
   * "SL-Class").
   */
  visorModel?: string;
  /**
   * Exact Visor trim/version values to filter to, sent as the API's own
   * `trim` query param (server-side, exact match — NOT a substring filter
   * like trimFilter). Required whenever visorModel is broader than the
   * vehicle itself (e.g. model "C-Class" covers C300/C43/C63 S/etc) —
   * without this, every listing in that model family would be pulled in
   * and mislabeled. Get exact values by searching the model on visor.vin
   * and reading the trim facet list (see visor.ts for how these are used).
   */
  visorTrims?: string[];
  /**
   * Visor.vin API calls are paid per-request (see api.visor.vin/api pricing).
   * Opt in per-vehicle rather than enabling it tracker-wide — set true only
   * for profiles where the extra coverage is worth the cost.
   */
  useVisor?: boolean;
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
    modelCodeFilter: "SL",
    carsComMake: "mercedes_benz",
    carsComModel: "sl_class",
  },
  {
    key: "mercedes-c63s-w206",
    displayName: "Mercedes-AMG C 63 S E Performance",
    shortName: "AMG C63 S",
    make: "mercedes-benz",
    // Autotrader has a dedicated model page for this exact variant
    // (autotrader.com/cars-for-sale/mercedes-benz/c-63-amg/...) — searching
    // the generic "c-class" model (1,100+ listings, mostly C300/C43) meant
    // our 500-listing/20-page scan cap never reached most of the C63s
    // buried further into the results. Searching "c-63-amg" directly finds
    // all of them (17 nationwide vs. the 5 the c-class search surfaced).
    model: "c-63-amg",
    makeDisplay: "Mercedes-Benz",
    modelDisplay: "C 63 AMG S",
    yearMin: 2024,
    // Capped at 2025 at the user's request — 2026 listings (mostly Visor)
    // were disproportionately the ones with the longest, most suspect
    // "days on market" values (allocation/pre-order-style dealer postings
    // rather than genuine used inventory).
    yearMax: 2025,
    stockType: "used",
    // Matches "AMG C 63 S ..." trims, excludes regular C300/C300 4MATIC etc.
    // Kept as a safety net now that the URL itself is already scoped to C63.
    trimFilter: "c 63",
    // Autotrader's model.code for Mercedes lines is the short series letter
    // (see SL 600 above, which needed "SL" instead of "SL-CLASS") — for
    // C-Class it's "C", not "C-CLASS". Without this override every listing
    // was rejected by the model check before the trim filter even ran.
    modelCodeFilter: "C",
    // Sedan (4-door) only — the current W206 C-Class has no coupe/cabriolet
    // (that body moved to the separate CLE line), but reject them defensively
    // in case a listing is mistitled or a future gen brings one back.
    excludeKeywords: ["coupe", "cabriolet", "convertible", "wagon", "estate"],
    carsComMake: "mercedes_benz",
    carsComModel: "c_class",
    // Visor's model family for this chassis is "C-Class" — "C 63 AMG S" is a trim/version there.
    // Confirmed live on visor.vin: searching "Mercedes-AMG C 63 S" resolves to
    // make=Mercedes-Benz, model=C-Class, with 25 nationwide 2025-2026 (current-gen
    // C63 S / C63 S E Performance) listings, all body_type=Sedan.
    visorModel: "C-Class",
    // Exact trim values from Visor's own facet list for this model (confirmed
    // live on visor.vin — searching "63 S" under C-Class trims returned exactly
    // these three, 26+25+18 = 69 listings, all of them the current-gen sedan).
    // Sent as the API's own `trim` param so filtering happens server-side —
    // critical here because visorModel "C-Class" also covers C300/C43/etc.
    visorTrims: ["AMG® C63 S", "AMG C63 S E Peformance", "AMG C63 S"],
    // Visor API calls cost money per request (see visor.ts) — enabled only for
    // this vehicle, at the user's request, since it's the one filling the
    // cars.com gap. Do not enable tracker-wide without asking first.
    useVisor: true,
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
