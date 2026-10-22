import { subcategoryKey } from './normalize';
import { matchesQuery, queryScore, tokenize } from './search';
import { CURRENCIES, type Catalog, type Currency, type Provider, type Service, type ServiceType } from './types';
import { applyChange, type FilterState } from './urlState';

export const PROVIDERS_PER_PAGE = 10;
export const SERVICES_PER_CARD = 3;

/**
 * Filter dimensions. Facet counts for a dimension ignore that dimension's own
 * selection but respect every other one.
 */
type Dimension = 'query' | 'type' | 'category' | 'provider' | 'location' | 'price' | 'home';

export interface FacetCounts {
  type: Map<ServiceType, number>;
  /** By category key. */
  category: Map<string, number>;
  /** By subcategory key (`categoryKey/subSlug`). */
  subcategory: Map<string, number>;
  provider: Map<number, number>;
  country: Map<string, number>;
  city: Map<string, number>;
  currency: Map<Currency, number>;
  /** Matching services available as a home test. */
  home: number;
}

export interface ProviderGroup {
  provider: Provider;
  /** All matching services of this provider, in display order. */
  services: Service[];
}

export interface Results {
  /** Matching services across all pages. */
  total: number;
  providerCount: number;
  /** The provider cards on the current page. */
  groups: ProviderGroup[];
  /** Requested page, clamped to the pages that exist. */
  page: number;
  totalPages: number;
  facets: FacetCounts;
  /** Set when sorting by price across currencies: groups are ordered by currency first. */
  currencyOrder: Currency[] | null;
}

interface Context {
  state: FilterState;
  tokens: string[];
  providerById: Map<number, Provider>;
  subKey: string | null;
}

const PREDICATES: Record<Dimension, (service: Service, ctx: Context) => boolean> = {
  query: (s, { tokens }) => tokens.length === 0 || matchesQuery(s, tokens),
  type: (s, { state }) => state.types.length === 0 || state.types.includes(s.type),
  category: (s, { state, subKey }) =>
    !state.category ||
    (s.categoryKey === state.category && (subKey === null || s.subcategoryKey === subKey)),
  provider: (s, { state }) => state.providers.length === 0 || state.providers.includes(s.providerId),
  location: (s, { state, providerById }) => {
    const location = state.location;
    if (!location) return true;
    const provider = providerById.get(s.providerId);
    if (!provider) return false;
    return location.kind === 'city'
      ? provider.city.slug === location.slug
      : provider.country.code === location.code;
  },
  // A currency on its own narrows to that currency; a range then applies to
  // final prices. Wellness matches when any duration option is in range, and
  // a service with no trustworthy price never matches a range.
  price: (s, { state }) => {
    if (!state.currency) return true;
    if (s.currency !== state.currency) return false;
    const { minPrice: min, maxPrice: max } = state;
    if (min === null && max === null) return true;
    return s.priceValues.some((value) => (min === null || value >= min) && (max === null || value <= max));
  },
  home: (s, { state }) => !state.home || s.testAtHome,
};
const DIMENSIONS = Object.keys(PREDICATES) as Dimension[];

function emptyFacets(): FacetCounts {
  return {
    type: new Map(),
    category: new Map(),
    subcategory: new Map(),
    provider: new Map(),
    country: new Map(),
    city: new Map(),
    currency: new Map(),
    home: 0,
  };
}

const bump = <K>(map: Map<K, number>, key: K) => map.set(key, (map.get(key) ?? 0) + 1);

function countFacet(facets: FacetCounts, dimension: Dimension, service: Service, ctx: Context): void {
  switch (dimension) {
    case 'type':
      bump(facets.type, service.type);
      break;
    case 'category':
      if (service.categoryKey) bump(facets.category, service.categoryKey);
      if (service.subcategoryKey) bump(facets.subcategory, service.subcategoryKey);
      break;
    case 'provider':
      bump(facets.provider, service.providerId);
      break;
    case 'location': {
      const provider = ctx.providerById.get(service.providerId);
      if (provider) {
        bump(facets.country, provider.country.code);
        bump(facets.city, provider.city.slug);
      }
      break;
    }
    case 'price':
      bump(facets.currency, service.currency);
      break;
    case 'home':
      if (service.testAtHome) facets.home += 1;
      break;
    case 'query':
      break;
  }
}

function makeContext(catalog: Catalog, state: FilterState): Context {
  return {
    state,
    tokens: tokenize(state.q),
    providerById: catalog.providerById,
    subKey: state.category && state.sub ? subcategoryKey(state.category, state.sub) : null,
  };
}

/**
 * One pass over the services. A service that passes every dimension is a
 * result and counts towards every facet. One that fails exactly one dimension
 * would become a result if that dimension changed, so it counts towards that
 * dimension's options only. Failing two or more, it counts nowhere.
 */
function matchAndCount(catalog: Catalog, ctx: Context) {
  const matched: Service[] = [];
  const facets = emptyFacets();
  for (const service of catalog.services) {
    let failures = 0;
    let failed: Dimension | null = null;
    for (const dimension of DIMENSIONS) {
      if (!PREDICATES[dimension](service, ctx)) {
        failures += 1;
        failed = dimension;
        if (failures > 1) break;
      }
    }
    if (failures === 0) {
      matched.push(service);
      for (const dimension of DIMENSIONS) countFacet(facets, dimension, service, ctx);
    } else if (failures === 1 && failed) {
      countFacet(facets, failed, service, ctx);
    }
  }
  return { matched, facets };
}

/** Count only, without facets or sorting. Used for "remove this filter" suggestions. */
export function countMatches(catalog: Catalog, state: FilterState): number {
  const ctx = makeContext(catalog, state);
  let count = 0;
  for (const service of catalog.services) {
    if (DIMENSIONS.every((dimension) => PREDICATES[dimension](service, ctx))) count += 1;
  }
  return count;
}

// --- Sorting --------------------------------------------------------------

/** Prior weight for the rating average, in reviews. */
const RATING_PRIOR_REVIEWS = 100;

/**
 * Rating adjusted for how many reviews back it (a Bayesian average): 4.8 from
 * 5 reviews ranks below 4.6 from 1,000. Unrated providers get the average,
 * neither promoted nor buried.
 */
function ratingScore(provider: Provider, meanRating: number): number {
  if (provider.rating === null) return meanRating;
  const n = provider.reviewCount;
  return (provider.rating * n + meanRating * RATING_PRIOR_REVIEWS) / (n + RATING_PRIOR_REVIEWS);
}

const byName = (a: ProviderGroup, b: ProviderGroup) => a.provider.name.localeCompare(b.provider.name);
const nullsLast = (a: number | null, b: number | null, direction: 1 | -1) => {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return (a - b) * direction;
};

function sortGroups(groups: ProviderGroup[], state: FilterState, tokens: string[], catalog: Catalog) {
  const scores = new Map<string, number>();
  if (tokens.length) for (const group of groups) for (const s of group.services) scores.set(s.id, queryScore(s, tokens));
  const score = (s: Service) => scores.get(s.id) ?? 0;

  const rated = catalog.providers.filter((p) => p.rating !== null);
  const meanRating = rated.reduce((sum, p) => sum + (p.rating ?? 0), 0) / Math.max(rated.length, 1);

  const byTitle = (a: Service, b: Service) => a.title.localeCompare(b.title);
  const priceDirection = state.sort === 'price_desc' ? -1 : 1;

  // Services inside each card
  for (const group of groups) {
    group.services.sort((a, b) => {
      if (state.sort === 'price_asc' || state.sort === 'price_desc') {
        return nullsLast(a.sortPrice, b.sortPrice, priceDirection) || byTitle(a, b);
      }
      return score(b) - score(a) || nullsLast(a.sortPrice, b.sortPrice, 1) || byTitle(a, b);
    });
  }

  // Cards. Prices in different currencies can't be compared, so price sorting
  // orders by currency first (most results first), then by price within it.
  let currencyOrder: Currency[] | null = null;
  if (state.sort === 'price_asc' || state.sort === 'price_desc') {
    const perCurrency = new Map<Currency, number>();
    for (const g of groups) perCurrency.set(g.provider.currency, (perCurrency.get(g.provider.currency) ?? 0) + g.services.length);
    currencyOrder = CURRENCIES.filter((c) => perCurrency.has(c)).sort(
      (a, b) => (perCurrency.get(b) ?? 0) - (perCurrency.get(a) ?? 0),
    );
    const rank = new Map(currencyOrder.map((c, i) => [c, i]));
    // Cheapest first uses each card's lowest price; most expensive first its highest.
    const pick = (g: ProviderGroup) => {
      const prices = g.services.map((s) => s.sortPrice).filter((p): p is number => p !== null);
      if (!prices.length) return null;
      return priceDirection === 1 ? Math.min(...prices) : Math.max(...prices);
    };
    groups.sort(
      (a, b) =>
        (rank.get(a.provider.currency) ?? 0) - (rank.get(b.provider.currency) ?? 0) ||
        nullsLast(pick(a), pick(b), priceDirection) ||
        byName(a, b),
    );
    if (currencyOrder.length < 2) currencyOrder = null;
  } else if (state.sort === 'rating') {
    groups.sort(
      (a, b) =>
        nullsLast(a.provider.rating, b.provider.rating, -1) ||
        b.provider.reviewCount - a.provider.reviewCount ||
        byName(a, b),
    );
  } else {
    const best = (g: ProviderGroup) => (g.services[0] ? score(g.services[0]) : 0);
    groups.sort(
      (a, b) =>
        best(b) - best(a) ||
        ratingScore(b.provider, meanRating) - ratingScore(a.provider, meanRating) ||
        byName(a, b),
    );
  }
  return currencyOrder;
}

// --- Entry point ------------------------------------------------------------

export function computeResults(catalog: Catalog, state: FilterState): Results {
  const ctx = makeContext(catalog, state);
  const { matched, facets } = matchAndCount(catalog, ctx);

  const byProvider = new Map<number, ProviderGroup>();
  for (const service of matched) {
    let group = byProvider.get(service.providerId);
    if (!group) {
      const provider = catalog.providerById.get(service.providerId);
      if (!provider) continue;
      group = { provider, services: [] };
      byProvider.set(service.providerId, group);
    }
    group.services.push(service);
  }
  const groups = [...byProvider.values()];
  const currencyOrder = sortGroups(groups, state, ctx.tokens, catalog);

  const totalPages = Math.max(1, Math.ceil(groups.length / PROVIDERS_PER_PAGE));
  const page = Math.min(Math.max(1, state.page), totalPages);
  return {
    total: matched.length,
    providerCount: groups.length,
    groups: groups.slice((page - 1) * PROVIDERS_PER_PAGE, page * PROVIDERS_PER_PAGE),
    page,
    totalPages,
    facets,
    currencyOrder,
  };
}

// --- Ways out of an empty result -------------------------------------------

export type RelaxationKey = 'q' | 'types' | 'category' | 'sub' | 'providers' | 'location' | 'price' | 'currency' | 'home';

export interface Relaxation {
  key: RelaxationKey;
  next: FilterState;
  count: number;
}

/** For each active filter: what removing just that filter would give. Most results first. */
export function suggestRelaxations(catalog: Catalog, state: FilterState): Relaxation[] {
  const candidates: [RelaxationKey, Partial<FilterState>][] = [];
  if (state.q.trim()) candidates.push(['q', { q: '' }]);
  if (state.types.length) candidates.push(['types', { types: [] }]);
  if (state.sub) candidates.push(['sub', { sub: null }]);
  if (state.category) candidates.push(['category', { category: null }]);
  if (state.providers.length) candidates.push(['providers', { providers: [] }]);
  if (state.location) candidates.push(['location', { location: null }]);
  if (state.minPrice !== null || state.maxPrice !== null) candidates.push(['price', { minPrice: null, maxPrice: null }]);
  if (state.currency) candidates.push(['currency', { currency: null }]);
  if (state.home) candidates.push(['home', { home: false }]);
  return candidates
    .map(([key, patch]) => {
      const next = applyChange(state, patch);
      return { key, next, count: countMatches(catalog, next) };
    })
    .filter((relaxation) => relaxation.count > 0)
    .sort((a, b) => b.count - a.count);
}
