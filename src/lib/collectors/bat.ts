import {
  CollectorAdapter,
  ScrapedListing,
  VehicleProfile,
  matchesTrimFilter,
  sleep,
  jitter,
} from "./base";

// Bring a Trailer — active auction collector
// Fetches bringatrailer.com/auctions/ and parses the embedded JSON blob
// containing all currently running auctions (~1,100 items per fetch).

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

interface BatItem {
  active: boolean;
  id: string | number;
  title: string;
  url: string;
  current_bid: number | null;
  excerpt: string | null;
  year: string | number | null;
  country: string | null;
  country_code: string | null;
  thumbnail_url: string | null;
  timestamp_end: string | number | null;
  noreserve: boolean;
  searchable: string | null;
}

// Extract mileage from BaT listing titles.
// Patterns: "27k-Mile", "5k-Mile", "No Reserve: 8k-Mile", "1,200-Mile"
function parseBatMileage(title: string): number | undefined {
  // "27k-Mile" or "27.5k-Mile"
  const kMatch = title.match(/(\d+(?:\.\d+)?)k-Mile/i);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);

  // "1,200-Mile" or "800-Mile"
  const rawMatch = title.match(/(\d[\d,]*)-Mile/i);
  if (rawMatch) return parseInt(rawMatch[1].replace(/,/g, ""), 10);

  return undefined;
}

function extractYear(item: BatItem): number | undefined {
  if (item.year) {
    const y = parseInt(String(item.year), 10);
    if (y >= 1950 && y <= 2030) return y;
  }
  // Fallback: parse from title (e.g. "2023 BMW M2")
  const m = item.title.match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : undefined;
}

export class BATCollector implements CollectorAdapter {
  readonly sourceName = "bringatrailer";
  private readonly profile: VehicleProfile;

  constructor(profile: VehicleProfile) {
    this.profile = profile;
  }

  async collect(): Promise<ScrapedListing[]> {
    console.log(`[bat:${this.profile.key}] Fetching active auctions page`);

    let html: string;
    try {
      const res = await fetch("https://bringatrailer.com/auctions/", {
        headers: FETCH_HEADERS,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} — source unavailable`);
      }
      html = await res.text();
    } catch (err) {
      throw new Error(`[bat:${this.profile.key}] Fetch failed: ${err}`);
    }

    const items = this.parseActiveAuctions(html);
    if (items === null) {
      throw new Error(`[bat:${this.profile.key}] Could not parse auctionsCurrentInitialData — source unavailable`);
    }

    console.log(`[bat:${this.profile.key}] Parsed ${items.length} total active auctions`);

    const matched = items
      .filter((item) => this.matchesProfile(item))
      .map((item) => this.toScrapedListing(item))
      .filter((l): l is ScrapedListing => l !== null);

    console.log(`[bat:${this.profile.key}] ${matched.length} listings matched profile`);

    // BaT pages are large — brief pause to be polite
    await sleep(jitter(500, 300));

    return matched;
  }

  private parseActiveAuctions(html: string): BatItem[] | null {
    // BaT embeds all active auctions in: var auctionsCurrentInitialData = {...};
    const varStart = html.indexOf("var auctionsCurrentInitialData = ");
    if (varStart === -1) return null;

    const objStart = html.indexOf("{", varStart);
    if (objStart === -1) return null;

    // Walk matching braces to find the end of the object
    let depth = 0;
    let objEnd = objStart;
    for (let i = 0; i < html.length - objStart; i++) {
      const c = html[objStart + i];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          objEnd = objStart + i + 1;
          break;
        }
      }
    }

    try {
      const data = JSON.parse(html.slice(objStart, objEnd)) as { items?: BatItem[] };
      return data.items ?? [];
    } catch {
      return null;
    }
  }

  private matchesProfile(item: BatItem): boolean {
    if (!item.active) return false;
    if (!item.title || !item.url) return false;
    if (!item.current_bid) return false;

    const title = item.title.toLowerCase();
    const searchable = (item.searchable ?? "").toLowerCase();
    const combined = `${title} ${searchable}`;

    // Year range check
    const year = extractYear(item);
    if (year !== undefined) {
      if (year < this.profile.yearMin || year > this.profile.yearMax) return false;
    }

    // Model check — require match in the TITLE specifically (not just searchable)
    // to avoid false positives from VIN codes or unrelated model numbers.
    const modelFilter = (this.profile.modelCodeFilter ?? this.profile.modelDisplay).toLowerCase();
    const makeFilter = this.profile.makeDisplay.toLowerCase();

    // Title must contain the make
    if (!title.includes(makeFilter) && !title.includes(this.profile.make.toLowerCase())) {
      return false;
    }

    // Title must contain the model as a whole word (e.g. "m2" not inside "r1300gs")
    const modelRegex = new RegExp(`\\b${modelFilter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (!modelRegex.test(item.title)) {
      return false;
    }

    // Trim filter (e.g. "turbo" for 996 Turbo, "first edition" for Bronco FE)
    if (this.profile.trimFilter) {
      if (!matchesTrimFilter(this.profile.trimFilter, undefined, item.title)) {
        return false;
      }
    }

    // Price cap
    if (this.profile.maxPrice && item.current_bid > this.profile.maxPrice) {
      return false;
    }

    return true;
  }

  private toScrapedListing(item: BatItem): ScrapedListing | null {
    const price = item.current_bid;
    if (!price) return null;

    const year = extractYear(item);
    const mileage = parseBatMileage(item.title);

    // Location — BaT has lat/lon but not city/state in the main listing data.
    // Country is usually "United States". We leave location as country only
    // since city-level data requires fetching the individual listing page.
    const location = item.country ?? undefined;

    // Transmission — parse from title/excerpt if mentioned
    const txText = `${item.title} ${item.excerpt ?? ""}`.toLowerCase();
    const transmissionText: "manual" | "automatic" | undefined =
      txText.includes("-speed") || txText.includes("manual") || txText.includes("stick")
        ? "manual"
        : txText.includes("automatic") || txText.includes("pdk") || txText.includes("smg")
          ? "automatic"
          : undefined;

    return {
      externalId: String(item.id),
      url: item.url,
      title: item.title,
      year: year ?? this.profile.yearMin,
      make: this.profile.makeDisplay,
      model: this.profile.modelDisplay,
      askingPrice: price,
      mileage,
      location,
      imageUrl: item.thumbnail_url ?? undefined,
      transmissionText,
      rawPayload: item as unknown as Record<string, unknown>,
    };
  }
}
