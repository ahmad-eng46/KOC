import { describe, expect, it } from 'vitest';
import { computeInvoiceTotals } from '@/lib/invoice';

describe('computeInvoiceTotals', () => {
  it('1. empty items → subtotal 0, total 0', () => {
    const r = computeInvoiceTotals([], 'none', 0);
    expect(r.subtotal_paisa).toBe(0);
    expect(r.discount_paisa).toBe(0);
    expect(r.total_paisa).toBe(0);
    expect(r.line_totals_paisa).toEqual([]);
  });

  it('2. single item, no discount', () => {
    // 1 unit × Rs. 100.00 = 10,000 paisa
    const r = computeInvoiceTotals(
      [{ quantity: 1, unit_price_paisa: 10_000 }],
      'none',
      0,
    );
    expect(r.subtotal_paisa).toBe(10_000);
    expect(r.discount_paisa).toBe(0);
    expect(r.total_paisa).toBe(10_000);
    expect(r.line_totals_paisa).toEqual([10_000]);
  });

  it('3. multiple items, no discount', () => {
    // 2 × 5,000 + 3 × 2,500 = 10,000 + 7,500 = 17,500 paisa
    const r = computeInvoiceTotals(
      [
        { quantity: 2, unit_price_paisa: 5_000 },
        { quantity: 3, unit_price_paisa: 2_500 },
      ],
      'none',
      0,
    );
    expect(r.subtotal_paisa).toBe(17_500);
    expect(r.line_totals_paisa).toEqual([10_000, 7_500]);
    expect(r.total_paisa).toBe(17_500);
  });

  it('4. fixed discount in paisa', () => {
    // subtotal 10,000 - 1,500 = 8,500
    const r = computeInvoiceTotals(
      [{ quantity: 1, unit_price_paisa: 10_000 }],
      'fixed',
      1_500,
    );
    expect(r.subtotal_paisa).toBe(10_000);
    expect(r.discount_paisa).toBe(1_500);
    expect(r.total_paisa).toBe(8_500);
  });

  it('5. percent discount (10%)', () => {
    // 10% of 50,000 = 5,000 → total 45,000
    const r = computeInvoiceTotals(
      [{ quantity: 5, unit_price_paisa: 10_000 }],
      'percent',
      10,
    );
    expect(r.subtotal_paisa).toBe(50_000);
    expect(r.discount_paisa).toBe(5_000);
    expect(r.total_paisa).toBe(45_000);
  });

  it('6. fractional percent discount (12.5%)', () => {
    // 12.5% of 80,000 = 10,000 → total 70,000
    const r = computeInvoiceTotals(
      [{ quantity: 1, unit_price_paisa: 80_000 }],
      'percent',
      12.5,
    );
    expect(r.subtotal_paisa).toBe(80_000);
    expect(r.discount_paisa).toBe(10_000);
    expect(r.total_paisa).toBe(70_000);
  });

  it('7. discount greater than subtotal is clamped to subtotal (total = 0)', () => {
    // fixed discount 999_999 on subtotal 10_000 → discount=10_000, total=0
    const r = computeInvoiceTotals(
      [{ quantity: 1, unit_price_paisa: 10_000 }],
      'fixed',
      999_999,
    );
    expect(r.subtotal_paisa).toBe(10_000);
    expect(r.discount_paisa).toBe(10_000);
    expect(r.total_paisa).toBe(0);
  });

  it('8. percent discount above 100 is clamped to 100', () => {
    const r = computeInvoiceTotals(
      [{ quantity: 1, unit_price_paisa: 10_000 }],
      'percent',
      250,
    );
    expect(r.subtotal_paisa).toBe(10_000);
    expect(r.discount_paisa).toBe(10_000);
    expect(r.total_paisa).toBe(0);
  });

  it('9. negative discount is treated as 0', () => {
    const r = computeInvoiceTotals(
      [{ quantity: 1, unit_price_paisa: 10_000 }],
      'fixed',
      -500,
    );
    expect(r.discount_paisa).toBe(0);
    expect(r.total_paisa).toBe(10_000);
  });

  it('10. per-line discount reduces line total before summing', () => {
    // line1: 2 × 5,000 - 500 = 9,500
    // line2: 1 × 3,000 - 0   = 3,000
    // subtotal 12,500
    const r = computeInvoiceTotals(
      [
        { quantity: 2, unit_price_paisa: 5_000, discount_paisa: 500 },
        { quantity: 1, unit_price_paisa: 3_000 },
      ],
      'none',
      0,
    );
    expect(r.line_totals_paisa).toEqual([9_500, 3_000]);
    expect(r.subtotal_paisa).toBe(12_500);
    expect(r.total_paisa).toBe(12_500);
  });

  it('11. per-line discount cannot make a line negative', () => {
    // line: 1 × 100 - 999 → clamped to 0
    const r = computeInvoiceTotals(
      [{ quantity: 1, unit_price_paisa: 100, discount_paisa: 999 }],
      'none',
      0,
    );
    expect(r.line_totals_paisa).toEqual([0]);
    expect(r.subtotal_paisa).toBe(0);
    expect(r.total_paisa).toBe(0);
  });

  it('12. fractional quantity rounded half-up to nearest paisa', () => {
    // 2.5 litres × 12,345 paisa = 30,862.5 → round → 30,863
    const r = computeInvoiceTotals(
      [{ quantity: 2.5, unit_price_paisa: 12_345 }],
      'none',
      0,
    );
    expect(r.line_totals_paisa).toEqual([30_863]);
    expect(r.subtotal_paisa).toBe(30_863);
  });

  it('13. very small fractional quantity rounds correctly', () => {
    // 0.333 × 100_000 = 33,300 (exact integer)
    const r = computeInvoiceTotals(
      [{ quantity: 0.333, unit_price_paisa: 100_000 }],
      'none',
      0,
    );
    expect(r.line_totals_paisa).toEqual([33_300]);
  });

  it('14. large amounts (millions of paisa) within Number.MAX_SAFE_INTEGER', () => {
    // 1000 units × 12,500,000 paisa (Rs. 125,000) = 12,500,000,000 paisa (Rs. 1.25 crore)
    const r = computeInvoiceTotals(
      [{ quantity: 1000, unit_price_paisa: 12_500_000 }],
      'percent',
      5,
    );
    expect(r.subtotal_paisa).toBe(12_500_000_000);
    expect(r.discount_paisa).toBe(625_000_000);
    expect(r.total_paisa).toBe(11_875_000_000);
    // Sanity: still a safe integer
    expect(Number.isSafeInteger(r.total_paisa)).toBe(true);
  });

  it('15. percent rounding: 33% of 100 = 33 (33.0 exactly), 33% of 101 = 33 (33.33 rounded down)', () => {
    const a = computeInvoiceTotals(
      [{ quantity: 1, unit_price_paisa: 100 }],
      'percent',
      33,
    );
    expect(a.discount_paisa).toBe(33);

    const b = computeInvoiceTotals(
      [{ quantity: 1, unit_price_paisa: 101 }],
      'percent',
      33,
    );
    // 101 * 33 / 100 = 33.33 → round → 33
    expect(b.discount_paisa).toBe(33);
  });

  it('16. zero-rate item is allowed (free sample)', () => {
    const r = computeInvoiceTotals(
      [{ quantity: 5, unit_price_paisa: 0 }],
      'none',
      0,
    );
    expect(r.line_totals_paisa).toEqual([0]);
    expect(r.subtotal_paisa).toBe(0);
    expect(r.total_paisa).toBe(0);
  });

  it('17. percent discount on zero subtotal stays zero', () => {
    const r = computeInvoiceTotals(
      [{ quantity: 1, unit_price_paisa: 0 }],
      'percent',
      50,
    );
    expect(r.subtotal_paisa).toBe(0);
    expect(r.discount_paisa).toBe(0);
    expect(r.total_paisa).toBe(0);
  });
});
