import { describe, it, expect } from 'vitest';
import {
  buildAssetBreakdown,
  buildSubTypeShares,
  buildMonthlyTrend,
  buildHeadline,
  capShares,
  monthKeyAgo,
} from './expense-analytics';
import type { ExpenseSummaryRow } from '@/lib/queries/expense-assets';

// Fixed "now": 8 Aug 2026 — matches the project clock.
const NOW = new Date('2026-08-08T12:00:00Z');
const R = (rupees: number) => rupees * 100;

function row(partial: Partial<ExpenseSummaryRow>): ExpenseSummaryRow {
  return {
    type: 'business',
    category: 'Transport',
    asset_id: 'car-1',
    asset_name: 'Car LHR-1234',
    asset_type: 'car',
    sub_type_id: 'st-1',
    sub_type_name: 'Petrol',
    expense_month: '2026-08-01',
    transaction_count: 1,
    total_paisa: 0,
    ...partial,
  };
}

const FIXTURE: ExpenseSummaryRow[] = [
  // Car: petrol Aug (this month), oil change Jul (last month, filed as Maintenance),
  // petrol Mar (inside 6M, outside 3M), petrol Nov 2025 (outside year)
  row({ expense_month: '2026-08-01', sub_type_name: 'Petrol', total_paisa: R(8_000) }),
  row({ expense_month: '2026-07-01', sub_type_name: 'Oil Change', category: 'Maintenance', total_paisa: R(4_000) }),
  row({ expense_month: '2026-03-01', sub_type_name: 'Petrol', total_paisa: R(3_000) }),
  row({ expense_month: '2025-11-01', sub_type_name: 'Petrol', total_paisa: R(5_000) }),
  // Shop rent: Aug + Jul
  row({ asset_id: 'shop-1', asset_name: 'Shop 1 Rajana', category: 'Rent', sub_type_name: 'Monthly Rent', expense_month: '2026-08-01', total_paisa: R(25_000) }),
  row({ asset_id: 'shop-1', asset_name: 'Shop 1 Rajana', category: 'Rent', sub_type_name: 'Monthly Rent', expense_month: '2026-07-01', total_paisa: R(25_000) }),
  // Untracked food expense, this month
  row({ asset_id: null, asset_name: null, sub_type_id: null, sub_type_name: null, category: 'Food', expense_month: '2026-08-01', total_paisa: R(3_000) }),
];

describe('monthKeyAgo', () => {
  it('produces first-of-month keys', () => {
    expect(monthKeyAgo(NOW, 0)).toBe('2026-08-01');
    expect(monthKeyAgo(NOW, 1)).toBe('2026-07-01');
    expect(monthKeyAgo(NOW, 12)).toBe('2025-08-01');
  });
});

describe('buildAssetBreakdown', () => {
  it('computes every period column for the car', () => {
    const rows = buildAssetBreakdown(FIXTURE, NOW);
    const car = rows.find((r) => r.key === 'car-1')!;
    expect(car.periods.thisMonth).toBe(R(8_000));
    expect(car.periods.lastMonth).toBe(R(4_000));
    expect(car.periods.threeMonths).toBe(R(12_000));     // Aug + Jul (Jun empty)
    expect(car.periods.sixMonths).toBe(R(15_000));       // + Mar
    expect(car.periods.year).toBe(R(15_000));            // Nov 2025 excluded
    expect(car.periods.total).toBe(R(20_000));           // everything
  });

  it('merges Transport and Maintenance under the one vehicle', () => {
    const car = buildAssetBreakdown(FIXTURE, NOW).find((r) => r.key === 'car-1')!;
    expect(car.category).toBe('Maintenance / Transport');
    // the Jul oil change (Maintenance) is inside lastMonth above — already proven
  });

  it('buckets asset-less rows as Untracked', () => {
    const un = buildAssetBreakdown(FIXTURE, NOW).find((r) => r.key === 'untracked')!;
    expect(un.assetName).toBe('Untracked');
    expect(un.periods.thisMonth).toBe(R(3_000));
  });

  it('sorts by all-time total, largest first', () => {
    const rows = buildAssetBreakdown(FIXTURE, NOW);
    expect(rows[0].key).toBe('shop-1'); // 50,000 beats the car's 20,000
  });
});

describe('buildSubTypeShares', () => {
  it('splits the car by sub-type with integer percents', () => {
    const shares = buildSubTypeShares(FIXTURE, 'car-1', NOW, 'total');
    expect(shares).toEqual([
      { name: 'Petrol', paisa: R(16_000), pct: 80 },
      { name: 'Oil Change', paisa: R(4_000), pct: 20 },
    ]);
  });

  it('is empty for an unknown asset', () => {
    expect(buildSubTypeShares(FIXTURE, 'nope', NOW)).toEqual([]);
  });
});

describe('capShares', () => {
  it('folds the tail into Other keeping paisa exact', () => {
    const shares = [
      { name: 'A', paisa: 500, pct: 50 },
      { name: 'B', paisa: 300, pct: 30 },
      { name: 'C', paisa: 150, pct: 15 },
      { name: 'D', paisa: 50, pct: 5 },
    ];
    const capped = capShares(shares, 3);
    expect(capped).toHaveLength(3);
    expect(capped[2]).toEqual({ name: 'Other', paisa: 200, pct: 20 });
  });

  it('leaves short lists alone', () => {
    const shares = [{ name: 'A', paisa: 1, pct: 100 }];
    expect(capShares(shares, 5)).toEqual(shares);
  });
});

describe('buildMonthlyTrend', () => {
  it('zero-fills empty months, oldest first', () => {
    const points = buildMonthlyTrend(FIXTURE, NOW, 12);
    expect(points).toHaveLength(12);
    expect(points[0].month).toBe('2025-09-01');
    expect(points[11].month).toBe('2026-08-01');
    expect(points[11].paisa).toBe(R(36_000)); // 8k car + 25k shop + 3k food
    expect(points[10].paisa).toBe(R(29_000)); // Jul
    expect(points[5].paisa).toBe(0);          // Feb 2026 — nothing
  });

  it('filters to one asset when asked', () => {
    const points = buildMonthlyTrend(FIXTURE, NOW, 12, 'car-1');
    expect(points[11].paisa).toBe(R(8_000));
    // Nov 2025 is inside the 12-month window (2025-09..2026-08)
    expect(points.find((p) => p.month === '2025-11-01')!.paisa).toBe(R(5_000));
  });
});

describe('buildHeadline', () => {
  it('computes totals, winners and % change for a 1-month window', () => {
    const h = buildHeadline(FIXTURE, NOW, 1);
    expect(h.totalPaisa).toBe(R(36_000));
    expect(h.previousPaisa).toBe(R(29_000));
    expect(h.topCategory).toEqual({ name: 'Rent', paisa: R(25_000) });
    expect(h.topAsset).toEqual({ name: 'Shop 1 Rajana', paisa: R(25_000) });
    // (36000-29000)/29000 = 24.1% → 24
    expect(h.vsPreviousPct).toBe(24);
  });

  it('returns null % when the previous window is empty', () => {
    const only = [row({ expense_month: '2026-08-01', total_paisa: R(1_000) })];
    expect(buildHeadline(only, NOW, 1).vsPreviousPct).toBeNull();
  });

  it('never counts untracked rows as a top asset', () => {
    const h = buildHeadline(
      [row({ asset_id: null, asset_name: null, expense_month: '2026-08-01', total_paisa: R(99_000) })],
      NOW,
      1,
    );
    expect(h.topAsset).toBeNull();
    expect(h.totalPaisa).toBe(R(99_000));
  });
});
