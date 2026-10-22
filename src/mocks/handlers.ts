import { delay, http, HttpResponse } from 'msw';
import type { ApiCategory, ApiProvider, ApiService } from '../api/types';
import { delayFor, getMockSettings, type Endpoint } from './controller';

interface Dataset {
  categories: ApiCategory[];
  providers: ApiProvider[];
  services: ApiService[];
}

// Loaded lazily so the 2 MB fixture lives in its own chunk, not the app bundle.
let dataset: Promise<Dataset> | undefined;
function loadDataset(): Promise<Dataset> {
  dataset ??= import('../../data/task1-service-explorer.json').then(
    (module) => module.default as unknown as Dataset,
  );
  return dataset;
}

function respond<K extends keyof Dataset>(endpoint: Endpoint, key: K) {
  return async () => {
    await delay(delayFor(endpoint));
    const mode = getMockSettings().modes[endpoint];
    // MSW answers requests itself, so DevTools "offline" would not stop it.
    // Mirror the browser's connectivity so the offline state is reachable.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (mode === 'network' || offline) return HttpResponse.error();
    if (mode === 'error') {
      return HttpResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
    const data = await loadDataset();
    return HttpResponse.json(data[key]);
  };
}

export const API_PATHS = {
  categories: '/api/category/active',
  providers: '/api/providers',
  services: '/api/service',
} as const satisfies Record<Endpoint, string>;

export const handlers = [
  http.get(API_PATHS.categories, respond('categories', 'categories')),
  http.get(API_PATHS.providers, respond('providers', 'providers')),
  http.get(API_PATHS.services, respond('services', 'services')),
];
