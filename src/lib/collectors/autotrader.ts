import {
  CollectorAdapter,
  ScrapedListing,
  VehicleProfile,
  parseMileage,
  sleep,
  jitter,
  matchesTrimFilter,
} from "./base";

// Mobile User-Agent bypasses Autotrader's bot detection
const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// searchRadius=0 → nationwide search, zip=10001 (NYC) is neutral anchor
// listingType=USED includes both dealer and private-seller listings
function buildBaseUrl(profile: VehicleProfile): string {
  let url =
    "https://www.autotrader.com/cars-for-sale/used-cars" +
    `/${profile.make}/${profile.model}` +
    `?startYear=${profile.yearMin}` +
    `&endYear=${profile.yearMax}` +
    `&listingType=USED` +
    `&searchRadius=0&zip=10001`;
  if (profile.maxPrice) url += `&maxPrice=${profile.maxPrice}`;
  return url;
}

const PAGE_SIZE = 25;

export class AutotraderCollector implements CollectorAdapter {
  readonly sourceName = "autotrader";
  private readonly profile: VehicleProfile;
  private readonly baseUrl: string;

  constructor(profile: VehicleProfile) {
    this.profile = profile;
    this.baseUrl = buildBaseUrl(profile);
  }

  async collect(): Promise<ScrapedListing[]> {
    const allListings: ScrapedListing[] = [];
    let totalCount = PAGE_SIZE; // will be updated from first page

    for (let offset = 0; offset < Math.min(totalCount, 500); offset += PAGE_SIZE) {
      const url = `${this.baseUrl}&firstRecord=${offset}`;
      const pageNum = offset / PAGE_SIZE + 1;
      console.log(`[autotrader:${this.profile.key}] Fetching page ${pageNum}: ${url}`);

      try {
        const res = await fetch(url, { headers: FETCH_HEADERS });
        if (!res.ok) {
          if (pageNum === 1) {
            throw new Error(`HTTP ${res.status} on page 1 — source unavailable`);
          }
          console.warn(`[autotrader:${this.profile.key}] HTTP ${res.status} on page ${pageNum}`);
          break;
        }

        const html = await res.text();
        const { listings, total, rawCount, sourceUnavailable } = this.parseHtml(html, pageNum);

        if (pageNum === 1) {
          if (sourceUnavailable) {
            throw new Error(`No __NEXT_DATA__ on page 1 — source unavailable`);
          }
          totalCount = total;
        }

        // Stop only when the source itself has no more results (rawCount = 0),
        // not when the trim filter removes everything from a page.
        if (rawCount === 0) {
          console.log(`[autotrader:${this.profile.key}] No raw results on page ${pageNum}, stopping`);
          break;
        }

        allListings.push(...listings);
        console.log(`[autotrader:${this.profile.key}] Page ${pageNum}: ${listings.length} matched / ${rawCount} raw (total: ${totalCount})`);

        if (offset + PAGE_SIZE < totalCount) {
          await sleep(jitter(2000, 800));
        }
      } catch (err) {
        if (pageNum === 1) throw err; // page 1 failure = source unavailable, propagate up
        console.error(`[autotrader:${this.profile.key}] Error on page ${pageNum}:`, err);
        break;
      }
    }

    console.log(`[autotrader:${this.profile.key}] Total collected: ${allListings.length}`);
    return this.dedup(allListings);
  }

  private parseHtml(
    html: string,
    pageNum: number
  ): { listings: ScrapedListing[]; total: number; rawCount: number; sourceUnavailable?: boolean } {
    const nextDataMatch = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
    );

    if (!nextDataMatch) {
      const title = html.match(/<title>(.*?)<\/title>/)?.[1] ?? "(unknown)";
      console.warn(`[autotrader:${this.profile.key}] No __NEXT_DATA__ on page ${pageNum} (title: "${title}")`);
      return { listings: [], total: 0, rawCount: 0, sourceUnavailable: true };
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(nextDataMatch[1]) as Record<string, unknown>;
    } catch {
      console.warn(`[autotrader:${this.profile.key}] Failed to parse __NEXT_DATA__ on page ${pageNum}`);
      return { listings: [], total: 0, rawCount: 0 };
    }

    const pageProps = (data.props as Record<string, unknown>)?.pageProps as
      | Record<string, unknown>
      | undefined;
    const eggsState = pageProps?.__eggsState as Record<string, unknown> | undefined;

    if (!eggsState) return { listings: [], total: 0, rawCount: 0 };

    const srpResults = eggsState.srp_results as
      | { activeResults?: number[]; count?: number }
      | undefined;
    const inventory = eggsState.inventory as
      | Record<string, Record<string, unknown>>
      | undefined;
    const owners = eggsState.owners as
      | Record<string, Record<string, unknown>>
      | undefined;

    const total = srpResults?.count ?? 0;
    const activeIds = srpResults?.activeResults ?? [];

    if (!inventory || activeIds.length === 0) {
      return { listings: [], total, rawCount: 0 };
    }

    const listings: ScrapedListing[] = [];

    for (const id of activeIds) {
      const item = inventory[String(id)];
      if (!item) continue;
      const ownerId = String(item.ownerId ?? "");
      const owner = owners?.[ownerId] ?? undefined;
      try {
        const listing = this.parseInventoryItem(item, owner);
        if (listing) listings.push(listing);
      } catch {
        // skip malformed
      }
    }

    return { listings, total, rawCount: activeIds.length };
  }

  private parseInventoryItem(
    item: Record<string, unknown>,
    owner?: Record<string, unknown>
  ): ScrapedListing | null {
    const id = item.id as number | undefined;
    if (!id) return null;

    // Model check — ensure the listing is for the correct model.
    // modelCode has non-alphanumeric chars stripped (e.g. "SL-Class" → "SLCLASS"),
    // so we strip the filter the same way before comparing against modelCode.
    // modelName retains original formatting, so we compare the unstripped filter there.
    const modelObj = item.model as { name?: string; code?: string } | undefined;
    const modelCode = (modelObj?.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const modelName = (modelObj?.name ?? "").toUpperCase();
    const modelFilter = (this.profile.modelCodeFilter ?? this.profile.model).toUpperCase();
    const modelFilterStripped = modelFilter.replace(/[^A-Z0-9]/g, "");
    if (!modelCode.includes(modelFilterStripped) && !modelName.includes(modelFilter)) return null;

    const pricingDetail = item.pricingDetail as
      | { salePrice?: number; price?: number; msrp?: number }
      | undefined;
    const price =
      pricingDetail?.salePrice ?? pricingDetail?.price ?? pricingDetail?.msrp;
    if (!price) return null;

    const year = item.year as number | undefined;
    // trim can be a string or an object like { code: "BRON|First Edition", name: "First Edition" }
    const trimRaw = item.trim as { name?: string } | string | undefined;
    const trim = typeof trimRaw === "string" ? trimRaw : trimRaw?.name;

    // Trim filter: for profiles that require a specific edition (e.g. First Edition)
    if (this.profile.trimFilter) {
      const titleLong = typeof item.titleLong === "string" ? item.titleLong : undefined;
      const titleShort = typeof item.title === "string" ? item.title : undefined;
      if (!matchesTrimFilter(this.profile.trimFilter, trim, titleLong ?? titleShort)) {
        return null;
      }
    }

    const title =
      typeof item.titleLong === "string"
        ? item.titleLong
        : typeof item.title === "string"
          ? item.title
          : `${year ?? ""} ${this.profile.makeDisplay} ${this.profile.modelDisplay}${trim ? " " + trim : ""}`.trim();

    const mileageObj = item.mileage as { value?: string } | undefined;
    const mileage = parseMileage(mileageObj?.value);

    const colorObj = item.color as
      | { exteriorColor?: string; interiorColor?: string }
      | undefined;

    const imagesObj = item.images as
      | { sources?: Array<{ src?: string; alt?: string }> }
      | undefined;
    const imageUrl = imagesObj?.sources?.[0]?.src;

    const ownerName =
      typeof item.ownerName === "string" ? item.ownerName : undefined;

    const vin = typeof item.vin === "string" && item.vin.length > 0
      ? item.vin : undefined;

    const stockId = typeof item.stockId === "string" && item.stockId.length > 0
      ? item.stockId : undefined;

    const phoneObj = item.phone as { value?: string; visible?: boolean } | undefined;
    const phone = phoneObj?.visible && typeof phoneObj?.value === "string"
      ? phoneObj.value.replace(/\D/g, "")
      : undefined;

    const daysOnSite = typeof item.daysOnSite === "number" && item.daysOnSite > 0
      ? item.daysOnSite : undefined;

    // Transmission — check in order of reliability:
    // 1. Structured transmission object  2. specifications field  3. description text
    const txObj = item.transmission as { name?: string; group?: string } | undefined;
    const txSpec = ((item.specifications as Record<string, { value?: string } | undefined> | undefined)
      ?.transmission)?.value ?? "";
    const txDesc = (item.description as { label?: string } | undefined)?.label ?? "";
    // Combine all signals, structured first so it wins
    const txCombined = [txObj?.name ?? txObj?.group ?? "", txSpec, txDesc]
      .join(" ").toLowerCase();
    const transmissionText: "manual" | "automatic" | undefined =
      txCombined.includes("manual") ? "manual"
      : txCombined.includes("auto") || txCombined.includes("tiptronic") || txCombined.includes("pdk") ? "automatic"
      : undefined;

    // Location: use owner.location.address (exact city/state from Autotrader's dealer data)
    const ownerLocation = owner?.location as
      | { address?: { city?: string; state?: string } }
      | undefined;
    const dealerCity = ownerLocation?.address?.city?.trim();
    const dealerState = ownerLocation?.address?.state?.trim();
    const location =
      dealerCity && dealerState ? `${dealerCity}, ${dealerState}` : undefined;

    // Clean title: strip trailing " [City] [STATE] [ZIP]"
    const stateZipMatch = String(title).match(/\s+[A-Z]{2}\s+\d{5,}\s*$/);
    let cleanTitle = stateZipMatch
      ? String(title).slice(0, stateZipMatch.index).trim()
      : String(title).trim();
    if (dealerCity && cleanTitle.endsWith(dealerCity)) {
      cleanTitle = cleanTitle.slice(0, cleanTitle.length - dealerCity.length).trim();
    }

    // Use clean VDP URL without search params
    const url = `https://www.autotrader.com/cars-for-sale/vehicle/${id}`;

    return {
      externalId: String(id),
      url,
      title: cleanTitle,
      year: year ?? this.profile.yearMin,
      make: this.profile.makeDisplay,
      model: this.profile.modelDisplay,
      trim,
      askingPrice: price,
      mileage,
      location,
      sellerName: ownerName,
      exteriorColor: colorObj?.exteriorColor,
      interiorColor: colorObj?.interiorColor,
      imageUrl,
      vin,
      stockId,
      phone,
      sourceDaysOnMarket: daysOnSite,
      transmissionText,
      rawPayload: item,
    };
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
