import {
  CollectorAdapter,
  ScrapedListing,
  VehicleProfile,
  parsePrice,
  parseMileage,
  sleep,
  jitter,
  matchesTrimFilter,
} from "./base";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
};

function buildBaseUrl(profile: VehicleProfile): string {
  // Cars.com model slug format: {make}-{model}
  const modelSlug = `${profile.make}-${profile.model}`;
  let url =
    "https://www.cars.com/shopping/results/" +
    `?makes[]=${profile.make}` +
    `&models[]=${modelSlug}` +
    `&year_min=${profile.yearMin}` +
    `&year_max=${profile.yearMax}` +
    `&stock_type=${profile.stockType}` +
    `&sort=best_match_desc` +
    `&maximum_distance=all`;
  if (profile.maxPrice) url += `&maximum_price=${profile.maxPrice}`;
  return url;
}

export class CarsComCollector implements CollectorAdapter {
  readonly sourceName = "cars.com";
  private readonly profile: VehicleProfile;
  private readonly baseUrl: string;

  constructor(profile: VehicleProfile) {
    this.profile = profile;
    this.baseUrl = buildBaseUrl(profile);
  }

  async collect(): Promise<ScrapedListing[]> {
    const allListings: ScrapedListing[] = [];
    let totalPages = 1;

    for (let pageNum = 1; pageNum <= Math.min(totalPages, 20); pageNum++) {
      const url = `${this.baseUrl}&page=${pageNum}`;
      console.log(`[cars.com:${this.profile.key}] Fetching page ${pageNum}: ${url}`);

      try {
        const res = await fetch(url, { headers: FETCH_HEADERS });
        if (!res.ok) {
          if (pageNum === 1) {
            // Source is unavailable — throw so caller knows collection failed entirely
            throw new Error(`HTTP ${res.status} on page 1 — source unavailable`);
          }
          console.warn(`[cars.com:${this.profile.key}] HTTP ${res.status} on page ${pageNum}`);
          break;
        }

        const html = await res.text();
        const { listings, pages, rawCount } = this.parseHtml(html, pageNum);

        if (pageNum === 1) totalPages = pages;

        // Stop only when the source itself has no more results (rawCount = 0),
        // not when the trim filter removes everything from a page.
        if (rawCount === 0) {
          console.log(`[cars.com:${this.profile.key}] No raw results on page ${pageNum}, stopping`);
          break;
        }

        allListings.push(...listings);
        console.log(`[cars.com:${this.profile.key}] Page ${pageNum}: ${listings.length} matched / ${rawCount} raw`);

        if (pageNum < totalPages) {
          await sleep(jitter(2000, 800));
        }
      } catch (err) {
        if (pageNum === 1) throw err; // page 1 failure = source unavailable, propagate up
        console.error(`[cars.com:${this.profile.key}] Error on page ${pageNum}:`, err);
        break;
      }
    }

    console.log(`[cars.com:${this.profile.key}] Total collected: ${allListings.length}`);
    return this.dedup(allListings);
  }

  private parseHtml(
    html: string,
    pageNum: number
  ): { listings: ScrapedListing[]; pages: number; rawCount: number } {
    // Find the large JSON blob embedded in a <script> tag
    const scriptMatches = [...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)];
    const bigScript = scriptMatches.find((m) => m[1].includes("srp_results"));

    if (!bigScript) {
      console.warn(`[cars.com:${this.profile.key}] No srp_results JSON found on page ${pageNum}`);
      return { listings: [], pages: 1, rawCount: 0 };
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(bigScript[1]) as Record<string, unknown>;
    } catch {
      console.warn(`[cars.com:${this.profile.key}] Failed to parse JSON on page ${pageNum}`);
      return { listings: [], pages: 1, rawCount: 0 };
    }

    const srp = data.srp_results as Record<string, unknown> | undefined;
    if (!srp) return { listings: [], pages: 1, rawCount: 0 };

    const metadata = srp.metadata as Record<string, unknown> | undefined;
    const totalPages = typeof metadata?.total_pages === "number" ? metadata.total_pages : 1;

    const results = srp.results as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(results)) return { listings: [], pages: totalPages, rawCount: 0 };

    const listings: ScrapedListing[] = [];

    for (const result of results) {
      try {
        const listing = this.parseResult(result);
        if (listing) listings.push(listing);
      } catch {
        // skip malformed
      }
    }

    return { listings, pages: totalPages, rawCount: results.length };
  }

  private parseResult(result: Record<string, unknown>): ScrapedListing | null {
    const listingId = result.listing_id as string | undefined;
    if (!listingId) return null;

    // The on_view_interactions payload has structured listing data
    const interactions = result.on_view_interactions as Array<{ payload?: string }> | undefined;
    const rawPayload = interactions?.[0]?.payload;

    let payload: Record<string, unknown> = {};
    if (rawPayload) {
      try {
        // The payload is HTML-encoded JSON
        const decoded = rawPayload
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");
        payload = JSON.parse(decoded) as Record<string, unknown>;
      } catch {
        // fallback to extracting from body
      }
    }

    const price =
      typeof payload.price === "string" || typeof payload.price === "number"
        ? parsePrice(String(payload.price))
        : this.extractPriceFromBody(result.body);

    if (!price) return null;

    const year =
      typeof payload.year === "string" ? parseInt(payload.year, 10) : undefined;
    const mileage =
      typeof payload.mileage === "string"
        ? parseMileage(payload.mileage)
        : this.extractMileageFromBody(result.body);

    const trim = typeof payload.trim === "string" ? payload.trim : undefined;

    // Apply trim filter if profile requires it (e.g. "First Edition" only)
    if (this.profile.trimFilter) {
      const titleStr = `${year ?? ""} ${this.profile.makeDisplay} ${this.profile.modelDisplay}${trim ? " " + trim : ""}`.trim();
      if (!matchesTrimFilter(this.profile.trimFilter, trim, titleStr)) {
        return null;
      }
    }

    const imageUrl =
      typeof payload.primaryThumbnail === "string" ? payload.primaryThumbnail : undefined;

    const vin = typeof payload.vin === "string" && payload.vin.length > 0
      ? payload.vin : undefined;

    // Transmission — try structured payload field first, then body tree DatumIcon
    const rawTx = (
      typeof payload.transmission === "string" ? payload.transmission :
      this.extractTransmissionFromBody(result.body) ?? ""
    ).toLowerCase();
    const transmissionText: "manual" | "automatic" | undefined =
      rawTx.includes("manual") ? "manual"
      : rawTx.includes("auto") || rawTx.includes("tiptronic") || rawTx.includes("pdk") ? "automatic"
      : undefined;

    const location = this.extractLocationFromFooter(result.footer);

    const url = `https://www.cars.com/vehicledetail/${listingId}/`;
    const title = `${year ?? ""} ${this.profile.makeDisplay} ${this.profile.modelDisplay}${trim ? " " + trim : ""}`.trim();

    return {
      externalId: listingId,
      url,
      title,
      year: year ?? this.profile.yearMin,
      make: this.profile.makeDisplay,
      model: this.profile.modelDisplay,
      trim,
      askingPrice: price,
      mileage,
      location,
      imageUrl,
      vin,
      transmissionText,
      rawPayload: payload as Record<string, unknown>,
    };
  }

  private extractPriceFromBody(body: unknown): number | undefined {
    return this.findInTree(body, (node: Record<string, unknown>) => {
      if (node.__typename === "Text" && Array.isArray(node.text_snippets)) {
        const text = (node.text_snippets as Array<{ text: string }>)
          .map((s) => s.text)
          .join("");
        if (text.startsWith("$")) return parsePrice(text);
      }
      return undefined;
    });
  }

  private extractMileageFromBody(body: unknown): number | undefined {
    return this.findInTree(body, (node: Record<string, unknown>) => {
      if (node.__typename === "DatumIcon" && node.style_identifier === "mileage") {
        return parseMileage(String(node.value ?? ""));
      }
      return undefined;
    });
  }

  private extractTransmissionFromBody(body: unknown): string | undefined {
    return this.findInTree(body, (node: Record<string, unknown>) => {
      if (node.__typename === "DatumIcon" && node.style_identifier === "transmission") {
        return String(node.value ?? "").trim() || undefined;
      }
      return undefined;
    });
  }

  private extractLocationFromFooter(footer: unknown): string | undefined {
    return this.findInTree(footer, (node: Record<string, unknown>) => {
      if (node.__typename === "DatumIcon" && node.name === "Listing location") {
        const val = String(node.value ?? "");
        // Strip "(X mi)" suffix
        return val.replace(/\s*\(\d+\s*mi\).*$/, "").trim() || undefined;
      }
      return undefined;
    });
  }

  private findInTree<T>(
    obj: unknown,
    fn: (node: Record<string, unknown>) => T | undefined,
    depth = 0
  ): T | undefined {
    if (!obj || typeof obj !== "object" || depth > 10) return undefined;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const result = this.findInTree(item, fn, depth + 1);
        if (result !== undefined) return result;
      }
      return undefined;
    }
    const node = obj as Record<string, unknown>;
    const val = fn(node);
    if (val !== undefined) return val;
    for (const v of Object.values(node)) {
      const result = this.findInTree(v, fn, depth + 1);
      if (result !== undefined) return result;
    }
    return undefined;
  }

  private dedup(listings: ScrapedListing[]): ScrapedListing[] {
    const seen = new Set<string>();
    return listings.filter((l) => {
      if (seen.has(l.url)) return false;
      seen.add(l.url);
      return true;
    });
  }
}
