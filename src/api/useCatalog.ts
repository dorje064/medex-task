import { QueryClient, useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { normalizeCatalog } from '../domain/normalize';
import type { Catalog } from '../domain/types';
import type { Endpoint } from '../mocks/controller';
import { api } from './client';

export function createQueryClient(options: { retry?: number } = {}) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // One quick retry hides a blip; after that the customer gets a clear choice.
        retry: options.retry ?? 1,
        retryDelay: 500,
        staleTime: 5 * 60_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export type CatalogState =
  | { status: 'loading'; paused: boolean }
  | { status: 'error'; failed: Endpoint[]; retry: () => void }
  | {
      status: 'ready';
      catalog: Catalog;
      /** A background refresh failed; we still show the last data we had. */
      refreshFailed: boolean;
      updatedAt: number;
      retry: () => void;
    };

/**
 * Loads the three collections and normalises them together. All three are
 * needed to apply the visibility rule correctly (provider status, category
 * status), so we never show a list built from only some of them.
 */
export function useCatalog(): CatalogState {
  const [categories, providers, services] = useQueries({
    queries: [
      { queryKey: ['categories'], queryFn: ({ signal }) => api.categories(signal) },
      { queryKey: ['providers'], queryFn: ({ signal }) => api.providers(signal) },
      { queryKey: ['services'], queryFn: ({ signal }) => api.services(signal) },
    ],
  });

  const catalog = useMemo(
    () =>
      categories.data && providers.data && services.data
        ? normalizeCatalog(categories.data, providers.data, services.data)
        : null,
    [categories.data, providers.data, services.data],
  );

  const named = [
    ['categories', categories],
    ['providers', providers],
    ['services', services],
  ] as const;

  // Only refetch what failed; successful responses stay cached.
  const retry = () => {
    for (const [, query] of named) if (query.isError) void query.refetch();
  };

  if (catalog) {
    return {
      status: 'ready',
      catalog,
      refreshFailed: named.some(([, q]) => q.isError),
      updatedAt: Math.min(...named.map(([, q]) => q.dataUpdatedAt)),
      retry,
    };
  }
  const failed = named.filter(([, q]) => q.isError && !q.data).map(([name]) => name);
  if (failed.length > 0 && named.every(([, q]) => q.data || q.isError)) {
    return { status: 'error', failed, retry };
  }
  return { status: 'loading', paused: named.some(([, q]) => q.fetchStatus === 'paused') };
}
