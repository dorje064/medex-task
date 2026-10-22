import { applyMockQuery, setMockMode } from '../mocks/controller';
import { api, ApiError } from './client';

describe('mock API', () => {
  it('serves each collection from its own endpoint', async () => {
    const [categories, providers, services] = await Promise.all([
      api.categories(),
      api.providers(),
      api.services(),
    ]);
    expect(categories).toHaveLength(13);
    expect(providers).toHaveLength(67);
    expect(services).toHaveLength(3200);
  });

  it('fails one endpoint on demand with an HTTP error', async () => {
    setMockMode('services', 'error');
    await expect(api.services()).rejects.toMatchObject({ name: 'ApiError', status: 500 });
    await expect(api.providers()).resolves.toHaveLength(67);
  });

  it('reports connection failures without a status', async () => {
    setMockMode('categories', 'network');
    const error = await api.categories().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBeUndefined();
  });

  it('reads failure modes from the ?mock= query', async () => {
    applyMockQuery('?mock=error:providers');
    await expect(api.providers()).rejects.toBeInstanceOf(ApiError);
    await expect(api.categories()).resolves.toHaveLength(13);
  });
});
