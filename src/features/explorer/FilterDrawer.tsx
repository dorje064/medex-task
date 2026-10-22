import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { computeResults } from '../../domain/results';
import type { Catalog } from '../../domain/types';
import { applyChange, clearFilters, type FilterState } from '../../domain/urlState';
import { FilterPanel } from './FilterPanel';
import { plural } from './labels';

interface FilterDrawerProps {
  catalog: Catalog;
  /** The applied filters when the drawer opened. */
  initial: FilterState;
  onApply: (next: FilterState) => void;
  onClose: () => void;
}

/**
 * Mobile filters. Changes here are a draft: the URL (and the results behind
 * the drawer) only change on "Show results". The button counts what the draft
 * would produce, using the same function as the real results.
 * Mount it only while open; it opens itself as a modal <dialog>, which gives
 * us the focus trap, Escape to close and an inert background for free.
 */
export function FilterDrawer({ catalog, initial, onApply, onClose }: FilterDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [draft, setDraft] = useState(initial);
  const pending = useDeferredValue(draft);
  const results = useMemo(() => computeResults(catalog, pending), [catalog, pending]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="drawer"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="drawer-header">
        <h2 id={titleId} className="drawer-title">
          Filters
        </h2>
        <button type="button" className="button button-secondary" onClick={onClose}>
          Close<span className="visually-hidden"> without applying</span>
        </button>
      </div>
      <div className="drawer-body">
        <FilterPanel
          catalog={catalog}
          state={draft}
          facets={results.facets}
          onChange={(patch) => setDraft((current) => applyChange(current, patch))}
        />
      </div>
      <div className="drawer-footer">
        <button type="button" className="button button-secondary" onClick={() => setDraft(clearFilters(draft))}>
          Clear all
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            onApply(draft);
            onClose();
          }}
        >
          {results.total === 0 ? 'Show 0 results' : `Show ${plural(results.total, 'result')}`}
        </button>
      </div>
    </dialog>
  );
}
