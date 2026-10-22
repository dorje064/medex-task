// Runtime knobs for the mock API, so reviewers can see slow, failing and
// offline states on demand. MSW runs its handlers in the page's own JS context,
// so the dev panel and the handlers share this module directly.

export const ENDPOINTS = ['categories', 'providers', 'services'] as const;
export type Endpoint = (typeof ENDPOINTS)[number];

/** ok: normal latency · slow: ~6 s · error: HTTP 500 · network: connection failure */
export type MockMode = 'ok' | 'slow' | 'error' | 'network';
export const MOCK_MODES: readonly MockMode[] = ['ok', 'slow', 'error', 'network'];

export interface MockSettings {
  modes: Record<Endpoint, MockMode>;
  /** Normal latency range in ms. Tests set this to [0, 0]. */
  latency: [number, number];
}

const SLOW_MS = 6000;

const DEFAULT_SETTINGS: MockSettings = {
  modes: { categories: 'ok', providers: 'ok', services: 'ok' },
  latency: [300, 900],
};

let settings: MockSettings = DEFAULT_SETTINGS;

const listeners = new Set<() => void>();

export function getMockSettings(): MockSettings {
  return settings;
}

export function setMockMode(endpoint: Endpoint, mode: MockMode): void {
  settings = { ...settings, modes: { ...settings.modes, [endpoint]: mode } };
  listeners.forEach((listener) => listener());
}

export function setMockLatency(latency: [number, number]): void {
  settings = { ...settings, latency };
  listeners.forEach((listener) => listener());
}

export function resetMockSettings(): void {
  settings = DEFAULT_SETTINGS;
  listeners.forEach((listener) => listener());
}

export function subscribeMockSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function delayFor(endpoint: Endpoint): number {
  if (settings.modes[endpoint] === 'slow') return SLOW_MS;
  const [min, max] = settings.latency;
  return min + Math.random() * (max - min);
}

/**
 * Applies `?mock=` from the page URL once at startup.
 * Examples: `?mock=error`, `?mock=error:services`, `?mock=slow:providers,network:categories`.
 */
export function applyMockQuery(search: string): void {
  const value = new URLSearchParams(search).get('mock');
  if (!value) return;
  for (const part of value.split(',')) {
    const [mode, endpoint] = part.split(':') as [string, string | undefined];
    if (!MOCK_MODES.includes(mode as MockMode)) continue;
    const targets = endpoint ? ENDPOINTS.filter((e) => e === endpoint) : ENDPOINTS;
    targets.forEach((target) => setMockMode(target, mode as MockMode));
  }
}
