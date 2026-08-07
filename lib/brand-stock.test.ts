import { describe, it, expect } from 'vitest';
import {
  stockStatus, sortForReport, summarize, reorderItems,
  type BrandStockProduct,
} from './brand-stock';

const P = (name: string, stock: number, threshold: number | null): BrandStockProduct => ({
  name,
  stock,
  unit: 'can',
  sale_price_paisa: 100_000,
  status: stockStatus(stock, threshold),
});

describe('stockStatus', () => {
  it('matches the app-wide semantics', () => {
    expect(stockStatus(0, 5)).toBe('out_of_stock');
    expect(stockStatus(-2, 5)).toBe('out_of_stock');   // data error still reads as out
    expect(stockStatus(3, 5)).toBe('low');
    expect(stockStatus(5, 5)).toBe('low');             // boundary: at threshold = low
    expect(stockStatus(6, 5)).toBe('stocked');
    expect(stockStatus(1, 0)).toBe('stocked');         // threshold 0 = no low alert
    expect(stockStatus(1, null)).toBe('stocked');
  });
});

describe('sortForReport', () => {
  it('orders out-of-stock, then low, then A-Z within each group', () => {
    const rows = [
      P('DH Motor Oil', 45, 10),
      P('DH Gear Oil', 3, 5),
      P('DH Brake Fluid', 0, 5),
      P('DH ATF', 12, 5),
      P('DH Coolant', 2, 5),
    ];
    expect(sortForReport(rows).map((r) => r.name)).toEqual([
      'DH Brake Fluid',            // out
      'DH Coolant', 'DH Gear Oil', // low, A-Z
      'DH ATF', 'DH Motor Oil',    // stocked, A-Z
    ]);
  });
});

describe('summarize', () => {
  it('counts every bucket and clamps negatives out of the unit total', () => {
    const s = summarize([P('A', 45, 10), P('B', 3, 5), P('C', 0, 5), P('D', -2, 5)]);
    expect(s).toEqual({
      total_products: 4,
      total_stock: 48,        // 45 + 3 + 0 + max(-2,0)
      low_stock_count: 1,
      out_of_stock_count: 2,  // C and D
    });
  });
});

describe('reorderItems', () => {
  it('lists only low/out rows, out first, stock clamped to 0', () => {
    const items = reorderItems([P('A', 45, 10), P('Gear', 3, 5), P('Brake', -1, 5)]);
    expect(items).toEqual([
      { name: 'Brake', current_stock: 0, status: 'out_of_stock' },
      { name: 'Gear', current_stock: 3, status: 'low' },
    ]);
  });

  it('is empty when everything is stocked', () => {
    expect(reorderItems([P('A', 45, 10)])).toEqual([]);
  });
});
