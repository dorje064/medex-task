import Big from 'big.js';
import { seeded } from '../test/fixture';
import { computePriceOption, computePricing, formatMoney, parseMoney } from './pricing';

const fields = (overrides: Partial<Parameters<typeof computePriceOption>[0]> = {}) => ({
  price: '1000.00',
  discount: '0.00',
  discountType: 'amount' as const,
  serviceCharge: '0.00',
  serviceChargeType: 'amount' as const,
  ...overrides,
});

describe('computePriceOption', () => {
  it('applies a percent discount then a percent service charge to the discounted price', () => {
    // Seeded …0001: 6200 − 10% = 5580; + 7% of 5580 = 390.60 → 5970.60
    const option = computePriceOption(seeded(1))!;
    expect(option.final.toFixed(2)).toBe('5970.60');
    expect(option.original.toFixed(2)).toBe('6200.00');
    expect(option.hasDiscount).toBe(true);
  });

  it('applies amount discounts and amount charges as flat values', () => {
    const option = computePriceOption(fields({ discount: '150.00', serviceCharge: '25.50' }))!;
    expect(option.final.toFixed(2)).toBe('875.50');
  });

  it('does not round in the middle of the calculation', () => {
    // 99.99 − 33.33% = 66.663333; + 12.5% = 74.996249625 → displays 75.00.
    // Rounding after each step would give 74.99 instead.
    const option = computePriceOption(
      fields({ price: '99.99', discount: '33.33', discountType: 'percent', serviceCharge: '12.50', serviceChargeType: 'percent' }),
    )!;
    expect(option.final.toString()).toBe('74.996249625');
  });

  it('rejects a discount larger than the price instead of showing a negative price', () => {
    // Seeded …0005 "Vitamin D Test": 450.00 with a 600.00 discount.
    expect(computePriceOption(seeded(5))).toBeNull();
    expect(computePriceOption(fields({ discount: '101', discountType: 'percent' }))).toBeNull();
  });

  it('accepts a 100% discount and a zero price as genuinely free', () => {
    expect(computePriceOption(fields({ discount: '100', discountType: 'percent' }))!.final.toString()).toBe('0');
    expect(computePriceOption(seeded(6))!.final.toString()).toBe('0'); // Free Dental Consultation
  });

  it('rejects missing, malformed or negative inputs', () => {
    expect(computePriceOption(fields({ price: null }))).toBeNull();
    expect(computePriceOption(fields({ price: 'abc' }))).toBeNull();
    expect(computePriceOption(fields({ serviceCharge: '-5.00' }))).toBeNull();
  });

  it('treats missing discount and charge as zero', () => {
    const option = computePriceOption(fields({ discount: null, discountType: null, serviceCharge: null, serviceChargeType: null }))!;
    expect(option.final.toFixed(2)).toBe('1000.00');
    expect(option.hasDiscount).toBe(false);
  });
});

describe('computePricing', () => {
  it('prices wellness services per duration option, lowest final first', () => {
    // Seeded …0003: 60 min 1800.00; 90 min 2400 − 15% = 2040.00
    const pricing = computePricing(seeded(3));
    expect(pricing.kind).toBe('options');
    if (pricing.kind !== 'options') return;
    expect(pricing.options.map((o) => [o.durationMinutes, o.final.toFixed(2), o.hasDiscount])).toEqual([
      [60, '1800.00', false],
      [90, '2040.00', true],
    ]);
  });

  it('is unavailable for a wellness service with no usable options', () => {
    expect(computePricing({ ...seeded(3), wellnessPricing: [] }).kind).toBe('unavailable');
  });

  it('is unavailable for a non-wellness service whose price is invalid', () => {
    expect(computePricing(seeded(5)).kind).toBe('unavailable');
  });
});

// Intl separates the currency code with a no-break space.
const plain = (text: string) => text.replace(/\u00a0/g, ' ');

describe('money helpers', () => {
  it('parses decimal strings exactly', () => {
    expect(parseMoney('6200.00')!.eq(6200)).toBe(true);
    expect(parseMoney(' 0.10 ')!.plus(parseMoney('0.20')!).toString()).toBe('0.3');
    expect(parseMoney('')).toBeNull();
    expect(parseMoney(null)).toBeNull();
  });

  it('rounds half-up to 2 decimals only at display time and labels the currency', () => {
    expect(plain(formatMoney(new Big('1.005'), 'THB'))).toBe('THB 1.01'); // float 1.005 would round to 1.00
    expect(plain(formatMoney(new Big('60401.5'), 'INR'))).toBe('INR 60,401.50');
    expect(plain(formatMoney(new Big('74.996249625'), 'NPR'))).toBe('NPR 75.00');
  });
});
