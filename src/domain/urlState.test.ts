import {
  applyChange,
  countActiveFilters,
  DEFAULT_FILTERS,
  parseFilters,
  serializeFilters,
  type FilterState,
} from './urlState';

const full: FilterState = {
  q: 'thyroid scan',
  types: ['package', 'lab_test'],
  category: 'lab_test:ultrasound',
  sub: 'thyroid',
  providers: [46, 48],
  location: { kind: 'city', slug: 'bangkok' },
  currency: 'THB',
  minPrice: 0,
  maxPrice: 5000,
  home: true,
  sort: 'price_asc',
  page: 3,
};

describe('parseFilters / serializeFilters', () => {
  it('round-trips every field', () => {
    expect(parseFilters(serializeFilters(full))).toEqual(full);
  });

  it('produces an empty query for the default view', () => {
    expect(serializeFilters(DEFAULT_FILTERS)).toBe('');
    expect(parseFilters('')).toEqual(DEFAULT_FILTERS);
  });

  it('is canonical: the same view always gives the same URL', () => {
    const a = parseFilters('?type=lab_test,package&provider=48,46');
    const b = parseFilters('?provider=46,48,46&type=package,lab_test');
    expect(serializeFilters(a)).toBe(serializeFilters(b));
    expect(serializeFilters(a)).toBe('?type=package%2Clab_test&provider=46%2C48');
  });

  it('keeps the two ultrasound categories distinct', () => {
    expect(parseFilters('?category=package:ultrasound').category).toBe('package:ultrasound');
    expect(parseFilters('?category=lab_test:ultrasound').category).toBe('lab_test:ultrasound');
  });

  it('drops invalid values instead of failing', () => {
    const state = parseFilters(
      '?type=banana,wellness&category=<script>&sub=thyroid&provider=abc,-1,7&country=Thailand&sort=cheapest&page=-3&home=yes',
    );
    expect(state).toEqual({ ...DEFAULT_FILTERS, types: ['wellness'], providers: [7] });
  });

  it('ignores a price range without a currency, and fixes a reversed range', () => {
    expect(parseFilters('?min=100&max=200')).toMatchObject({ currency: null, minPrice: null, maxPrice: null });
    expect(parseFilters('?currency=npr&min=900&max=100')).toMatchObject({ currency: 'NPR', minPrice: 100, maxPrice: 900 });
    expect(parseFilters('?currency=THB&min=-5&max=abc')).toMatchObject({ minPrice: null, maxPrice: null });
  });

  it('prefers a city over a country if both are present', () => {
    expect(parseFilters('?country=TH&city=bangkok').location).toEqual({ kind: 'city', slug: 'bangkok' });
    expect(parseFilters('?country=np').location).toEqual({ kind: 'country', code: 'NP' });
  });
});

describe('applyChange', () => {
  it('returns to page 1 when a filter changes, but not when the page changes', () => {
    expect(applyChange(full, { home: false }).page).toBe(1);
    expect(applyChange(full, { page: 4 }).page).toBe(4);
  });

  it('clears the subcategory when the category changes', () => {
    expect(applyChange(full, { category: 'package:ultrasound' }).sub).toBeNull();
    expect(applyChange(full, { category: null }).sub).toBeNull();
    expect(applyChange(full, { types: [] }).sub).toBe('thyroid');
  });

  it('clears the price range when the currency is removed', () => {
    expect(applyChange(full, { currency: null })).toMatchObject({ minPrice: null, maxPrice: null });
  });
});

it('counts active filters, excluding sort and page', () => {
  expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
  expect(countActiveFilters(full)).toBe(10);
});
