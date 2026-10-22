import { CURRENCIES, SERVICE_TYPES, type Currency, type ServiceType } from './types';

export const SORT_KEYS = ['relevance', 'price_asc', 'price_desc', 'rating'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export type LocationFilter = { kind: 'country'; code: string } | { kind: 'city'; slug: string };

/** Everything that defines the view. The URL is its only home. */
export interface FilterState {
  q: string;
  types: ServiceType[];
  /** Category key (`type:slug`). */
  category: string | null;
  /** Subcategory slug within `category`. */
  sub: string | null;
  providers: number[];
  location: LocationFilter | null;
  /** Price filtering only makes sense inside one currency, so min/max require it. */
  currency: Currency | null;
  minPrice: number | null;
  maxPrice: number | null;
  home: boolean;
  sort: SortKey;
  page: number;
}

export const DEFAULT_FILTERS: FilterState = {
  q: '',
  types: [],
  category: null,
  sub: null,
  providers: [],
  location: null,
  currency: null,
  minPrice: null,
  maxPrice: null,
  home: false,
  sort: 'relevance',
  page: 1,
};

const MAX_QUERY_LENGTH = 200;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CATEGORY_KEY = /^[a-z_]+:[a-z0-9]+(?:-[a-z0-9]+)*$/;

const list = (value: string | null) =>
  value ? value.split(',').map((part) => part.trim()).filter(Boolean) : [];

function amount(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** Reads the view from a query string. Anything invalid falls back to the default. */
export function parseFilters(search: string): FilterState {
  const params = new URLSearchParams(search);

  const types = SERVICE_TYPES.filter((type) => list(params.get('type')).includes(type));

  const categoryParam = params.get('category');
  const category = categoryParam && CATEGORY_KEY.test(categoryParam) ? categoryParam : null;
  const subParam = params.get('sub');
  const sub = category && subParam && SLUG.test(subParam) ? subParam : null;

  const providers = [
    ...new Set(list(params.get('provider')).map(Number).filter((id) => Number.isInteger(id) && id > 0)),
  ].sort((a, b) => a - b);

  const city = params.get('city');
  const country = params.get('country');
  const location: LocationFilter | null =
    city && SLUG.test(city)
      ? { kind: 'city', slug: city }
      : country && /^[A-Za-z]{2}$/.test(country)
        ? { kind: 'country', code: country.toUpperCase() }
        : null;

  const currencyParam = params.get('currency')?.toUpperCase();
  const currency = CURRENCIES.find((c) => c === currencyParam) ?? null;
  let minPrice = currency ? amount(params.get('min')) : null;
  let maxPrice = currency ? amount(params.get('max')) : null;
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }

  const sortParam = params.get('sort');
  const sort = SORT_KEYS.find((key) => key === sortParam) ?? 'relevance';

  const pageNumber = Number(params.get('page'));
  const page = Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1;

  return {
    q: (params.get('q') ?? '').slice(0, MAX_QUERY_LENGTH),
    types,
    category,
    sub,
    providers,
    location,
    currency,
    minPrice,
    maxPrice,
    home: params.get('home') === '1',
    sort,
    page,
  };
}

/** Canonical query string (fixed order, defaults omitted), so one view has one URL. */
export function serializeFilters(state: FilterState): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.types.length) params.set('type', SERVICE_TYPES.filter((t) => state.types.includes(t)).join(','));
  if (state.category) {
    params.set('category', state.category);
    if (state.sub) params.set('sub', state.sub);
  }
  if (state.providers.length) params.set('provider', [...state.providers].sort((a, b) => a - b).join(','));
  if (state.location?.kind === 'country') params.set('country', state.location.code);
  if (state.location?.kind === 'city') params.set('city', state.location.slug);
  if (state.currency) {
    params.set('currency', state.currency);
    if (state.minPrice !== null) params.set('min', String(state.minPrice));
    if (state.maxPrice !== null) params.set('max', String(state.maxPrice));
  }
  if (state.home) params.set('home', '1');
  if (state.sort !== 'relevance') params.set('sort', state.sort);
  if (state.page > 1) params.set('page', String(state.page));
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * Applies a change and keeps the state consistent: any change other than the
 * page goes back to page 1, a new category clears the subcategory, and
 * clearing the currency clears the price range.
 */
export function applyChange(state: FilterState, patch: Partial<FilterState>): FilterState {
  const next = { ...state, ...patch };
  if (!('page' in patch)) next.page = 1;
  if ('category' in patch && patch.category !== state.category && !('sub' in patch)) next.sub = null;
  if (!next.category) next.sub = null;
  if (!next.currency) {
    next.minPrice = null;
    next.maxPrice = null;
  }
  return next;
}

/** Number of active filters, for the mobile "Filters (n)" button. Sort and page don't count. */
export function countActiveFilters(state: FilterState): number {
  return (
    (state.q.trim() ? 1 : 0) +
    state.types.length +
    (state.category ? 1 : 0) +
    (state.sub ? 1 : 0) +
    state.providers.length +
    (state.location ? 1 : 0) +
    (state.currency ? 1 : 0) +
    (state.home ? 1 : 0)
  );
}

export function clearFilters(state: FilterState): FilterState {
  return { ...DEFAULT_FILTERS, sort: state.sort };
}
