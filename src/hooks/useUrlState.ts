import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { parseFilters, serializeFilters, type FilterState } from '../domain/urlState';

// pushState/replaceState don't fire events, so we announce our own changes.
const URL_CHANGE = 'medex:urlchange';

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(URL_CHANGE, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(URL_CHANGE, onChange);
  };
}

const getSearch = () => window.location.search;

export interface NavigateOptions {
  /** Replace the current history entry instead of adding one (e.g. while typing). */
  replace?: boolean;
}

/**
 * The URL is the single source of truth for the view. Reading is synchronous,
 * so the very first render already reflects a shared link: there is no
 * unfiltered frame. Back/forward work because we listen to popstate.
 */
export function useUrlState() {
  const search = useSyncExternalStore(subscribe, getSearch, getSearch);
  const state = useMemo(() => parseFilters(search), [search]);

  const navigate = useCallback((next: FilterState, { replace = false }: NavigateOptions = {}) => {
    const url = `${window.location.pathname}${serializeFilters(next)}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (url === current) return;
    window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
    window.dispatchEvent(new Event(URL_CHANGE));
  }, []);

  return [state, navigate] as const;
}
