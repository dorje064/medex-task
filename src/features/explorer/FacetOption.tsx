import type { ReactNode } from 'react';
import { formatNumber } from './labels';

interface FacetOptionProps {
  type: 'checkbox' | 'radio';
  name: string;
  label: ReactNode;
  /** Results this option leads to. Omit for "All …" options. */
  count?: number;
  checked: boolean;
  onChange: () => void;
  hint?: ReactNode;
  className?: string;
}

/**
 * Zero-result options stay in place but disabled, rather than disappearing:
 * the list doesn't jump around as filters change, and the customer can see
 * that the option exists but has nothing under the current filters. A
 * selected option is never disabled, so it can always be cleared.
 */
export function FacetOption({ type, name, label, count, checked, onChange, hint, className }: FacetOptionProps) {
  const unavailable = count === 0 && !checked;
  return (
    <label className={`facet-option${unavailable ? ' is-unavailable' : ''}${className ? ` ${className}` : ''}`}>
      <input type={type} name={name} checked={checked} disabled={unavailable} onChange={onChange} />
      <span className="facet-label">
        {label}
        {hint && <span className="facet-hint">{hint}</span>}
      </span>
      {count !== undefined && (
        <span className="facet-count">
          {formatNumber(count)}
          <span className="visually-hidden">{count === 1 ? ' result' : ' results'}</span>
        </span>
      )}
    </label>
  );
}
