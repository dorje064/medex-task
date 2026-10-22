import Big from 'big.js';
import type { ApiPriceFields, ApiService } from '../api/types';
import type { Currency, PriceOption, Pricing } from './types';

const ZERO = new Big(0);
const HUNDRED = new Big(100);

/** Parses an API decimal string. Returns null for missing or malformed values. */
export function parseMoney(value: string | null | undefined): Big | null {
  if (value == null || value.trim() === '') return null;
  try {
    return new Big(value.trim());
  } catch {
    return null;
  }
}

/**
 * The domain formula, with no rounding:
 *   discountAmount = percent ? price × discount / 100 : discount
 *   afterDiscount  = price − discountAmount
 *   chargeAmount   = percent ? afterDiscount × serviceCharge / 100 : serviceCharge
 *   finalPrice     = afterDiscount + chargeAmount
 * Missing discount or service charge counts as zero. Returns null when the
 * inputs cannot give a trustworthy price: no price, a negative input, or a
 * discount bigger than the price.
 */
export function computePriceOption(
  fields: ApiPriceFields,
  durationMinutes: number | null = null,
): PriceOption | null {
  const price = parseMoney(fields.price);
  const discount = fields.discount == null ? ZERO : parseMoney(fields.discount);
  const charge = fields.serviceCharge == null ? ZERO : parseMoney(fields.serviceCharge);
  if (!price || !discount || !charge) return null;
  if (price.lt(0) || discount.lt(0) || charge.lt(0)) return null;

  const discountAmount =
    fields.discountType === 'percent' ? price.times(discount).div(HUNDRED) : discount;
  const afterDiscount = price.minus(discountAmount);
  if (afterDiscount.lt(0)) return null;

  const chargeAmount =
    fields.serviceChargeType === 'percent' ? afterDiscount.times(charge).div(HUNDRED) : charge;

  return {
    durationMinutes,
    original: price,
    final: afterDiscount.plus(chargeAmount),
    hasDiscount: discountAmount.gt(0),
  };
}

/** Wellness services are priced per duration option; everything else by its own fields. */
export function computePricing(service: ApiService): Pricing {
  if (service.type === 'wellness') {
    const options = (service.wellnessPricing ?? [])
      .map((option) => computePriceOption(option, option.durationInMinutes))
      .filter((option): option is PriceOption => option !== null)
      .sort((a, b) => a.final.cmp(b.final) || (a.durationMinutes ?? 0) - (b.durationMinutes ?? 0));
    return options.length > 0 ? { kind: 'options', options } : { kind: 'unavailable' };
  }
  const option = computePriceOption(service);
  return option ? { kind: 'fixed', option } : { kind: 'unavailable' };
}

export function pricingOptions(pricing: Pricing): PriceOption[] {
  if (pricing.kind === 'fixed') return [pricing.option];
  if (pricing.kind === 'options') return pricing.options;
  return [];
}

const formatters = new Map<Currency, Intl.NumberFormat>();

/**
 * The only place amounts are rounded: half-up to 2 decimals, on the exact
 * decimal, and only then handed to Intl as a string so no float rounding occurs.
 */
export function formatMoney(amount: Big, currency: Currency): string {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatters.set(currency, formatter);
  }
  const rounded = amount.round(2, Big.roundHalfUp).toFixed(2);
  // Intl accepts decimal strings exactly (ES2023); the cast covers older lib typings.
  return formatter.format(rounded as unknown as number);
}
