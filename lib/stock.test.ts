import { describe, expect, it } from 'vitest';
import {
  findStockShortages,
  formatShortageError,
  sumRequestedByProduct,
} from '@/lib/stock';

const NAMES = new Map([
  ['p1', 'Kerosene Oil'],
  ['p2', 'Light Diesel Oil (LDO)'],
]);

describe('sumRequestedByProduct', () => {
  it('1. sums repeated lines of the same product', () => {
    const totals = sumRequestedByProduct([
      { product_id: 'p1', quantity: 30 },
      { product_id: 'p2', quantity: 5 },
      { product_id: 'p1', quantity: 20 },
    ]);
    expect(totals.get('p1')).toBe(50);
    expect(totals.get('p2')).toBe(5);
  });

  it('2. empty items → empty map', () => {
    expect(sumRequestedByProduct([]).size).toBe(0);
  });
});

describe('findStockShortages', () => {
  it('3. selling less than on hand is allowed', () => {
    const s = findStockShortages(
      [{ product_id: 'p1', quantity: 40 }],
      new Map([['p1', 100]]),
      NAMES,
    );
    expect(s).toEqual([]);
  });

  it('4. selling exactly the remaining stock is allowed and lands on zero', () => {
    const s = findStockShortages(
      [{ product_id: 'p1', quantity: 100 }],
      new Map([['p1', 100]]),
      NAMES,
    );
    expect(s).toEqual([]);
  });

  it('5. selling one more than on hand is a shortage', () => {
    const s = findStockShortages(
      [{ product_id: 'p1', quantity: 101 }],
      new Map([['p1', 100]]),
      NAMES,
    );
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ product_name: 'Kerosene Oil', on_hand: 100, requested: 101 });
  });

  it('6. repeated lines are checked against the combined quantity', () => {
    // 60 + 50 = 110 against 100 on hand — neither line alone would trip
    const s = findStockShortages(
      [
        { product_id: 'p1', quantity: 60 },
        { product_id: 'p1', quantity: 50 },
      ],
      new Map([['p1', 100]]),
      NAMES,
    );
    expect(s).toHaveLength(1);
    expect(s[0].requested).toBe(110);
  });

  it('7. product with no movements counts as zero on hand', () => {
    const s = findStockShortages(
      [{ product_id: 'p1', quantity: 1 }],
      new Map(),
      NAMES,
    );
    expect(s[0]).toMatchObject({ on_hand: 0, requested: 1 });
  });

  it('8. already-negative stock rejects any further sale', () => {
    const s = findStockShortages(
      [{ product_id: 'p1', quantity: 1 }],
      new Map([['p1', -7128]]),
      NAMES,
    );
    expect(s).toHaveLength(1);
    expect(s[0].on_hand).toBe(-7128);
  });

  it('9. reports every short product, not just the first', () => {
    const s = findStockShortages(
      [
        { product_id: 'p1', quantity: 10 },
        { product_id: 'p2', quantity: 10 },
      ],
      new Map([
        ['p1', 0],
        ['p2', 5],
      ]),
      NAMES,
    );
    expect(s.map((x) => x.product_id).sort()).toEqual(['p1', 'p2']);
  });

  it('10. a short product does not mask an in-stock one', () => {
    const s = findStockShortages(
      [
        { product_id: 'p1', quantity: 10 },
        { product_id: 'p2', quantity: 1 },
      ],
      new Map([
        ['p1', 0],
        ['p2', 500],
      ]),
      NAMES,
    );
    expect(s).toHaveLength(1);
    expect(s[0].product_id).toBe('p1');
  });

  it('11. fractional quantities compare correctly', () => {
    expect(
      findStockShortages(
        [{ product_id: 'p1', quantity: 2.5 }],
        new Map([['p1', 2.5]]),
        NAMES,
      ),
    ).toEqual([]);

    expect(
      findStockShortages(
        [{ product_id: 'p1', quantity: 2.75 }],
        new Map([['p1', 2.5]]),
        NAMES,
      ),
    ).toHaveLength(1);
  });

  it('12. falls back to the product id when the name is unknown', () => {
    const s = findStockShortages(
      [{ product_id: 'unknown-id', quantity: 5 }],
      new Map(),
      NAMES,
    );
    expect(s[0].product_name).toBe('unknown-id');
  });
});

describe('formatShortageError', () => {
  it('13. names the product with both numbers', () => {
    const msg = formatShortageError([
      { product_id: 'p1', product_name: 'Kerosene Oil', on_hand: 0, requested: 50 },
    ]);
    expect(msg).toBe('Not enough stock. Kerosene Oil: 0 in stock, 50 requested.');
  });

  it('14. joins multiple shortages', () => {
    const msg = formatShortageError([
      { product_id: 'p1', product_name: 'Kerosene Oil', on_hand: 0, requested: 50 },
      { product_id: 'p2', product_name: 'Light Diesel Oil (LDO)', on_hand: 3, requested: 9 },
    ]);
    expect(msg).toContain('Kerosene Oil: 0 in stock, 50 requested');
    expect(msg).toContain('Light Diesel Oil (LDO): 3 in stock, 9 requested');
  });
});
