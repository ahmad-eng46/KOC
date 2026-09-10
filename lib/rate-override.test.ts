import { describe, it, expect } from 'vitest';
import {
  findRateOverrides, describeOverride, RATE_OVERRIDE_TOLERANCE_PERCENT,
} from '@/lib/rate-override';
import { formatPKR } from '@/lib/money';

const line = (over: Partial<Parameters<typeof findRateOverrides>[0][number]> = {}) => ({
  productId: 'p1',
  productName: 'Engine Oil 20W-50',
  suggestedPaisa: 100_000,
  enteredPaisa: 100_000,
  costPaisa: 80_000,
  ...over,
});

describe('findRateOverrides', () => {
  it('ignores a line billed at exactly the suggested rate', () => {
    expect(findRateOverrides([line()])).toEqual([]);
  });

  it('records a discount below the suggestion', () => {
    const [o] = findRateOverrides([line({ enteredPaisa: 90_000 })]);
    expect(o.differencePaisa).toBe(-10_000);
    expect(o.differencePercent).toBe(-10);
    expect(o.belowCost).toBe(false);
  });

  it('records a rate above the suggestion too', () => {
    const [o] = findRateOverrides([line({ enteredPaisa: 110_000 })]);
    expect(o.differencePercent).toBe(10);
  });

  it('ignores rounding noise below the tolerance', () => {
    // Rs. 1,000.00 suggested, Rs. 999.99 entered — a pack division artefact.
    expect(findRateOverrides([line({ suggestedPaisa: 100_000, enteredPaisa: 99_999 })]))
      .toEqual([]);
  });

  it('records a difference exactly at the tolerance', () => {
    const [o] = findRateOverrides([line({ enteredPaisa: 99_000 })]);
    expect(o.differencePercent).toBe(-RATE_OVERRIDE_TOLERANCE_PERCENT);
  });

  it('never treats a line without a suggestion as an override', () => {
    expect(findRateOverrides([line({ suggestedPaisa: null, enteredPaisa: 50_000 })]))
      .toEqual([]);
  });

  it('treats any departure from a zero suggestion as total', () => {
    const [o] = findRateOverrides([line({ suggestedPaisa: 0, enteredPaisa: 50_000 })]);
    expect(o.differencePercent).toBe(100);
  });

  it('flags a sale below cost', () => {
    const [o] = findRateOverrides([line({ enteredPaisa: 70_000, costPaisa: 80_000 })]);
    expect(o.belowCost).toBe(true);
  });

  it('does not flag below cost when the cost is unknown or zero', () => {
    expect(findRateOverrides([line({ enteredPaisa: 10, costPaisa: null })])[0].belowCost)
      .toBe(false);
    expect(findRateOverrides([line({ enteredPaisa: 10, costPaisa: 0 })])[0].belowCost)
      .toBe(false);
  });

  it('reports every offending line and no others', () => {
    const found = findRateOverrides([
      line({ productId: 'a', enteredPaisa: 100_000 }),          // unchanged
      line({ productId: 'b', enteredPaisa: 80_000 }),           // -20%
      line({ productId: 'c', enteredPaisa: 99_999 }),           // noise
      line({ productId: 'd', enteredPaisa: 70_000, costPaisa: 80_000 }), // below cost
    ]);
    expect(found.map((o) => o.productId)).toEqual(['b', 'd']);
  });

  it('honours a caller-supplied tolerance', () => {
    expect(findRateOverrides([line({ enteredPaisa: 95_000 })], 10)).toEqual([]);
    expect(findRateOverrides([line({ enteredPaisa: 85_000 })], 10)).toHaveLength(1);
  });
});

describe('describeOverride', () => {
  it('reads as a sentence an admin can act on', () => {
    const [o] = findRateOverrides([line({ enteredPaisa: 90_000 })]);
    expect(describeOverride(o, formatPKR))
      .toBe('Engine Oil 20W-50: Rs. 900.00 instead of Rs. 1,000.00 (down 10%)');
  });

  it('calls out a loss-making line', () => {
    const [o] = findRateOverrides([line({ enteredPaisa: 70_000, costPaisa: 80_000 })]);
    expect(describeOverride(o, formatPKR)).toMatch(/BELOW COST$/);
  });
});
