import { formatMoney } from '../../domain/pricing';
import type { Currency, PriceOption, Pricing } from '../../domain/types';

function Amount({ option, currency, suffix }: { option: PriceOption; currency: Currency; suffix?: string }) {
  const final = option.final.eq(0) ? 'Free' : formatMoney(option.final, currency);
  return (
    <span className="price-amount">
      {option.hasDiscount && (
        <>
          <span className="visually-hidden">Was </span>
          <del className="price-original">{formatMoney(option.original, currency)}</del>
          <span className="visually-hidden">, now </span>
        </>
      )}
      <strong className="price-final">{final}</strong>
      {suffix && <span className="price-suffix">{suffix}</span>}
    </span>
  );
}

/**
 * Final price, with the original struck through when discounted. Wellness has
 * no single price: one option shows its duration, several show the cheapest,
 * clearly labelled as a starting price.
 */
export function PriceTag({ pricing, currency }: { pricing: Pricing; currency: Currency }) {
  if (pricing.kind === 'unavailable') {
    return (
      <div className="price">
        <strong className="price-unavailable">Price unavailable</strong>
        <span className="price-caption">Contact the provider for a quote</span>
      </div>
    );
  }
  if (pricing.kind === 'fixed') {
    return (
      <div className="price">
        <Amount option={pricing.option} currency={currency} />
      </div>
    );
  }
  const [cheapest] = pricing.options;
  if (!cheapest) return null;
  if (pricing.options.length === 1) {
    return (
      <div className="price">
        <Amount option={cheapest} currency={currency} suffix={` · ${cheapest.durationMinutes} min`} />
      </div>
    );
  }
  const durations = pricing.options.map((o) => o.durationMinutes ?? 0).sort((a, b) => a - b);
  return (
    <div className="price">
      <span className="price-caption">From</span>
      <Amount option={cheapest} currency={currency} suffix={` · ${cheapest.durationMinutes} min`} />
      <span className="price-caption">
        {pricing.options.length} durations, {durations[0]}–{durations[durations.length - 1]} min
      </span>
    </div>
  );
}
