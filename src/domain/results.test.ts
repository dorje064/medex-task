import { catalog } from '../test/fixture';
import { pricingOptions } from './pricing';
import { computeResults, countMatches, PROVIDERS_PER_PAGE, suggestRelaxations } from './results';
import { SERVICE_TYPES, type Service } from './types';
import { DEFAULT_FILTERS, type FilterState } from './urlState';

const state = (patch: Partial<FilterState>): FilterState => ({ ...DEFAULT_FILTERS, ...patch });
const matchedServices = (s: FilterState): Service[] => {
  const all = computeResults(catalog, { ...s, page: 1 });
  const pages = all.totalPages;
  const out: Service[] = [];
  for (let page = 1; page <= pages; page++) {
    for (const group of computeResults(catalog, { ...s, page }).groups) out.push(...group.services);
  }
  return out;
};

/** Small deterministic PRNG so the generated states are the same on every run. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

function randomState(random: () => number): FilterState {
  const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  const category = random() < 0.4 ? pick(catalog.categories) : null;
  const currency = random() < 0.3 ? pick(['THB', 'NPR', 'INR'] as const) : null;
  return state({
    q: random() < 0.2 ? pick(['test', 'thai', 'hospital', 'blood panel', 'scan']) : '',
    types: SERVICE_TYPES.filter(() => random() < 0.25),
    category: category?.key ?? null,
    sub: category && category.children.length && random() < 0.5 ? pick(category.children).slug : null,
    providers: random() < 0.25 ? [pick(catalog.providers).id, pick(catalog.providers).id] : [],
    location:
      random() < 0.4
        ? random() < 0.5
          ? { kind: 'city', slug: pick(catalog.providers).city.slug }
          : { kind: 'country', code: pick(['TH', 'NP', 'IN']) }
        : null,
    currency,
    maxPrice: currency && random() < 0.6 ? Math.round(random() * 8000) : null,
    home: random() < 0.2,
  });
}

describe('facet counts', () => {
  // For every option, the count must equal the number of results you'd get by
  // making that option the only selection in its own filter, with every other
  // filter left as it is. Checked by brute force over many combined states.
  it('match a brute-force recount for every option across 40 combined filter states', () => {
    const random = rng(42);
    for (let i = 0; i < 40; i++) {
      const s = randomState(random);
      const { facets } = computeResults(catalog, s);
      const expectSame = (actual: number | undefined, alternative: Partial<FilterState>, label: string) => {
        const expected = countMatches(catalog, { ...s, ...alternative });
        expect({ label, state: s, count: actual ?? 0 }).toEqual({ label, state: s, count: expected });
      };
      for (const type of SERVICE_TYPES) expectSame(facets.type.get(type), { types: [type] }, `type ${type}`);
      for (const category of catalog.categories) {
        expectSame(facets.category.get(category.key), { category: category.key, sub: null }, category.key);
        for (const sub of category.children) {
          expectSame(facets.subcategory.get(`${category.key}/${sub.slug}`), { category: category.key, sub: sub.slug }, sub.slug);
        }
      }
      for (const provider of catalog.providers.slice(0, 20)) {
        expectSame(facets.provider.get(provider.id), { providers: [provider.id] }, `provider ${provider.id}`);
      }
      for (const code of ['TH', 'NP', 'IN']) expectSame(facets.country.get(code), { location: { kind: 'country', code } }, code);
      for (const slug of ['bangkok', 'kathmandu', 'gurugram']) expectSame(facets.city.get(slug), { location: { kind: 'city', slug } }, slug);
      for (const currency of ['THB', 'NPR', 'INR'] as const) {
        expectSame(facets.currency.get(currency), { currency, minPrice: null, maxPrice: null }, currency);
      }
      expectSame(facets.home, { home: true }, 'home');
    }
  });

  it('answer the brief’s example: with Bangkok selected, "Lab test" counts lab tests in Bangkok', () => {
    const { facets } = computeResults(catalog, state({ location: { kind: 'city', slug: 'bangkok' } }));
    const expected = catalog.services.filter(
      (s) => s.type === 'lab_test' && catalog.providerById.get(s.providerId)!.city.slug === 'bangkok',
    ).length;
    expect(facets.type.get('lab_test')).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('do not count the selected options of a facet against each other (OR within a facet)', () => {
    const { facets, total } = computeResults(catalog, state({ types: ['package', 'lab_test'] }));
    expect((facets.type.get('package') ?? 0) + (facets.type.get('lab_test') ?? 0)).toBe(total);
    expect(facets.type.get('wellness')).toBeGreaterThan(0);
  });

  it('leave out options that would give no results', () => {
    const { facets } = computeResults(catalog, state({ location: { kind: 'country', code: 'NP' } }));
    for (const [code] of facets.currency) expect(code).toBe('NPR');
  });
});

describe('the two "ultrasound" categories', () => {
  it('are counted and filtered separately', () => {
    const { facets } = computeResults(catalog, DEFAULT_FILTERS);
    // Visible services only (raw data has 149 and 256).
    expect(facets.category.get('package:ultrasound')).toBe(135);
    expect(facets.category.get('lab_test:ultrasound')).toBe(229);
    const lab = matchedServices(state({ category: 'lab_test:ultrasound' }));
    expect(lab.every((s) => s.type === 'lab_test' && s.categoryKey === 'lab_test:ultrasound')).toBe(true);
  });

  it('keep their "thyroid" subcategories apart (and apart from Blood Tests › Thyroid)', () => {
    const thyroid = matchedServices(state({ category: 'lab_test:ultrasound', sub: 'thyroid' }));
    expect(thyroid.length).toBeGreaterThan(0);
    expect(thyroid.every((s) => s.subcategoryKey === 'lab_test:ultrasound/thyroid')).toBe(true);
  });
});

describe('price filter', () => {
  it('narrows to one currency and never mixes others in', () => {
    const results = matchedServices(state({ currency: 'NPR' }));
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((s) => s.currency === 'NPR')).toBe(true);
  });

  it('compares final prices, and matches wellness when any option is in range', () => {
    const results = matchedServices(state({ currency: 'THB', minPrice: 1000, maxPrice: 2000 }));
    for (const s of results) {
      expect(pricingOptions(s.pricing).some((o) => o.final.gte(1000) && o.final.lte(2000))).toBe(true);
    }
    expect(results.some((s) => s.type === 'wellness')).toBe(true);
  });

  it('keeps an unpriceable service visible, but out of any price range', () => {
    const vitaminD = '5f0c1a52-6b1e-4c1f-9a51-000000000005';
    expect(matchedServices(state({ currency: 'THB' })).some((s) => s.id === vitaminD)).toBe(true);
    expect(matchedServices(state({ currency: 'THB', maxPrice: 100000 })).some((s) => s.id === vitaminD)).toBe(false);
  });

  it('treats free services as priced at zero', () => {
    const free = matchedServices(state({ currency: 'THB', maxPrice: 0 }));
    expect(free.map((s) => s.title)).toContain('Free Dental Consultation');
  });
});

describe('the customer story', () => {
  it('finds check-ups in Bangkok under 5,000 THB, grouped by hospital', () => {
    const s = state({
      category: 'package:health-check-up',
      location: { kind: 'city', slug: 'bangkok' },
      currency: 'THB',
      maxPrice: 5000,
    });
    const results = computeResults(catalog, s);
    // Only Riverside has check-ups under 5,000 THB; Kailash's start above it.
    expect(results.total).toBe(4);
    expect(results.providerCount).toBe(1);
    const withoutLimit = computeResults(catalog, { ...s, maxPrice: null });
    expect(withoutLimit.providerCount).toBe(2);
    for (const group of results.groups) {
      expect(group.provider.city.name).toBe('Bangkok');
      for (const service of group.services) expect(service.sortPrice!).toBeLessThanOrEqual(5000);
    }
  });
});

describe('search', () => {
  it('requires every word, across title, provider and category', () => {
    const results = matchedServices(state({ q: 'riverside vitamin' }));
    expect(results.length).toBeGreaterThan(0);
    for (const s of results) {
      expect(s.search.all).toContain('riverside');
      expect(s.search.all).toContain('vitamin');
    }
  });

  it('is case- and whitespace-insensitive', () => {
    expect(countMatches(catalog, state({ q: '  HBA1C   test ' }))).toBe(countMatches(catalog, state({ q: 'hba1c test' })));
  });

  it('ranks title matches above provider-only matches', () => {
    const { groups } = computeResults(catalog, state({ q: 'thai' }));
    const first = groups[0]!.services[0]!;
    expect(first.search.title).toContain('thai');
  });
});

describe('sorting', () => {
  it('sorts by price within each currency, never across currencies', () => {
    const results = computeResults(catalog, state({ sort: 'price_asc' }));
    expect(results.currencyOrder).not.toBeNull();
    const all = matchedServices(state({ sort: 'price_asc' }));
    const currencies = all.map((s) => s.currency).filter((c, i, list) => c !== list[i - 1]);
    expect(currencies).toEqual(results.currencyOrder); // one contiguous run per currency
  });

  it('orders services inside a card by price and puts unpriceable ones last', () => {
    for (const sort of ['price_asc', 'price_desc'] as const) {
      for (const group of computeResults(catalog, state({ sort })).groups) {
        const prices = group.services.map((s) => s.sortPrice);
        const priced = prices.filter((p): p is number => p !== null);
        const sorted = [...priced].sort((a, b) => (sort === 'price_asc' ? a - b : b - a));
        expect(priced).toEqual(sorted);
        expect(prices.slice(priced.length).every((p) => p === null)).toBe(true);
      }
    }
  });

  it('sorts by rating with unrated providers last', () => {
    const ratings = matchedProviders(state({ sort: 'rating' })).map((p) => p.rating);
    const firstUnrated = ratings.indexOf(null);
    expect(firstUnrated).toBeGreaterThan(0);
    expect(ratings.slice(firstUnrated).every((r) => r === null)).toBe(true);
    const rated = ratings.slice(0, firstUnrated) as number[];
    expect(rated).toEqual([...rated].sort((a, b) => b - a));
  });
});

function matchedProviders(s: FilterState) {
  const first = computeResults(catalog, s);
  return Array.from({ length: first.totalPages }, (_, i) => computeResults(catalog, { ...s, page: i + 1 }).groups)
    .flat()
    .map((g) => g.provider);
}

describe('pagination', () => {
  it('pages provider cards and clamps an out-of-range page', () => {
    const results = computeResults(catalog, state({ page: 999 }));
    expect(results.providerCount).toBe(64);
    expect(results.totalPages).toBe(Math.ceil(64 / PROVIDERS_PER_PAGE));
    expect(results.page).toBe(results.totalPages);
    expect(results.groups.length).toBeGreaterThan(0);
  });
});

describe('suggestRelaxations', () => {
  it('offers to remove each blocking filter, with the result count it would give', () => {
    const s = state({ location: { kind: 'city', slug: 'bangkok' }, currency: 'THB', maxPrice: 1 });
    expect(computeResults(catalog, s).total).toBe(1); // only the free consultation
    const empty = state({ ...s, q: 'free dental', types: ['wellness'] });
    expect(computeResults(catalog, empty).total).toBe(0);
    const suggestions = suggestRelaxations(catalog, empty);
    expect(suggestions.map((r) => r.key)).toContain('types');
    for (const suggestion of suggestions) {
      expect(suggestion.count).toBe(computeResults(catalog, suggestion.next).total);
    }
  });
});

describe('performance', () => {
  it('computes results and all facets for the full catalog quickly', () => {
    const s = state({ q: 'test', location: { kind: 'country', code: 'TH' }, types: ['lab_test', 'package'] });
    computeResults(catalog, s); // warm up
    const start = performance.now();
    for (let i = 0; i < 20; i++) computeResults(catalog, s);
    const perRun = (performance.now() - start) / 20;
    // Generous bound for slow CI machines; the README records measured numbers.
    expect(perRun).toBeLessThan(50);
  });
});
