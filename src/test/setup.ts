import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { resetMockSettings, setMockLatency } from '../mocks/controller';
import { server } from '../mocks/node';
import { installBrowserStubs, setDesktop } from './browser';

installBrowserStubs();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  // jsdom's AbortSignal isn't the class Node's fetch (undici) accepts, so a
  // request with a signal throws in tests only. Drop it; browsers are unaffected.
  const fetchWithMsw = globalThis.fetch;
  globalThis.fetch = (input, init) => fetchWithMsw(input, init && { ...init, signal: undefined });
});
beforeEach(() => {
  resetMockSettings();
  setMockLatency([0, 0]);
  setDesktop(true);
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
