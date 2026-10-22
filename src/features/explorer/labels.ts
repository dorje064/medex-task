import type { RelaxationKey } from '../../domain/results';
import { SERVICE_TYPE_LABELS, type Catalog } from '../../domain/types';
import { applyChange, type FilterState } from '../../domain/urlState';

export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString('en')} ${count === 1 ? one : many}`;

export const formatNumber = (value: number) => value.toLocaleString('en');

export function summaryText(total: number, providerCount: number): string {
  if (total === 0) return 'No services match your filters';
  return `${plural(total, 'service')} from ${plural(providerCount, 'provider')}`;
}

export function locationName(catalog: Catalog, location: FilterState['location']): string | null {
  if (!location) return null;
  for (const country of catalog.locations) {
    if (location.kind === 'country' && country.code === location.code) return country.name;
    const city = country.cities.find((c) => location.kind === 'city' && c.slug === location.slug);
    if (city) return `${city.name}, ${country.name}`;
  }
  return location.kind === 'city' ? location.slug : location.code;
}

export function priceRangeLabel(state: FilterState): string | null {
  const { currency, minPrice, maxPrice } = state;
  if (!currency || (minPrice === null && maxPrice === null)) return null;
  if (minPrice !== null && maxPrice !== null) return `${currency} ${formatNumber(minPrice)}–${formatNumber(maxPrice)}`;
  if (maxPrice !== null) return `Up to ${currency} ${formatNumber(maxPrice)}`;
  return `From ${currency} ${formatNumber(minPrice!)}`;
}

export interface ActiveFilter {
  id: string;
  label: string;
  /** The state with just this filter removed. */
  without: FilterState;
}

/** One removable chip per active selection. */
export function activeFilters(catalog: Catalog, state: FilterState): ActiveFilter[] {
  const chips: ActiveFilter[] = [];
  const remove = (patch: Partial<FilterState>) => applyChange(state, patch);
  if (state.q.trim()) chips.push({ id: 'q', label: `Search: “${state.q.trim()}”`, without: remove({ q: '' }) });
  for (const type of state.types) {
    chips.push({
      id: `type-${type}`,
      label: SERVICE_TYPE_LABELS[type],
      without: remove({ types: state.types.filter((t) => t !== type) }),
    });
  }
  if (state.category) {
    const category = catalog.categoryByKey.get(state.category);
    chips.push({ id: 'category', label: category?.label ?? 'Unknown category', without: remove({ category: null }) });
    if (state.sub) {
      const sub = category?.children.find((c) => c.slug === state.sub);
      chips.push({ id: 'sub', label: sub?.title ?? 'Unknown subcategory', without: remove({ sub: null }) });
    }
  }
  for (const id of state.providers) {
    chips.push({
      id: `provider-${id}`,
      label: catalog.providerById.get(id)?.name ?? `Provider #${id} (unavailable)`,
      without: remove({ providers: state.providers.filter((p) => p !== id) }),
    });
  }
  const place = locationName(catalog, state.location);
  if (place) chips.push({ id: 'location', label: place, without: remove({ location: null }) });
  if (state.currency) {
    chips.push({
      id: 'price',
      label: priceRangeLabel(state) ?? `Prices in ${state.currency}`,
      without: remove({ currency: null }),
    });
  }
  if (state.home) chips.push({ id: 'home', label: 'Home test', without: remove({ home: false }) });
  return chips;
}

export function relaxationLabel(key: RelaxationKey, state: FilterState): string {
  switch (key) {
    case 'q':
      return `Remove the search “${state.q.trim()}”`;
    case 'types':
      return 'Remove the service type filter';
    case 'category':
      return 'Remove the category filter';
    case 'sub':
      return 'Remove the subcategory filter';
    case 'providers':
      return 'Remove the provider filter';
    case 'location':
      return 'Remove the location filter';
    case 'price':
      return 'Remove the price range';
    case 'currency':
      return `Show all currencies, not just ${state.currency}`;
    case 'home':
      return 'Include services not available as a home test';
  }
}
