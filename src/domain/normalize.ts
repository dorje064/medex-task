import type { ApiCategory, ApiProvider, ApiService } from '../api/types';
import { computePricing, parseMoney, pricingOptions } from './pricing';
import {
  CURRENCIES,
  SERVICE_TYPE_LABELS,
  SERVICE_TYPES,
  type Catalog,
  type Category,
  type Country,
  type Currency,
  type DataIssue,
  type Provider,
  type Service,
  type ServiceType,
} from './types';

/** Lower-case, strip accents and collapse whitespace, for matching only. */
export function toSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trims and collapses whitespace. Casing is left alone: "HbA1c" cannot be guessed safely. */
export function cleanTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export const categoryKey = (type: string, slug: string) => `${type}:${slug}`;
export const subcategoryKey = (parentKey: string, slug: string) => `${parentKey}/${slug}`;

const isServiceType = (value: string): value is ServiceType =>
  (SERVICE_TYPES as readonly string[]).includes(value);
const isCurrency = (value: string): value is Currency =>
  (CURRENCIES as readonly string[]).includes(value);

interface CategoryRef {
  key: string;
  title: string;
  active: boolean;
  subs: Map<string, { key: string; title: string; active: boolean }>;
}

/**
 * Maps the raw API collections into UI models and applies the visibility rule:
 * a service is shown only if its own status is true, its provider is "active",
 * and its category (if it has one) is active. Every rough edge we work around
 * is recorded in `issues` (see README, "Data decisions").
 */
export function normalizeCatalog(
  apiCategories: ApiCategory[],
  apiProviders: ApiProvider[],
  apiServices: ApiService[],
): Catalog {
  const issues: DataIssue[] = [];

  // Categories: keep every category for lookups, expose only active ones.
  const refs = new Map<string, CategoryRef>();
  const titleCounts = new Map<string, number>();
  for (const category of apiCategories) {
    if (category.status) titleCounts.set(category.title, (titleCounts.get(category.title) ?? 0) + 1);
  }
  const categories: Category[] = [];
  for (const category of [...apiCategories].sort((a, b) => a.position - b.position)) {
    const key = categoryKey(category.type, category.slug);
    const subs = new Map<string, { key: string; title: string; active: boolean }>();
    for (const child of category.children ?? []) {
      subs.set(child.id, {
        key: subcategoryKey(key, child.slug),
        title: child.title,
        active: child.status && category.status,
      });
    }
    refs.set(category.id, { key, title: category.title, active: category.status, subs });
    if (!category.status || !isServiceType(category.type)) continue;
    categories.push({
      id: category.id,
      key,
      slug: category.slug,
      type: category.type,
      title: category.title,
      label:
        (titleCounts.get(category.title) ?? 0) > 1
          ? `${category.title} (${SERVICE_TYPE_LABELS[category.type]})`
          : category.title,
      position: category.position,
      children: (category.children ?? [])
        .filter((child) => child.status)
        .sort((a, b) => a.position - b.position)
        .map((child) => ({ id: child.id, slug: child.slug, title: child.title, position: child.position })),
    });
  }

  // Providers
  const activeProviders = new Map<number, Provider>();
  for (const raw of apiProviders) {
    const info = raw.providerInformation;
    if (raw.status !== 'active') continue;
    if (!info || !isCurrency(info.currency)) {
      issues.push({
        kind: 'unsupported-currency',
        id: String(raw.id),
        detail: `${raw.name}: currency ${info?.currency ?? 'missing'}; provider hidden`,
      });
      continue;
    }
    activeProviders.set(raw.id, {
      id: raw.id,
      name: cleanTitle(info.companyName || raw.name),
      currency: info.currency,
      city: { slug: info.city.slug, name: info.city.name },
      country: { code: info.country.alphaCode, name: info.country.name },
      rating: typeof info.rating === 'number' && info.reviewCount > 0 ? info.rating : null,
      reviewCount: info.reviewCount ?? 0,
    });
  }
  const knownProviderIds = new Set(apiProviders.map((p) => p.id));

  // Services
  const services: Service[] = [];
  for (const raw of apiServices) {
    if (!raw.status) {
      issues.push({ kind: 'hidden-service', id: raw.id, detail: 'status is false' });
      continue;
    }
    const provider = activeProviders.get(raw.userId);
    if (!provider) {
      issues.push(
        knownProviderIds.has(raw.userId)
          ? { kind: 'hidden-inactive-provider', id: raw.id, detail: `provider ${raw.userId} is not active` }
          : { kind: 'unknown-reference', id: raw.id, detail: `unknown provider ${raw.userId}` },
      );
      continue;
    }
    const category = raw.categoryId ? refs.get(raw.categoryId) : undefined;
    if (raw.categoryId && !category) {
      issues.push({ kind: 'unknown-reference', id: raw.id, detail: `unknown category ${raw.categoryId}` });
      continue;
    }
    if (category && !category.active) {
      issues.push({ kind: 'hidden-inactive-category', id: raw.id, detail: `category ${category.key} is inactive` });
      continue;
    }
    const sub = raw.subCategoryId ? category?.subs.get(raw.subCategoryId) : undefined;
    if (raw.subCategoryId && !sub) {
      // Keep the service under its category rather than hiding it.
      issues.push({ kind: 'unknown-reference', id: raw.id, detail: `subcategory ${raw.subCategoryId} not under its category` });
    } else if (sub && !sub.active) {
      issues.push({ kind: 'hidden-inactive-category', id: raw.id, detail: `subcategory ${sub.key} is inactive` });
      continue;
    }
    if (!isServiceType(raw.type)) {
      issues.push({ kind: 'unknown-reference', id: raw.id, detail: `unknown type ${raw.type}` });
      continue;
    }

    const title = cleanTitle(raw.title);
    if (title !== raw.title) {
      issues.push({ kind: 'title-cleaned', id: raw.id, detail: JSON.stringify(raw.title) });
    }
    const pricing = computePricing(raw);
    if (pricing.kind === 'unavailable') {
      issues.push({ kind: 'invalid-price', id: raw.id, detail: `${title}: price cannot be computed` });
    }
    const priceValues = pricingOptions(pricing).map((option) => option.final.toNumber());

    const search = {
      title: toSearchText(title),
      provider: toSearchText(provider.name),
      category: toSearchText([category?.title, sub?.title].filter(Boolean).join(' ')),
    };
    services.push({
      id: raw.id,
      title,
      type: raw.type,
      providerId: provider.id,
      currency: provider.currency,
      categoryKey: category?.key ?? null,
      subcategoryKey: sub?.key ?? null,
      pricing,
      priceValues,
      sortPrice: priceValues.length > 0 ? Math.min(...priceValues) : null,
      testAtHome: raw.testAtHome === true,
      homeTestCharge: raw.testAtHome ? parseMoney(raw.homeTestCharge) : null,
      search: { ...search, all: `${search.title} ${search.provider} ${search.category}` },
    });
  }

  const providerIdsWithServices = new Set(services.map((s) => s.providerId));
  for (const provider of activeProviders.values()) {
    if (!providerIdsWithServices.has(provider.id)) {
      issues.push({ kind: 'provider-without-services', id: String(provider.id), detail: provider.name });
    }
  }
  const providers = [...activeProviders.values()]
    .filter((p) => providerIdsWithServices.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const countries = new Map<string, Country>();
  for (const provider of providers) {
    let country = countries.get(provider.country.code);
    if (!country) {
      country = { ...provider.country, cities: [] };
      countries.set(country.code, country);
    }
    if (!country.cities.some((city) => city.slug === provider.city.slug)) country.cities.push(provider.city);
  }
  const locations = [...countries.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const country of locations) country.cities.sort((a, b) => a.name.localeCompare(b.name));

  return {
    categories,
    categoryByKey: new Map(categories.map((c) => [c.key, c])),
    providers,
    providerById: new Map(providers.map((p) => [p.id, p])),
    locations,
    services,
    issues,
  };
}
