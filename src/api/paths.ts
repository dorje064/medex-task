import type { Endpoint } from '../mocks/controller';

export const API_PATHS = {
  categories: '/api/category/active',
  providers: '/api/providers',
  services: '/api/service',
} as const satisfies Record<Endpoint, string>;
