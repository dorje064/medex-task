import { useId, useState, type FormEvent } from 'react';
import type { FacetCounts } from '../../domain/results';
import { CURRENCIES, type Currency } from '../../domain/types';
import type { FilterState } from '../../domain/urlState';
import { FacetOption } from './FacetOption';
import type { FilterChange } from './FilterPanel';

interface PriceFilterProps {
  state: FilterState;
  facets: FacetCounts;
  onChange: FilterChange;
}

const toText = (value: number | null) => (value === null ? '' : String(value));

/** Empty → null (no bound). Invalid → undefined. */
function parseAmount(text: string): number | null | undefined {
  const cleaned = text.replace(/[,\s]/g, '');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Keeps a text field's draft, but resets it when the committed value changes elsewhere (back button, chip). */
function useDraft(committed: number | null) {
  const [text, setText] = useState(toText(committed));
  const [synced, setSynced] = useState(committed);
  if (committed !== synced) {
    setSynced(committed);
    setText(toText(committed));
  }
  return [text, setText] as const;
}

/**
 * Prices can only be compared within one currency and we never convert, so a
 * range always belongs to a currency. When every result is already in one
 * currency (e.g. a Thai city is selected) the range applies to it directly;
 * otherwise the customer picks the currency first.
 */
export function PriceFilter({ state, facets, onChange }: PriceFilterProps) {
  const id = useId();
  const available = CURRENCIES.filter((c) => (facets.currency.get(c) ?? 0) > 0);
  const onlyCurrency = available.length === 1 ? available[0]! : null;
  const rangeCurrency: Currency | null = state.currency ?? onlyCurrency;

  const [minText, setMinText] = useDraft(state.minPrice);
  const [maxText, setMaxText] = useDraft(state.maxPrice);
  const min = parseAmount(minText);
  const max = parseAmount(maxText);
  const invalid = min === undefined || max === undefined;

  function commit(event?: FormEvent) {
    event?.preventDefault();
    if (!rangeCurrency || invalid) return;
    if (min === state.minPrice && max === state.maxPrice && state.currency === rangeCurrency) return;
    const [low, high] = min !== null && max !== null && min > max ? [max, min] : [min, max];
    onChange({ currency: rangeCurrency, minPrice: low, maxPrice: high });
  }

  return (
    <fieldset className="filter-group">
      <legend>Price</legend>
      <p className="filter-note" id={`${id}-note`}>
        {rangeCurrency
          ? `Final price in ${rangeCurrency}, after discounts and service charges. Wellness services match if any duration is in range.`
          : 'Results are priced in several currencies and we don’t convert between them. Choose a currency to filter by price.'}
      </p>

      <div role="radiogroup" aria-label="Currency">
        <FacetOption
          type="radio"
          name={`${id}-currency`}
          label="Any currency"
          checked={!state.currency}
          onChange={() => onChange({ currency: null })}
        />
        {CURRENCIES.map((currency) => (
          <FacetOption
            key={currency}
            type="radio"
            name={`${id}-currency`}
            label={`Only ${currency} prices`}
            count={facets.currency.get(currency) ?? 0}
            checked={state.currency === currency}
            onChange={() => onChange({ currency })}
          />
        ))}
      </div>

      <form className="price-range" onSubmit={commit} aria-describedby={`${id}-note`}>
        <div className="price-field">
          <label htmlFor={`${id}-min`}>Min{rangeCurrency ? ` (${rangeCurrency})` : ''}</label>
          <input
            id={`${id}-min`}
            className="text-input"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={minText}
            disabled={!rangeCurrency}
            aria-invalid={min === undefined}
            onChange={(event) => setMinText(event.target.value)}
            onBlur={() => commit()}
          />
        </div>
        <div className="price-field">
          <label htmlFor={`${id}-max`}>Max{rangeCurrency ? ` (${rangeCurrency})` : ''}</label>
          <input
            id={`${id}-max`}
            className="text-input"
            inputMode="decimal"
            autoComplete="off"
            placeholder="No limit"
            value={maxText}
            disabled={!rangeCurrency}
            aria-invalid={max === undefined}
            onChange={(event) => setMaxText(event.target.value)}
            onBlur={() => commit()}
          />
        </div>
        <button type="submit" className="button button-secondary" disabled={!rangeCurrency || invalid}>
          Apply
        </button>
      </form>
      {invalid && (
        <p className="field-error" role="alert">
          Enter prices as numbers, for example 5000.
        </p>
      )}
    </fieldset>
  );
}
