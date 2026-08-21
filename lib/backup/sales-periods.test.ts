import { describe, it, expect } from 'vitest';
import {
  PERIOD_KEYS, periodStart, inPeriod, salesLines, totalsByKey, lastSaleByKey,
  daysSince, weekStart, monthStart, dateRangeDescending, changePercent,
  emptyTotals, addLine,
} from '@/lib/backup/sales-periods';
import type { BackupDataset } from '@/lib/backup/dataset';

// Friday 21 Aug 2026. Week starts Monday 17 Aug; month 01 Aug; year 01 Jan.
const NOW = new Date('2026-08-21T12:00:00Z');

describe('periodStart', () => {
  it('anchors each period to the calendar, not to a rolling window', () => {
    expect(periodStart('today', NOW)).toBe('2026-08-21');
    expect(periodStart('week', NOW)).toBe('2026-08-17');
    expect(periodStart('month', NOW)).toBe('2026-08-01');
    expect(periodStart('year', NOW)).toBe('2026-01-01');
    expect(periodStart('all', NOW)).toBeNull();
  });

  it('rolls the 3-month window, since there is no calendar unit for it', () => {
    expect(periodStart('quarter', NOW)).toBe('2026-05-24');
  });

  it('starts the week on Monday', () => {
    const monday = new Date('2026-08-17T12:00:00Z');
    const sunday = new Date('2026-08-23T12:00:00Z');
    expect(periodStart('week', monday)).toBe('2026-08-17');
    expect(periodStart('week', sunday)).toBe('2026-08-17');
  });
});

describe('inPeriod', () => {
  it('places a sale in every period that contains it', () => {
    const inside = PERIOD_KEYS.filter((k) => inPeriod('2026-08-21', k, NOW));
    expect(inside).toEqual(['today', 'week', 'month', 'quarter', 'year', 'all']);
  });

  it('excludes yesterday from Today but keeps it in the week', () => {
    expect(inPeriod('2026-08-20', 'today', NOW)).toBe(false);
    expect(inPeriod('2026-08-20', 'week', NOW)).toBe(true);
  });

  it('excludes last month from This Month', () => {
    expect(inPeriod('2026-07-31', 'month', NOW)).toBe(false);
    expect(inPeriod('2026-07-31', 'year', NOW)).toBe(true);
  });

  it('excludes last year from This Year but keeps it in All Time', () => {
    expect(inPeriod('2025-12-31', 'year', NOW)).toBe(false);
    expect(inPeriod('2025-12-31', 'all', NOW)).toBe(true);
  });

  it('excludes a future-dated invoice from every bounded period', () => {
    expect(inPeriod('2026-09-01', 'today', NOW)).toBe(false);
    expect(inPeriod('2026-09-01', 'month', NOW)).toBe(false);
  });
});

// ───────────────────────────────────────────────
function dataset(over: Partial<BackupDataset> = {}): BackupDataset {
  return {
    invoices: [], invoiceItems: [], returnItems: [],
    ...over,
  } as unknown as BackupDataset;
}

describe('salesLines', () => {
  it('shares the invoice discount across lines in proportion to their value', () => {
    const lines = salesLines(dataset({
      invoices: [{
        id: 'i1', customer_id: 'c1', issue_date: '2026-08-20', status: 'issued',
        subtotal_paisa: 1000000, discount_paisa: 100000,
      }],
      invoiceItems: [
        { id: 'a', invoice_id: 'i1', product_id: 'p1', quantity: 4, line_total_paisa: 800000 },
        { id: 'b', invoice_id: 'i1', product_id: 'p2', quantity: 2, line_total_paisa: 200000 },
      ],
    } as unknown as Partial<BackupDataset>));

    expect(lines.map((l) => l.netAmountPaisa)).toEqual([720000, 180000]);
    // The shares add back up to the invoice's own discount.
    expect(800000 + 200000 - (720000 + 180000)).toBe(100000);
  });

  it('nets returns off both quantity and amount', () => {
    const lines = salesLines(dataset({
      invoices: [{
        id: 'i1', customer_id: 'c1', issue_date: '2026-08-20', status: 'issued',
        subtotal_paisa: 800000, discount_paisa: 0,
      }],
      invoiceItems: [
        { id: 'a', invoice_id: 'i1', product_id: 'p1', quantity: 4, line_total_paisa: 800000 },
      ],
      returnItems: [
        { invoice_item_id: 'a', quantity: 1, return_price_paisa: 200000 },
      ],
    } as unknown as Partial<BackupDataset>));

    expect(lines[0].quantity).toBe(3);
    expect(lines[0].netAmountPaisa).toBe(600000);
  });

  it('drops draft and cancelled invoices', () => {
    const lines = salesLines(dataset({
      invoices: [
        { id: 'd', customer_id: 'c', issue_date: '2026-08-20', status: 'draft', subtotal_paisa: 100, discount_paisa: 0 },
        { id: 'x', customer_id: 'c', issue_date: '2026-08-20', status: 'cancelled', subtotal_paisa: 100, discount_paisa: 0 },
        { id: 'ok', customer_id: 'c', issue_date: '2026-08-20', status: 'paid', subtotal_paisa: 100, discount_paisa: 0 },
      ],
      invoiceItems: [
        { id: '1', invoice_id: 'd', product_id: 'p', quantity: 1, line_total_paisa: 100 },
        { id: '2', invoice_id: 'x', product_id: 'p', quantity: 1, line_total_paisa: 100 },
        { id: '3', invoice_id: 'ok', product_id: 'p', quantity: 1, line_total_paisa: 100 },
      ],
    } as unknown as Partial<BackupDataset>));

    expect(lines).toHaveLength(1);
    expect(lines[0].invoiceId).toBe('ok');
  });

  it('drops a line whose invoice is missing entirely', () => {
    const lines = salesLines(dataset({
      invoices: [],
      invoiceItems: [{ id: '1', invoice_id: 'gone', product_id: 'p', quantity: 1, line_total_paisa: 100 }],
    } as unknown as Partial<BackupDataset>));
    expect(lines).toEqual([]);
  });

  it('does not divide by zero on a zero-subtotal invoice', () => {
    const lines = salesLines(dataset({
      invoices: [{ id: 'i', customer_id: 'c', issue_date: '2026-08-20', status: 'issued', subtotal_paisa: 0, discount_paisa: 0 }],
      invoiceItems: [{ id: '1', invoice_id: 'i', product_id: 'p', quantity: 1, line_total_paisa: 0 }],
    } as unknown as Partial<BackupDataset>));
    expect(lines[0].netAmountPaisa).toBe(0);
  });
});

describe('totalsByKey', () => {
  const lines = [
    { invoiceId: 'i1', issueDate: '2026-08-21', productId: 'p1', customerId: 'c1', quantity: 5, netAmountPaisa: 500 },
    { invoiceId: 'i2', issueDate: '2026-08-18', productId: 'p1', customerId: 'c1', quantity: 3, netAmountPaisa: 300 },
    { invoiceId: 'i3', issueDate: '2026-03-01', productId: 'p2', customerId: 'c2', quantity: 9, netAmountPaisa: 900 },
  ];

  it('totals each period per key', () => {
    const byProduct = totalsByKey(lines, (l) => l.productId, NOW);
    expect(byProduct.get('p1')!.today.salesPaisa).toBe(500);
    expect(byProduct.get('p1')!.week.salesPaisa).toBe(800);
    expect(byProduct.get('p1')!.all.quantity).toBe(8);
    // March is inside the year but outside the rolling 3 months.
    expect(byProduct.get('p2')!.quarter.salesPaisa).toBe(0);
    expect(byProduct.get('p2')!.year.salesPaisa).toBe(900);
  });

  it('counts invoices, not lines', () => {
    const two = [...lines, { ...lines[0], productId: 'p1' }];
    expect(totalsByKey(two, (l) => l.productId, NOW).get('p1')!.week.invoiceIds.size).toBe(2);
  });
});

describe('addLine', () => {
  it('leaves a future-dated sale out of every bounded period but keeps All Time', () => {
    const t = emptyTotals();
    addLine(t, { invoiceId: 'i', issueDate: '2027-01-01', productId: 'p', customerId: 'c', quantity: 1, netAmountPaisa: 100 }, NOW);
    expect(t.today.salesPaisa).toBe(0);
    expect(t.year.salesPaisa).toBe(0);
    expect(t.all.salesPaisa).toBe(100);
  });
});

describe('lastSaleByKey / daysSince', () => {
  it('keeps the latest date per key', () => {
    const map = lastSaleByKey(
      [
        { invoiceId: 'i', issueDate: '2026-07-06', productId: 'p1', customerId: 'c', quantity: 1, netAmountPaisa: 1 },
        { invoiceId: 'i', issueDate: '2026-08-20', productId: 'p1', customerId: 'c', quantity: 1, netAmountPaisa: 1 },
      ],
      (l) => l.productId,
    );
    expect(map.get('p1')).toBe('2026-08-20');
  });

  it('counts whole days since a date', () => {
    expect(daysSince('2026-08-21', NOW)).toBe(0);
    expect(daysSince('2026-07-06', NOW)).toBe(46);
  });
});

describe('calendar buckets', () => {
  it('snaps a date to its Monday and to its month start', () => {
    expect(weekStart('2026-08-21')).toBe('2026-08-17');
    expect(weekStart('2026-08-17')).toBe('2026-08-17');
    expect(monthStart('2026-08-21')).toBe('2026-08-01');
  });

  it('lists every day newest first, including days with no trade', () => {
    const days = dateRangeDescending('2026-08-19', '2026-08-21');
    expect(days).toEqual(['2026-08-21', '2026-08-20', '2026-08-19']);
  });

  it('returns nothing for a backwards range', () => {
    expect(dateRangeDescending('2026-08-21', '2026-08-19')).toEqual([]);
  });
});

describe('changePercent', () => {
  it('computes a rise and a fall', () => {
    expect(changePercent(112, 100)).toBeCloseTo(12);
    expect(changePercent(95, 100)).toBeCloseTo(-5);
  });

  it('refuses a zero baseline rather than reporting infinity', () => {
    expect(changePercent(500, 0)).toBeNull();
  });
});
