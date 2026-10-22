import type Big from 'big.js';

export const SERVICE_TYPES = ['package', 'lab_test', 'wellness', 'service', 'insurance'] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  package: 'Health package',
  lab_test: 'Lab test',
  wellness: 'Wellness',
  service: 'Medical service',
  insurance: 'Insurance',
};

export const CURRENCIES = ['THB', 'NPR', 'INR'] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface Subcategory {
  id: string;
  /** Unique within its parent only, e.g. "thyroid" exists under three categories. */
  slug: string;
  title: string;
  position: number;
}

export interface Category {
  id: string;
  /**
   * `${type}:${slug}`. Slugs are unique only within a type (two top-level
   * categories are both "ultrasound"), so the key is what the URL stores.
   */
  key: string;
  slug: string;
  type: ServiceType;
  title: string;
  /** Title plus the type when another category shares the title. */
  label: string;
  position: number;
  children: Subcategory[];
}

export interface Provider {
  id: number;
  name: string;
  currency: Currency;
  city: { slug: string; name: string };
  country: { code: string; name: string };
  /** null when the provider has no reviews yet. */
  rating: number | null;
  reviewCount: number;
}

/** One way to buy a service. Non-wellness services have exactly one. */
export interface PriceOption {
  /** Only set for wellness options. */
  durationMinutes: number | null;
  original: Big;
  final: Big;
  hasDiscount: boolean;
}

export type Pricing =
  | { kind: 'fixed'; option: PriceOption }
  /** Wellness: sorted by final price, lowest first. */
  | { kind: 'options'; options: PriceOption[] }
  /** The data cannot produce a trustworthy price (e.g. discount larger than the price). */
  | { kind: 'unavailable' };

export interface Service {
  id: string;
  title: string;
  type: ServiceType;
  providerId: number;
  currency: Currency;
  categoryKey: string | null;
  /** `${categoryKey}/${subSlug}` */
  subcategoryKey: string | null;
  pricing: Pricing;
  /** Final prices as numbers, for filtering and sorting only. Never displayed. */
  priceValues: number[];
  /** Lowest final price; null when unavailable. */
  sortPrice: number | null;
  testAtHome: boolean;
  homeTestCharge: Big | null;
  /** Lower-cased, accent-stripped fields for free-text search. */
  search: { title: string; provider: string; category: string; all: string };
}

export interface DataIssue {
  kind:
    | 'invalid-price'
    | 'title-cleaned'
    | 'hidden-service'
    | 'hidden-inactive-provider'
    | 'hidden-inactive-category'
    | 'unknown-reference'
    | 'provider-without-services'
    | 'unsupported-currency';
  id: string;
  detail: string;
}

export interface Catalog {
  categories: Category[];
  categoryByKey: Map<string, Category>;
  /** Only active providers that have at least one visible service. */
  providers: Provider[];
  providerById: Map<number, Provider>;
  /** Visible services only. */
  services: Service[];
  issues: DataIssue[];
}
