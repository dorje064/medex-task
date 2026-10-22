import type { ApiCategory, ApiProvider, ApiService } from '../api/types';
import raw from '../../data/task1-service-explorer.json';
import { normalizeCatalog } from '../domain/normalize';

export const fixture = raw as unknown as {
  categories: ApiCategory[];
  providers: ApiProvider[];
  services: ApiService[];
};

export const catalog = normalizeCatalog(fixture.categories, fixture.providers, fixture.services);

export const seeded = (n: number) => {
  const id = `5f0c1a52-6b1e-4c1f-9a51-${String(n).padStart(12, '0')}`;
  const service = fixture.services.find((s) => s.id === id);
  if (!service) throw new Error(`seeded service ${id} missing`);
  return service;
};
