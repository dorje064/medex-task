import { catalog, fixture } from '../test/fixture';
import { cleanTitle, normalizeCatalog, toSearchText } from './normalize';

const ids = (n: number) => `5f0c1a52-6b1e-4c1f-9a51-${String(n).padStart(12, '0')}`;

describe('normalizeCatalog on the real fixture', () => {
  it('keeps only services that pass the three-part visibility rule', () => {
    expect(catalog.services).toHaveLength(2853);
    const visibleIds = new Set(catalog.services.map((s) => s.id));
    expect(visibleIds.has(ids(4))).toBe(false); // own status false
  });

  it('hides services of inactive providers even when the service itself is active', () => {
    const inactive = new Set([161, 162]);
    expect(catalog.services.some((s) => inactive.has(s.providerId))).toBe(false);
    expect(catalog.providerById.has(161)).toBe(false);
  });

  it('hides services in the inactive "Seasonal Offers" category and drops the category', () => {
    expect(catalog.categoryByKey.has('package:seasonal-offers')).toBe(false);
    expect(catalog.services.some((s) => s.categoryKey === 'package:seasonal-offers')).toBe(false);
  });

  it('keeps services without a category visible', () => {
    // 22 have no category; 2 of those belong to inactive providers.
    expect(catalog.services.filter((s) => s.categoryKey === null)).toHaveLength(20);
  });

  it('keeps the two "ultrasound" categories apart by type', () => {
    const pkg = catalog.categoryByKey.get('package:ultrasound')!;
    const lab = catalog.categoryByKey.get('lab_test:ultrasound')!;
    expect(pkg.id).not.toBe(lab.id);
    expect([pkg.label, lab.label]).toEqual(['Ultrasound (Health package)', 'Ultrasound (Lab test)']);
    expect(pkg.children.map((c) => c.slug)).toEqual(['thyroid', 'abdomen']);
    expect(lab.children.map((c) => c.slug)).toEqual(['thyroid']);
  });

  it('lists only active providers that have visible services', () => {
    expect(catalog.providers).toHaveLength(64);
    expect(catalog.providerById.has(163)).toBe(false); // active, but no services
  });

  it('marks providers without reviews as unrated', () => {
    expect(catalog.providerById.get(61)!.rating).toBeNull(); // Lotus Day Spa
    expect(catalog.providerById.get(48)!.rating).toBe(4.7);
  });

  it('takes the currency from the provider', () => {
    const service = catalog.services.find((s) => s.id === ids(2))!;
    expect(service.currency).toBe('NPR');
  });

  it('cleans whitespace in titles but leaves casing alone', () => {
    const service = catalog.services.find((s) => s.id === ids(7))!;
    expect(service.title).toBe('hba1c TEST (Diabetes)');
    expect(service.search.title).toBe('hba1c test (diabetes)');
  });

  it('records the data issues it worked around', () => {
    const kinds = new Set(catalog.issues.map((i) => i.kind));
    expect(kinds).toEqual(
      new Set([
        'hidden-service',
        'hidden-inactive-provider',
        'hidden-inactive-category',
        'invalid-price',
        'title-cleaned',
        'provider-without-services',
      ]),
    );
    expect(catalog.issues.filter((i) => i.kind === 'invalid-price').map((i) => i.id)).toEqual([ids(5)]);
  });

  it('builds search text from title, provider and category names', () => {
    const service = catalog.services.find((s) => s.id === ids(1))!;
    expect(service.search.provider).toBe('riverside international hospital');
    expect(service.search.category).toBe('health check up general check-up');
  });
});

describe('normalizeCatalog defensive cases', () => {
  it('hides services that point at unknown providers or categories', () => {
    const service = { ...fixture.services[0]!, userId: 999_999 };
    const orphanCategory = { ...fixture.services[0]!, id: 'x', categoryId: 'missing' };
    const result = normalizeCatalog(fixture.categories, fixture.providers, [service, orphanCategory]);
    expect(result.services).toHaveLength(0);
    const serviceIssues = result.issues.filter((i) => i.kind !== 'provider-without-services');
    expect(serviceIssues.map((i) => i.kind)).toEqual(['unknown-reference', 'unknown-reference']);
  });
});

describe('text helpers', () => {
  it('normalises for search', () => {
    expect(toSearchText('  Café   ÜLTRA ')).toBe('cafe ultra');
    expect(cleanTitle(' a \n b ')).toBe('a b');
  });
});
