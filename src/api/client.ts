import { API_PATHS } from '../mocks/handlers';
import type { ApiCategory, ApiProvider, ApiService } from './types';

/** Thrown for HTTP errors (`status` set) and connection failures (`status` undefined). */
export class ApiError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(new URL(path, window.location.origin), { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(`Network request to ${path} failed`);
  }
  if (!response.ok) throw new ApiError(`${path} responded ${response.status}`, response.status);
  return (await response.json()) as T;
}

export const api = {
  categories: (signal?: AbortSignal) => getJson<ApiCategory[]>(API_PATHS.categories, signal),
  providers: (signal?: AbortSignal) => getJson<ApiProvider[]>(API_PATHS.providers, signal),
  services: (signal?: AbortSignal) => getJson<ApiService[]>(API_PATHS.services, signal),
};
