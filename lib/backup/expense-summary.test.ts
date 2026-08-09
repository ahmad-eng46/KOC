import { describe, it, expect } from 'vitest';
import { buildExpenseSummary } from '@/lib/backup/expense-summary';
import type { ExpenseRow } from '@/lib/backup/dataset';

const NOW = new Date('2026-08-09T17:22:00Z'); // 09 Aug 2026 in Karachi

function expense(over: Partial<ExpenseRow>): ExpenseRow {
  return {
    id: crypto.randomUUID(), type: 'business', category: 'Transport',
    asset_id: null, asset_name: 'Car LHR-1234', sub_type_name: 'Petrol',
    description: null, amount_paisa: 1_000_00, expense_date: '2026-08-02',
    include_in_pnl: true, receipt_url: null,
    ...over,
  };
}

describe('buildExpenseSummary', () => {
  it('buckets each expense into every period it falls in', () => {
    const rows = buildExpenseSummary([
      expense({ expense_date: '2026-08-02', amount_paisa: 1_000_00 }), // this month
      expense({ expense_date: '2026-07-15', amount_paisa: 500_00 }),   // last month
      expense({ expense_date: '2026-04-01', amount_paisa: 300_00 }),   // within 6 months
      expense({ expense_date: '2025-11-01', amount_paisa: 200_00 }),   // last year
    ], NOW);

    const car = rows.find((r) => r.kind === 'asset');
    expect(car?.periods).toEqual({
      thisMonth: 1_000_00,
      lastMonth: 500_00,
      threeMonths: 1_500_00,   // Jun, Jul, Aug
      sixMonths: 1_800_00,     // Mar–Aug
      year: 1_800_00,          // 2026 only
      total: 2_000_00,
    });
  });

  it('keeps last month to its own month, not "everything before now"', () => {
    const rows = buildExpenseSummary([
      expense({ expense_date: '2026-07-31', amount_paisa: 100_00 }),
      expense({ expense_date: '2026-08-01', amount_paisa: 900_00 }),
      expense({ expense_date: '2026-06-30', amount_paisa: 700_00 }),
    ], NOW);
    const car = rows.find((r) => r.kind === 'asset');
    expect(car?.periods.lastMonth).toBe(100_00);
    expect(car?.periods.thisMonth).toBe(900_00);
  });

  it('groups by category with a subtotal, then one grand total', () => {
    const rows = buildExpenseSummary([
      expense({ category: 'Transport', asset_name: 'Car LHR-1234', amount_paisa: 400_00 }),
      expense({ category: 'Transport', asset_name: 'Bike KHI-99', amount_paisa: 100_00 }),
      expense({ category: 'Rent', asset_name: 'Shop 1', amount_paisa: 900_00 }),
    ], NOW);

    expect(rows.map((r) => [r.kind, r.asset])).toEqual([
      ['asset', 'Shop 1'],
      ['subtotal', 'Rent total'],
      ['asset', 'Car LHR-1234'],
      ['asset', 'Bike KHI-99'],
      ['subtotal', 'Transport total'],
      ['grand', 'GRAND TOTAL'],
    ]);
    expect(rows.find((r) => r.kind === 'grand')?.periods.total).toBe(1_400_00);
    expect(rows.find((r) => r.asset === 'Transport total')?.periods.total).toBe(500_00);
  });

  it('collects expenses with no asset under one visible bucket', () => {
    const rows = buildExpenseSummary([
      expense({ category: 'Other', asset_name: null, amount_paisa: 50_00 }),
    ], NOW);
    expect(rows[0].asset).toBe('Not itemised');
  });

  it('returns nothing at all rather than an empty grand total', () => {
    expect(buildExpenseSummary([], NOW)).toEqual([]);
  });
});
