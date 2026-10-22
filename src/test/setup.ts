import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { resetMockSettings, setMockLatency } from '../mocks/controller';
import { server } from '../mocks/node';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  resetMockSettings();
  setMockLatency([0, 0]);
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
