import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useCatalog } from '../../api/useCatalog';
import { computeResults, SERVICES_PER_CARD, suggestRelaxations, type ProviderGroup } from '../../domain/results';
import type { Catalog, Currency } from '../../domain/types';
import { applyChange, clearFilters, countActiveFilters, SORT_KEYS, type FilterState, type SortKey } from '../../domain/urlState';
import { useDebouncedValue, useMediaQuery, useOnline, useTookLongerThan } from '../../hooks/browser';
import { useUrlState, type NavigateOptions } from '../../hooks/useUrlState';
import { FilterDrawer } from './FilterDrawer';
import { FilterPanel, type FilterChange } from './FilterPanel';
import { activeFilters, summaryText } from './labels';
import { Pagination } from './Pagination';
import { ProviderCard } from './ProviderCard';
import { EmptyState, ErrorState, LoadingState } from './States';

const SORT_LABELS: Record<SortKey, string> = {
  relevance: 'Best match',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  rating: 'Rating',
};

/** Shows up in the DevTools Performance panel (Timings track) during development. */
function measure<T>(name: string, run: () => T): T {
  if (!import.meta.env.DEV || typeof performance.measure !== 'function') return run();
  const start = performance.now();
  const value = run();
  performance.measure(name, { start, end: performance.now() });
  return value;
}

type Navigate = (next: FilterState, options?: NavigateOptions) => void;

export function ExplorerPage() {
  const [state, navigate] = useUrlState();
  const data = useCatalog();
  const online = useOnline();
  const slow = useTookLongerThan(data.status === 'loading', 3000);

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Find health services</h1>
        <p className="page-intro">Compare packages, lab tests and treatments from clinics, hospitals and labs.</p>
        <SearchBox state={state} navigate={navigate} />
      </header>

      {!online && data.status === 'ready' && (
        <p className="banner" role="status">
          You’re offline. You can keep filtering the services already loaded; prices may have changed since.
        </p>
      )}

      {data.status === 'loading' && (
        <div className="layout">
          <aside className="sidebar sidebar-skeleton" aria-hidden="true">
            <div className="skeleton skeleton-block" />
          </aside>
          <main className="results" id="results">
            <LoadingState slow={slow} offline={!online || data.paused} />
          </main>
        </div>
      )}
      {data.status === 'error' && (
        <main className="results results-full" id="results">
          <ErrorState failed={data.failed} offline={!online} onRetry={data.retry} />
        </main>
      )}
      {data.status === 'ready' && (
        <>
          {data.refreshFailed && (
            <div className="banner banner-warning" role="status">
              We couldn’t refresh the latest data, so you’re seeing results from{' '}
              {new Date(data.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
              <button type="button" className="button button-link" onClick={data.retry}>
                Try again
              </button>
            </div>
          )}
          <Explorer catalog={data.catalog} state={state} navigate={navigate} />
        </>
      )}
    </div>
  );
}

/** Search writes straight to the URL; results lag behind via useDeferredValue so typing never waits. */
function SearchBox({ state, navigate }: { state: FilterState; navigate: Navigate }) {
  const [text, setText] = useState(state.q);
  const [synced, setSynced] = useState(state.q);
  if (state.q !== synced) {
    // The URL changed elsewhere (back button, chip, clear all).
    setSynced(state.q);
    setText(state.q);
  }
  return (
    <form className="search" role="search" onSubmit={(event) => event.preventDefault()}>
      <label htmlFor="search-input" className="search-label">
        Search services, providers or categories
      </label>
      <input
        id="search-input"
        className="text-input search-input"
        type="search"
        placeholder="e.g. health check, thyroid, Riverside"
        value={text}
        maxLength={200}
        onChange={(event) => {
          const q = event.target.value;
          setText(q);
          setSynced(q);
          // One history entry per search, not per keystroke.
          navigate(applyChange(state, { q }), { replace: state.q !== '' && q !== '' });
        }}
      />
    </form>
  );
}

function Explorer({ catalog, state, navigate }: { catalog: Catalog; state: FilterState; navigate: Navigate }) {
  const deferredState = useDeferredValue(state);
  const results = useMemo(() => measure('computeResults', () => computeResults(catalog, deferredState)), [catalog, deferredState]);

  const isDesktop = useMediaQuery('(min-width: 60em)');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerButton = useRef<HTMLButtonElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const sortId = useId();

  const change: FilterChange = (patch, options) => navigate(applyChange(state, patch), options);
  const goTo = (next: FilterState) => {
    navigate(next);
    resultsHeading.current?.focus();
  };

  // Keep the URL honest if it asks for a page that doesn't exist.
  useEffect(() => {
    if (deferredState === state && results.page !== state.page) navigate({ ...state, page: results.page }, { replace: true });
  }, [deferredState, state, results.page, navigate]);

  const summary = summaryText(results.total, results.providerCount);
  const pageInfo = results.totalPages > 1 ? `, page ${results.page} of ${results.totalPages}` : '';
  const announcement = useDebouncedValue(`${summary}${pageInfo}`, 600);
  const chips = activeFilters(catalog, state);
  const activeCount = countActiveFilters(state);

  return (
    <div className="layout">
      {isDesktop && (
        <aside className="sidebar" aria-label="Filters">
          <FilterPanel catalog={catalog} state={state} facets={results.facets} onChange={change} />
        </aside>
      )}

      <main className="results" id="results">
        <div className="results-toolbar">
          <h2 className="results-summary" ref={resultsHeading} tabIndex={-1}>
            {summary}
          </h2>
          <div className="toolbar-controls">
            {!isDesktop && (
              <button
                ref={drawerButton}
                type="button"
                className="button button-secondary"
                aria-haspopup="dialog"
                onClick={() => setDrawerOpen(true)}
              >
                Filters{activeCount > 0 ? ` (${activeCount})` : ''}
              </button>
            )}
            <label htmlFor={sortId} className="sort-label">
              Sort by
            </label>
            <select
              id={sortId}
              className="select"
              value={state.sort}
              onChange={(event) => change({ sort: event.target.value as SortKey })}
            >
              {SORT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>

        {chips.length > 0 && (
          <div className="chips">
            <ul className="chip-list" aria-label="Active filters">
              {chips.map((chip) => (
                <li key={chip.id}>
                  <button type="button" className="chip" onClick={() => navigate(chip.without)}>
                    {chip.label}
                    <span aria-hidden="true"> ×</span>
                    <span className="visually-hidden"> (remove filter)</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="button button-link" onClick={() => goTo(clearFilters(state))}>
              Clear all
            </button>
          </div>
        )}

        {results.total === 0 ? (
          <EmptyState
            state={deferredState}
            relaxations={suggestRelaxations(catalog, deferredState)}
            onApply={goTo}
            onClearAll={() => goTo(clearFilters(state))}
          />
        ) : (
          <ResultGroups
            catalog={catalog}
            groups={results.groups}
            currencyOrder={results.currencyOrder}
            sort={deferredState.sort}
            limit={results.providerCount === 1 ? Infinity : SERVICES_PER_CARD}
            onViewAll={(providerId) => goTo(applyChange(state, { providers: [providerId] }))}
          />
        )}

        <Pagination page={results.page} totalPages={results.totalPages} onPage={(page) => goTo({ ...state, page })} />
      </main>

      {drawerOpen && (
        <FilterDrawer
          catalog={catalog}
          initial={state}
          onApply={(next) => navigate(next)}
          onClose={() => {
            setDrawerOpen(false);
            drawerButton.current?.focus();
          }}
        />
      )}
    </div>
  );
}

interface ResultGroupsProps {
  catalog: Catalog;
  groups: ProviderGroup[];
  currencyOrder: Currency[] | null;
  sort: SortKey;
  limit: number;
  onViewAll: (providerId: number) => void;
}

/** Provider cards; when sorting by price across currencies, one section per currency. */
function ResultGroups({ catalog, groups, currencyOrder, sort, limit, onViewAll }: ResultGroupsProps) {
  if (!currencyOrder) {
    return (
      <div className="card-list">
        {groups.map((group) => (
          <ProviderCard
            key={group.provider.id}
            catalog={catalog}
            group={group}
            limit={limit}
            headingLevel={3}
            onViewAll={onViewAll}
          />
        ))}
      </div>
    );
  }
  const sections = currencyOrder
    .map((currency) => ({ currency, groups: groups.filter((g) => g.provider.currency === currency) }))
    .filter((section) => section.groups.length > 0);
  return (
    <>
      <p className="currency-note">
        Prices are in different currencies and we don’t convert between them, so each currency is sorted on its own.
      </p>
      {sections.map((section) => (
        <section key={section.currency} className="currency-section" aria-labelledby={`currency-${section.currency}`}>
          <h3 id={`currency-${section.currency}`} className="currency-heading">
            Prices in {section.currency} · {sort === 'price_asc' ? 'lowest first' : 'highest first'}
          </h3>
          <div className="card-list">
            {section.groups.map((group) => (
              <ProviderCard
                key={group.provider.id}
                catalog={catalog}
                group={group}
                limit={limit}
                headingLevel={4}
                onViewAll={onViewAll}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
