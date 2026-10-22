import type { Relaxation } from '../../domain/results';
import type { FilterState } from '../../domain/urlState';
import type { Endpoint } from '../../mocks/controller';
import { ProviderCardSkeleton } from './ProviderCard';
import { plural, relaxationLabel } from './labels';

export function LoadingState({ slow, offline }: { slow: boolean; offline: boolean }) {
  return (
    <div className="results-loading" aria-busy="true">
      <p className="status-line" role="status">
        {offline
          ? 'You’re offline. We’ll load services as soon as you’re back online.'
          : slow
            ? 'This is taking longer than usual. Still loading services…'
            : 'Loading services…'}
      </p>
      {[0, 1, 2].map((card) => (
        <ProviderCardSkeleton key={card} />
      ))}
    </div>
  );
}

const PART_NAMES: Record<Endpoint, string> = {
  categories: 'categories',
  providers: 'provider details',
  services: 'services',
};

export function ErrorState({ failed, offline, onRetry }: { failed: Endpoint[]; offline: boolean; onRetry: () => void }) {
  const parts = failed.map((part) => PART_NAMES[part]).join(' and ');
  return (
    <div className="state-panel" role="alert">
      <h2 className="state-title">We couldn’t load services</h2>
      <p>
        {offline
          ? 'You seem to be offline. Check your connection, then try again.'
          : `Something went wrong while loading ${parts}. This is usually temporary.`}
      </p>
      <button type="button" className="button button-primary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

interface EmptyStateProps {
  state: FilterState;
  relaxations: Relaxation[];
  onApply: (next: FilterState) => void;
  onClearAll: () => void;
}

export function EmptyState({ state, relaxations, onApply, onClearAll }: EmptyStateProps) {
  return (
    <div className="state-panel">
      <h2 className="state-title">No services match all of your filters</h2>
      {relaxations.length > 0 ? (
        <>
          <p>Try one of these:</p>
          <ul className="relaxations">
            {relaxations.slice(0, 4).map((relaxation) => (
              <li key={relaxation.key}>
                <button type="button" className="button button-secondary" onClick={() => onApply(relaxation.next)}>
                  {relaxationLabel(relaxation.key, state)}{' '}
                  <span className="relaxation-count">({plural(relaxation.count, 'result')})</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>No single change brings results back. Clearing everything shows all services.</p>
      )}
      <button type="button" className="button button-link" onClick={onClearAll}>
        Clear all filters
      </button>
    </div>
  );
}
