/**
 * Google Places API Integration (New Version)
 *
 * Optimized version — changes from original:
 *  - Single-zone search (was 5-zone, 45 req/click → 6 req/click)
 *  - Category merges: corporate, transit, vibe merged into fewer calls
 *  - Field mask tiering: Basic SKU for non-rating categories (cheaper)
 *  - Two-tier cache (memory + localStorage) via placesCache.ts
 *  - In-flight request deduplication
 *  - Corporate blocklist: removes hotels/malls/banks from results
 *  - Removed 'bar' from vibe entertainment
 */

import {
    buildCacheKey,
    buildWardKey,
    getMemoryCache,
    setMemoryCache,
    getLocalStorageCache,
    setLocalStorageCache,
    deduplicatedFetch,
    AggregatedIntel,
} from './placesCache';

const GOOGLE_PLACES_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// ── Field Masks ───────────────────────────────────────────────────────────────
// Basic SKU: charged at lower rate — use for categories where rating/price
//            are not displayed (transit, apartments, vibe, corporates).
// Advanced SKU: use only for gyms and cafes (displayed in UI with ratings).
const BASIC_FIELD_MASK =
    'places.id,places.displayName,places.location,places.types,places.businessStatus';
const ADVANCED_FIELD_MASK =
    'places.id,places.displayName,places.location,places.rating,' +
    'places.userRatingCount,places.priceLevel,places.types,places.formattedAddress,places.businessStatus';

// ── Corporate blocklist ───────────────────────────────────────────────────────
// Post-fetch filter: removes places whose displayName matches any of these
// words — eliminates hotels, malls, hospitals etc. that register as corporate.
const CORPORATE_BLOCKLIST = [
    'hotel', 'mall', 'hospital', 'clinic', 'school', 'college', 'university',
    'bank', 'atm', 'temple', 'church', 'mosque', 'salon', 'spa', 'supermarket',
    'store', 'restaurant', 'cafe', 'pharmacy', 'medical', 'court', 'police',
    'government', 'municipality', 'apartment', 'residency', 'residences',
];

// ────────────────────────────────────────────────────────────────────────────

export interface PlaceResult {
    id: string;
    displayName: string;
    location: { lat: number; lng: number };
    rating?: number;
    userRatingCount?: number;
    priceLevel?: string;
    types: string[];
    formattedAddress?: string;
    businessStatus?: string;
}

/**
 * Nearby Search — single-zone, cached, deduplicated.
 *
 * @param primaryOnly  When true, uses includedPrimaryTypes (reduces false positives)
 * @param fieldMask    Override the default field mask (use BASIC or ADVANCED constant)
 */
export async function nearbySearch(
    lat: number,
    lng: number,
    radiusMeters: number,
    placeTypes: string[],
    primaryOnly = false,
    fieldMask: string = ADVANCED_FIELD_MASK
): Promise<PlaceResult[]> {
    const cacheKey = buildCacheKey(lat, lng, radiusMeters, placeTypes);

    // 1. Memory cache hit
    const memHit = getMemoryCache<PlaceResult[]>(cacheKey);
    if (memHit) return memHit;

    // 2. Fetch (with in-flight dedup)
    const result = await deduplicatedFetch(cacheKey, () =>
        fetchSingleZone(lat, lng, radiusMeters, placeTypes, primaryOnly, fieldMask)
    );

    // 3. Populate memory cache
    setMemoryCache(cacheKey, result);

    console.log(`🌐 Places API fetch: ${result.length} results for [${placeTypes.join(', ')}]`);
    return result;
}

/** Single HTTP request to Places API searchNearby */
async function fetchSingleZone(
    lat: number,
    lng: number,
    radiusMeters: number,
    placeTypes: string[],
    primaryOnly: boolean,
    fieldMask: string
): Promise<PlaceResult[]> {
    const url = 'https://places.googleapis.com/v1/places:searchNearby';

    const typeKey = primaryOnly ? 'includedPrimaryTypes' : 'includedTypes';
    const body = {
        [typeKey]: placeTypes,
        locationRestriction: {
            circle: {
                center: { latitude: lat, longitude: lng },
                radius: radiusMeters,
            },
        },
        maxResultCount: 20,
        rankPreference: 'DISTANCE',
    };

    const headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY || '',
        'X-Goog-FieldMask': fieldMask,
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Places API error: ${response.status}`, errorText);
            console.error(`API Key configured:`, GOOGLE_PLACES_API_KEY ? 'YES' : 'NO (MISSING!)');
            return [];
        }

        const data = await response.json();
        return (data.places || []).map(mapPlace);
    } catch (error) {
        console.error('❌ nearbySearch fetch failed:', error);
        return [];
    }
}

function mapPlace(place: any): PlaceResult {
    return {
        id: place.id,
        displayName: place.displayName?.text || 'Unknown',
        location: {
            lat: place.location?.latitude || 0,
            lng: place.location?.longitude || 0,
        },
        rating: place.rating,
        userRatingCount: place.userRatingCount,
        priceLevel: place.priceLevel,
        types: place.types || [],
        formattedAddress: place.formattedAddress,
        businessStatus: place.businessStatus,
    };
}

/**
 * Text Search — search places by natural language query.
 */
export async function textSearch(
    textQuery: string,
    lat?: number,
    lng?: number
): Promise<PlaceResult[]> {
    const url = 'https://places.googleapis.com/v1/places:searchText';

    const headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY || '',
        'X-Goog-FieldMask': ADVANCED_FIELD_MASK,
    };

    const body: any = { textQuery, maxResultCount: 20 };

    if (lat && lng) {
        body.locationBias = {
            circle: { center: { latitude: lat, longitude: lng }, radius: 2000 },
        };
    }

    try {
        const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!response.ok) throw new Error(`Text search error: ${response.status}`);
        const data = await response.json();
        return (data.places || []).map(mapPlace);
    } catch (error) {
        console.error('Text search failed:', error);
        return [];
    }
}

// ── Location Intelligence ─────────────────────────────────────────────────────

export interface LocationIntelligence {
    gyms: {
        total: number;
        highRated: number;
        averageRating: number;
        premiumCount: number;
        budgetCount: number;
        places: PlaceResult[];
    };
    corporateOffices: { total: number; places: PlaceResult[] };
    cafesRestaurants: { total: number; healthFocused: number; places: PlaceResult[] };
    transitStations: { total: number; places: PlaceResult[] };
    apartments: { total: number; places: PlaceResult[] };
    vibe: {
        total: number;
        active: number;
        entertainment: number;
        places: PlaceResult[];
    };
    competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
    marketGap: 'SATURATED' | 'COMPETITIVE' | 'OPPORTUNITY' | 'UNTAPPED';
}

/**
 * Get comprehensive location intelligence.
 *
 * Optimized: 6 parallel requests (was 45).
 *   1. gyms                          (Advanced SKU — ratings shown in UI)
 *   2. corporate_office + coworking  (Basic SKU — counts only)
 *   3. cafe + coffee_shop            (Advanced SKU — ratings shown in UI)
 *   4. all transit types merged      (Basic SKU — counts only)
 *   5. apartment_complex             (Basic SKU — counts only)
 *   6. all vibe types merged         (Basic SKU — counts only, post-filtered)
 */
export async function getLocationIntelligence(
    lat: number,
    lng: number,
    radiusMeters: number = 1000
): Promise<LocationIntelligence> {
    const wardKey = buildWardKey(lat, lng, radiusMeters);

    // ── localStorage cache check (aggregated intel survives page refresh) ──
    const lsHit = getLocalStorageCache(wardKey);
    // Note: lsHit only has counts — we still need to fetch full POI objects
    // for map markers (memory cache), so we only short-circuit scoring here,
    // not the full fetch. Full fetch uses memory cache for POI objects.

    console.log('🔍 getLocationIntelligence:', { lat, lng, radius: radiusMeters });

    // ── 6 parallel requests ───────────────────────────────────────────────
    const [
        gyms,
        corporatesRaw,
        cafes,
        transitAll,
        apartments,
        vibeAll,
    ] = await Promise.all([
        // 1. Gyms — Advanced SKU (ratings displayed)
        nearbySearch(lat, lng, radiusMeters, ['gym'], false, ADVANCED_FIELD_MASK),

        // 2. Corporate + Coworking merged — Basic SKU (counts only)
        nearbySearch(
            lat, lng, radiusMeters,
            ['corporate_office', 'coworking_space'],
            true,          // primaryOnly — reduces false positives
            BASIC_FIELD_MASK
        ),

        // 3. Cafes — Advanced SKU (ratings displayed)
        nearbySearch(lat, lng, radiusMeters, ['cafe', 'coffee_shop'], false, ADVANCED_FIELD_MASK),

        // 4. All transit merged — Basic SKU
        nearbySearch(
            lat, lng, radiusMeters,
            ['subway_station', 'light_rail_station', 'bus_station', 'bus_stop', 'transit_station'],
            false,
            BASIC_FIELD_MASK
        ),

        // 5. Apartments — Basic SKU
        nearbySearch(lat, lng, radiusMeters, ['apartment_complex'], false, BASIC_FIELD_MASK),

        // 6. Vibe: active + entertainment merged — Basic SKU
        //    'bar' intentionally excluded (inflates scores incorrectly)
        nearbySearch(
            lat, lng, radiusMeters,
            ['yoga_studio', 'sports_complex', 'movie_theater', 'night_club'],
            false,
            BASIC_FIELD_MASK
        ),
    ]);

    // ── Post-process corporate: apply blocklist ───────────────────────────
    const corporates = corporatesRaw.filter(p =>
        !CORPORATE_BLOCKLIST.some(word =>
            p.displayName.toLowerCase().includes(word)
        )
    );
    console.log(`  🏢 Corporates: ${corporatesRaw.length} raw → ${corporates.length} after blocklist`);

    // ── Post-process transit: split metro vs bus for weighted scoring ─────
    const METRO_TYPES = ['subway_station', 'light_rail_station'];
    const metroTransit = transitAll.filter(p =>
        p.types.some(t => METRO_TYPES.includes(t))
    );
    const busTransit = transitAll.filter(p =>
        !p.types.some(t => METRO_TYPES.includes(t))
    );
    console.log(`  🚇 Metro: ${metroTransit.length} | 🚌 Bus: ${busTransit.length} | Total: ${transitAll.length}`);

    // ── Post-process vibe: split active vs entertainment ──────────────────
    const ACTIVE_TYPES = ['yoga_studio', 'sports_complex'];
    const vibeActive = vibeAll.filter(p =>
        p.types.some(t => ACTIVE_TYPES.includes(t))
    );
    const vibeEntertainment = vibeAll.filter(p =>
        !p.types.some(t => ACTIVE_TYPES.includes(t))
    );

    console.log('✅ POI DETECTION RESULTS:');
    console.log(`  🏋️ Gyms: ${gyms.length}`);
    console.log(`  🏢 Corporates: ${corporates.length}`);
    console.log(`  ☕ Cafes: ${cafes.length}`);
    console.log(`  🚦 Transit: ${transitAll.length}`);
    console.log(`  🏘️ Apartments: ${apartments.length}`);
    console.log(`  🎭 Vibe Active: ${vibeActive.length} | Entertainment: ${vibeEntertainment.length}`);

    if (corporates.length === 0) console.warn('⚠️ NO CORPORATES FOUND');
    if (apartments.length === 0) console.warn('⚠️ NO APARTMENTS FOUND');

    // ── Gym analysis ──────────────────────────────────────────────────────
    const highRatedGyms = gyms.filter(g => g.rating && g.rating >= 4.0);
    const premiumGyms = gyms.filter(g =>
        g.priceLevel === 'PRICE_LEVEL_EXPENSIVE' || g.priceLevel === 'PRICE_LEVEL_VERY_EXPENSIVE'
    );
    const budgetGyms = gyms.filter(g =>
        g.priceLevel === 'PRICE_LEVEL_INEXPENSIVE' || g.priceLevel === 'PRICE_LEVEL_FREE'
    );
    const gymRatings = gyms.filter(g => g.rating).map(g => g.rating!);
    const averageGymRating = gymRatings.length > 0
        ? gymRatings.reduce((s, r) => s + r, 0) / gymRatings.length : 0;

    // ── Competition & market gap ──────────────────────────────────────────
    let competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
    if (gyms.length <= 3) competitionLevel = 'LOW';
    else if (gyms.length <= 6) competitionLevel = 'MEDIUM';
    else if (gyms.length <= 10) competitionLevel = 'HIGH';
    else competitionLevel = 'VERY_HIGH';

    const demandUnits = corporates.length + (apartments.length * 0.8);
    const ratio = gyms.length > 0 ? demandUnits / gyms.length : demandUnits;
    let marketGap: 'SATURATED' | 'COMPETITIVE' | 'OPPORTUNITY' | 'UNTAPPED';
    if (gyms.length === 0) marketGap = 'UNTAPPED';
    else if (ratio > 4) marketGap = 'OPPORTUNITY';
    else if (ratio > 2) marketGap = 'COMPETITIVE';
    else marketGap = 'SATURATED';

    const healthFocusedCafes = cafes.filter(c =>
        c.rating && c.rating >= 4.0 &&
        (c.displayName.toLowerCase().includes('health') ||
            c.displayName.toLowerCase().includes('juice') ||
            c.displayName.toLowerCase().includes('salad'))
    );

    // ── Persist aggregated intel to localStorage ──────────────────────────
    const intel: LocationIntelligence = {
        gyms: {
            total: gyms.length,
            highRated: highRatedGyms.length,
            averageRating: parseFloat(averageGymRating.toFixed(1)),
            premiumCount: premiumGyms.length,
            budgetCount: budgetGyms.length,
            places: gyms,
        },
        corporateOffices: { total: corporates.length, places: corporates },
        cafesRestaurants: { total: cafes.length, healthFocused: healthFocusedCafes.length, places: cafes },
        transitStations: { total: transitAll.length, places: transitAll },
        apartments: { total: apartments.length, places: apartments },
        vibe: {
            total: vibeAll.length,
            active: vibeActive.length,
            entertainment: vibeEntertainment.length,
            places: vibeAll,
        },
        competitionLevel,
        marketGap,
    };

    // Write aggregated counts to localStorage (tiny payload, survives refresh)
    const aggregated: AggregatedIntel = {
        gyms: gyms.length,
        corporates: corporates.length,
        cafes: cafes.length,
        transit: transitAll.length,
        apartments: apartments.length,
        vibeActive: vibeActive.length,
        vibeEntertainment: vibeEntertainment.length,
        competitionLevel,
        marketGap,
    };
    setLocalStorageCache(wardKey, aggregated);

    return intel;
}

/**
 * Generate strategic recommendation based on pure data (no AI needed).
 */
export function generateDataDrivenRecommendation(
    intel: LocationIntelligence,
    scores?: { demographicLoad: number; competitorRatio: number; infrastructure: number; connectivity: number; total: number }
): string {
    const { gyms, corporateOffices, cafesRestaurants, transitStations, apartments } = intel;
    const gap = scores?.competitorRatio ?? 0;
    const demand = scores?.demographicLoad ?? 0;
    const vibe = scores?.infrastructure ?? 0;
    const conn = scores?.connectivity ?? 0;

    let rec = `GEO-GROUNDED STRATEGY\n\n`;

    if (apartments.total > 0)
        rec += `✅ Residential Density: ${apartments.total} apartment complexes nearby\n`;
    if (cafesRestaurants.total > 0)
        rec += `✅ Lifestyle Synergy: ${cafesRestaurants.total} cafes (${cafesRestaurants.healthFocused} health-focused)\n`;
    if (transitStations.total > 0)
        rec += `✅ Transit Access: ${transitStations.total} metro/transit stations\n`;
    if (corporateOffices.total > 0)
        rec += `✅ Office Proximity: ${corporateOffices.total} corporate/coworking offices\n`;

    rec += `\nSTRATEGIC RECOMMENDATION\n\n`;

    if (gap >= 75) {
        rec += `🎯 GOLD MINE — Gap Index ${gap}/100. Strong demand, low competition.\n`;
        rec += `- Demand score ${demand}/100 backed by ${apartments.total} apt complexes + ${cafesRestaurants.total} cafes\n`;
        rec += gyms.total === 0
            ? `- No direct competitors detected — first-mover advantage\n`
            : `- Only ${gyms.total} gym(s) serving this demand pool\n`;
    } else if (gap >= 55) {
        rec += `🟢 HIGH POTENTIAL — Gap Index ${gap}/100. Room to capture market.\n`;
        rec += `- Demand score ${demand}/100 — ${apartments.total} residential complexes as primary catchment\n`;
        if (gyms.premiumCount > gyms.budgetCount) {
            rec += `- ${gyms.premiumCount} premium gyms dominate → budget tier (₹800-1200/month) is underserved\n`;
        } else {
            rec += `- ${gyms.budgetCount} budget gyms dominate → premium segment (₹1500-2500/month) has headroom\n`;
        }
    } else if (gap >= 35) {
        rec += `🟡 COMPETITIVE — Gap Index ${gap}/100. Differentiation required.\n`;
        rec += `- ${gyms.total} gyms already serving this area\n`;
        rec += `- Vibe score ${vibe}/100 — ${vibe > 50 ? 'strong youth culture → niche positioning works' : 'moderate lifestyle signals → community-first strategy'}\n`;
        rec += `- Consider: 24/7 access, women-only, CrossFit, or Pilates studio model\n`;
    } else {
        rec += `🔴 SATURATED — Gap Index ${gap}/100. High risk.\n`;
        rec += `- ${gyms.total} gyms competing for ${apartments.total} apt complexes — market is crowded\n`;
        rec += `- Consider a site 500m+ away, or a highly differentiated concept\n`;
    }

    if (conn > 50) rec += `\n⚡ Connectivity ${conn}/100 — good transit access supports walk-in traffic\n`;
    else if (conn > 20) rec += `\n🚌 Connectivity ${conn}/100 — moderate access, parking availability matters\n`;

    rec += `\nPEAK HOUR FIT\n`;
    if (apartments.total > 10)
        rec += `- Morning (6-9 AM) & Evening (6-9 PM) — residential catchment drives utilization\n`;
    if (corporateOffices.total > 5)
        rec += `- Lunch slots viable — ${corporateOffices.total} offices within radius\n`;

    return rec;
}

// ── Aggregate API (wrapper — simulates aggregate via nearbySearch) ─────────────

export interface AggregateFilter {
    minRating?: number;
    maxRating?: number;
    priceLevel?: string;
    openNow?: boolean;
    minUserRatingCount?: number;
}

export interface AggregateResult {
    count: number;
    placeIds?: string[];
    averageRating?: number;
    priceLevelDistribution?: Record<string, number>;
}

export async function getAggregateData(
    lat: number,
    lng: number,
    radiusMeters: number,
    placeTypes: string[],
    filters?: AggregateFilter,
    returnPlaceIds: boolean = false
): Promise<AggregateResult> {
    const places = await nearbySearch(lat, lng, radiusMeters, placeTypes);

    let filteredPlaces = places;
    if (filters) {
        filteredPlaces = places.filter(place => {
            if (filters.minRating && (!place.rating || place.rating < filters.minRating)) return false;
            if (filters.maxRating && (!place.rating || place.rating > filters.maxRating)) return false;
            if (filters.priceLevel && place.priceLevel !== filters.priceLevel) return false;
            if (filters.minUserRatingCount && (!place.userRatingCount || place.userRatingCount < filters.minUserRatingCount)) return false;
            if (filters.openNow) return place.businessStatus === 'OPERATIONAL';
            return true;
        });
    }

    const count = filteredPlaces.length;
    const ratings = filteredPlaces.filter(p => p.rating).map(p => p.rating!);
    const averageRating = ratings.length > 0
        ? ratings.reduce((s, r) => s + r, 0) / ratings.length : undefined;

    const priceLevelDistribution: Record<string, number> = {};
    filteredPlaces.forEach(place => {
        if (place.priceLevel) {
            priceLevelDistribution[place.priceLevel] = (priceLevelDistribution[place.priceLevel] || 0) + 1;
        }
    });

    return {
        count,
        placeIds: returnPlaceIds ? filteredPlaces.map(p => p.id) : undefined,
        averageRating,
        priceLevelDistribution,
    };
}

// ============================================================
// DOMAIN-AWARE INTELLIGENCE (Multi-Domain)
// ============================================================

export interface DomainLocationIntelligence {
    competitors: {
        total: number;
        highRated: number;
        averageRating: number;
        places: PlaceResult[];
    };
    corporateOffices: { total: number; places: PlaceResult[] };
    apartments: { total: number; places: PlaceResult[] };
    infraSynergy: { total: number; places: PlaceResult[] };
    transitStations: { total: number; places: PlaceResult[] };
    competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
    marketGap: 'SATURATED' | 'COMPETITIVE' | 'OPPORTUNITY' | 'UNTAPPED';
}

/**
 * Generic location intelligence that works for any domain.
 * Pass the domain's competitorTypes and infraTypes from DOMAIN_CONFIG.
 */
export async function getDomainIntelligence(
    lat: number,
    lng: number,
    radiusMeters: number,
    competitorTypes: string[],
    infraTypes: string[]
): Promise<DomainLocationIntelligence> {
    const [competitors, establishments, infra, transit, lodging] = await Promise.all([
        nearbySearch(lat, lng, radiusMeters, competitorTypes),
        nearbySearch(lat, lng, radiusMeters, ['establishment']),
        infraTypes.length > 0
            ? nearbySearch(lat, lng, radiusMeters, infraTypes)
            : Promise.resolve([] as PlaceResult[]),
        nearbySearch(lat, lng, radiusMeters, ['bus_station', 'light_rail_station', 'subway_station']),
        nearbySearch(lat, lng, radiusMeters, ['lodging']),
    ]);

    // Corporate filter
    const corporates = establishments.filter(p => {
        const name = p.displayName.toLowerCase();
        const types = p.types.map(t => t.toLowerCase());
        const isNonOffice = (
            types.includes('restaurant') || types.includes('cafe') || types.includes('food') ||
            types.includes('store') || types.includes('shopping') || types.includes('lodging') ||
            types.includes('hospital') || types.includes('school') ||
            name.includes('restaurant') || name.includes('hotel') || name.includes('cafe')
        );
        const isOffice = (
            types.includes('office') || types.includes('business') || types.includes('professional_services') ||
            name.includes('tech') || name.includes('software') || name.includes('corporate') ||
            name.includes('pvt') || name.includes('ltd') || name.includes('inc') ||
            name.includes('solutions') || name.includes('systems') || name.includes('services') || name.includes('consulting')
        );
        return isOffice || (!isNonOffice && establishments.length > 50);
    });

    // Apartment filter
    const apartments = lodging.filter(p => {
        const name = p.displayName.toLowerCase();
        return (
            name.includes('apartment') || name.includes('residency') || name.includes('residence') ||
            name.includes('homes') || name.includes('enclave') || name.includes('tower') ||
            name.includes('villa') || name.includes('flats') || name.includes('heights') ||
            name.includes('gardens') || name.includes('park') ||
            (!name.includes('hotel') && !name.includes('guest') && lodging.length < 20)
        );
    });

    const highRated = competitors.filter(p => p.rating && p.rating >= 4.0);
    const ratings = competitors.filter(p => p.rating).map(p => p.rating!);
    const averageRating = ratings.length > 0
        ? ratings.reduce((s, r) => s + r, 0) / ratings.length : 0;

    let competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
    if (competitors.length <= 3) competitionLevel = 'LOW';
    else if (competitors.length <= 8) competitionLevel = 'MEDIUM';
    else if (competitors.length <= 15) competitionLevel = 'HIGH';
    else competitionLevel = 'VERY_HIGH';

    const fullDemandScore =
        corporates.length +
        (apartments.length * 0.7) +
        (transit.length * 0.8) +
        (infra.length * 0.5);

    const estimatedCapacity = Math.max(5, fullDemandScore * 1.5);
    const saturationRatio = competitors.length / estimatedCapacity;

    let marketGap: 'SATURATED' | 'COMPETITIVE' | 'OPPORTUNITY' | 'UNTAPPED';
    if (competitors.length === 0) marketGap = 'UNTAPPED';
    else if (saturationRatio < 0.25) marketGap = 'OPPORTUNITY';
    else if (saturationRatio < 0.6) marketGap = 'COMPETITIVE';
    else marketGap = 'SATURATED';

    return {
        competitors: {
            total: competitors.length,
            highRated: highRated.length,
            averageRating: parseFloat(averageRating.toFixed(1)),
            places: competitors,
        },
        corporateOffices: { total: corporates.length, places: corporates },
        apartments: { total: apartments.length, places: apartments },
        infraSynergy: { total: infra.length, places: infra },
        transitStations: { total: transit.length, places: transit },
        competitionLevel,
        marketGap,
    };
}

export function generateDomainRecommendation(
    intel: DomainLocationIntelligence,
    competitorLabel: string
): string {
    const { competitors, corporateOffices, infraSynergy, transitStations, marketGap, competitionLevel } = intel;

    let rec = `MARKET ASSESSMENT\n\n`;
    rec += `Competition Level: ${competitionLevel}\n`;
    rec += `Market Opportunity: ${marketGap}\n\n`;
    rec += `Found ${competitors.total} existing ${competitorLabel.toLowerCase()}`;
    if (competitors.highRated > 0) {
        const pct = Math.round((competitors.highRated / competitors.total) * 100);
        rec += ` (${competitors.highRated} rated 4+★ = ${pct}% strong, avg: ${competitors.averageRating}★)`;
        if (pct > 50) rec += `\n⚠️ Majority are well-rated — quality differentiation is critical.`;
        else rec += `\n✅ Many competitors are weak-rated — quality entry has clear advantage.`;
    } else if (competitors.total > 0) {
        rec += ` — no highly-rated competitors, quality entry has strong advantage`;
    }
    rec += `\n\n`;

    rec += `DEMAND DRIVERS\n\n`;
    rec += `✅ Corporate Offices: ${corporateOffices.total}\n`;
    rec += `✅ Residential Density: ${intel.apartments.total} apartment complexes\n`;
    rec += `✅ Infra / Synergy: ${infraSynergy.total} nearby places\n`;
    rec += `✅ Transit Access: ${transitStations.total} stations\n\n`;

    rec += `STRATEGIC RECOMMENDATION\n\n`;
    if (marketGap === 'UNTAPPED') {
        rec += `🎯 FIRST-MOVER ADVANTAGE — No ${competitorLabel.toLowerCase()} detected!\n`;
        rec += `- Strong demand: ${corporateOffices.total} offices & ${intel.apartments.total} residential\n`;
        rec += `- Establish brand presence aggressively\n`;
    } else if (marketGap === 'OPPORTUNITY') {
        rec += `🟢 HIGH POTENTIAL — Good demand-to-supply ratio.\n`;
        rec += `- ${corporateOffices.total} corporates + ${intel.apartments.total} residential = strong base\n`;
        rec += `- Differentiated positioning recommended\n`;
    } else if (marketGap === 'COMPETITIVE') {
        rec += `🟡 DIFFERENTIATION REQUIRED — Moderate competition.\n`;
        rec += `- ${competitors.total} existing ${competitorLabel.toLowerCase()} in radius\n`;
        rec += `- Niche strategy or unique offering needed\n`;
    } else {
        rec += `🔴 SATURATED MARKET — High competition.\n`;
        rec += `- ${competitors.total} ${competitorLabel.toLowerCase()} competing for same customers\n`;
        rec += `- Consider 500m+ relocation or strong differentiation\n`;
    }

    if (transitStations.total > 0) {
        rec += `\nTRANSIT ADVANTAGE\n\n- ${transitStations.total} station(s) nearby → high pedestrian footfall\n`;
    }

    return rec;
}
