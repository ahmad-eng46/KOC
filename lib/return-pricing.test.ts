import { describe, it, expect } from 'vitest';
import { distributeInvoiceDiscount, type DiscountableLine } from './return-pricing';

/** Rupees → paisa, for readable fixtures. */
const R = (rupees: number) => Math.round(rupees * 100);

const line = (id: string, quantity: number, unitRupees: number): DiscountableLine => ({
  id,
  quantity,
  lineTotalPaisa: R(unitRupees) * quantity,
});

describe('distributeInvoiceDiscount', () => {
  it('refunds the discounted price on a single-item invoice (INV-00115)', () => {
    // 1 × Air Filter at Rs. 950, Rs. 95 off the invoice → they paid Rs. 855.
    const [air] = distributeInvoiceDiscount([line('air', 1, 950)], R(95));

    expect(air.discountSharePaisa).toBe(R(95));
    expect(air.effectiveLineTotalPaisa).toBe(R(855));
    expect(air.effectiveUnitPricePaisa).toBe(R(855));
  });

  it('splits the discount in proportion to each line', () => {
    const result = distributeInvoiceDiscount(
      [line('a', 2, 2_200), line('b', 1, 42_000)],
      R(1_000),
    );

    expect(result[0].discountSharePaisa).toBe(9_483); // Rs. 94.83
    expect(result[1].discountSharePaisa).toBe(90_517); // Rs. 905.17
    expect(result[0].effectiveUnitPricePaisa).toBe(215_259); // Rs. 2,152.59
    expect(result[1].effectiveUnitPricePaisa).toBe(4_109_483); // Rs. 41,094.83
  });

  it('leaves prices untouched when there is no discount', () => {
    for (const discount of [0, -1]) {
      const result = distributeInvoiceDiscount([line('a', 2, 500), line('b', 3, 125)], discount);
      expect(result.map((r) => r.discountSharePaisa)).toEqual([0, 0]);
      expect(result.map((r) => r.effectiveUnitPricePaisa)).toEqual([R(500), R(125)]);
    }
  });

  it('always allocates the discount exactly, with the remainder on the last line', () => {
    // 3 equal lines and 100 paisa: 33 + 33 + 34, never 99 or 102.
    const result = distributeInvoiceDiscount(
      [line('a', 1, 10), line('b', 1, 10), line('c', 1, 10)],
      100,
    );

    const allocated = result.reduce((sum, r) => sum + r.discountSharePaisa, 0);
    expect(allocated).toBe(100);
    expect(result.map((r) => r.discountSharePaisa)).toEqual([33, 33, 34]);
  });

  it('keeps the effective totals summing to the invoice total', () => {
    const lines = [line('a', 3, 1_333.33), line('b', 7, 91.11), line('c', 1, 20_000)];
    const discount = R(1_234.56);
    const subtotal = lines.reduce((sum, l) => sum + l.lineTotalPaisa, 0);

    const result = distributeInvoiceDiscount(lines, discount);
    const effective = result.reduce((sum, r) => sum + r.effectiveLineTotalPaisa, 0);

    expect(effective).toBe(subtotal - discount);
  });

  it('never refunds more than the invoice was worth', () => {
    const result = distributeInvoiceDiscount([line('a', 1, 100)], R(500));
    expect(result[0].effectiveLineTotalPaisa).toBe(0);
    expect(result[0].effectiveUnitPricePaisa).toBe(0);
  });

  it('handles fractional quantities', () => {
    // 2.5 litres at Rs. 400 = Rs. 1,000; Rs. 100 off → Rs. 900 over 2.5 = Rs. 360.
    const [oil] = distributeInvoiceDiscount(
      [{ id: 'oil', quantity: 2.5, lineTotalPaisa: R(1_000) }],
      R(100),
    );
    expect(oil.effectiveUnitPricePaisa).toBe(R(360));
  });

  it('stays exact on invoices large enough to overflow plain integer math', () => {
    // lineTotal × discount here exceeds Number.MAX_SAFE_INTEGER.
    const lines = [
      { id: 'a', quantity: 1, lineTotalPaisa: 900_000_000_00 },
      { id: 'b', quantity: 1, lineTotalPaisa: 100_000_000_00 },
    ];
    const result = distributeInvoiceDiscount(lines, 10_000_000_00);

    expect(result[0].discountSharePaisa).toBe(9_000_000_00);
    expect(result[1].discountSharePaisa).toBe(1_000_000_00);
  });

  it('returns nothing for an invoice with no items', () => {
    expect(distributeInvoiceDiscount([], R(50))).toEqual([]);
  });

  it('does not divide by zero on a zero-quantity line', () => {
    const [z] = distributeInvoiceDiscount([{ id: 'z', quantity: 0, lineTotalPaisa: 0 }], R(10));
    expect(z.effectiveUnitPricePaisa).toBe(0);
  });
});
