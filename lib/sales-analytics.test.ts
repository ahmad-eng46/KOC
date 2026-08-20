import { describe, it, expect } from 'vitest';
import {
  toSalesLine, toProductPeriodRow, summarise, percentChange, previousRange,
  byBrand, byCustomer, byLocation, trendSeries, trendSeriesByBrand,
  trendOf, productTrend, deadStock, lastSaleByKey, productPeriodsFromLines,
  type SalesLine, type ProductPeriodRow,
} from '@/lib/sales-analytics';

function line(over: Partial<SalesLine> = {}): SalesLine {
  return {
    line_item_id: 'l1', invoice_id: 'i1', invoice_number: 'INV-1',
    issue_date: '2026-08-10', invoice_status: 'issued',
    customer_id: 'c1', customer_name: 'Ali',
    location_id: 'loc1', location_name: 'Rajana',
    product_id: 'p1', product_name: 'DH Motor Oil', product_sku: 'OIL-1', product_unit: 'can',
    brand_id: 'b1', brand_name: 'Double Horse', brand_type: 'multinational',
    quantity: 4, returned_quantity: 0, net_quantity: 4,
    unit_price_paisa: 200000, line_total_paisa: 800000,
    discount_share_paisa: 80000, effective_amount_paisa: 720000,
    returned_amount_paisa: 0, net_amount_paisa: 720000,
    cost_price_paisa: 150000, profit_paisa: 120000,
    sale_date: '2026-08-10', sale_week: '2026-08-10', sale_month: '2026-08-01',
    ...over,
  };
}

function product(over: Partial<ProductPeriodRow> = {}): ProductPeriodRow {
  return {
    product_id: 'p1', product_name: 'DH Motor Oil', product_sku: 'OIL-1', product_unit: 'can',
    pack_size: 12, pack_name: 'Box', is_active: true,
    sale_price_paisa: 220000, purchase_price_paisa: 150000,
    brand_id: 'b1', brand_name: 'Double Horse', brand_type: 'multinational',
    stock_on_hand: 100,
    qty_7d: 0, sales_7d_paisa: 0, invoices_7d: 0,
    qty_15d: 0, sales_15d_paisa: 0, invoices_15d: 0,
    qty_30d: 0, sales_30d_paisa: 0, invoices_30d: 0,
    qty_prev_30d: 0, sales_prev_30d_paisa: 0,
    qty_90d: 0, sales_90d_paisa: 0, invoices_90d: 0,
    qty_180d: 0, sales_180d_paisa: 0,
    qty_365d: 0, sales_365d_paisa: 0,
    qty_all: 0, sales_all_paisa: 0, invoices_all: 0,
    profit_all_paisa: 0, profit_30d_paisa: 0,
    last_sale_date: '2026-08-10', days_since_last_sale: 10,
    avg_daily_qty_30d: 0,
    ...over,
  };
}

describe('toSalesLine', () => {
  it('coerces the strings supabase-js returns for BIGINT and NUMERIC', () => {
    const l = toSalesLine({
      line_item_id: 'l1', invoice_id: 'i1', product_id: 'p1',
      net_amount_paisa: '720000', net_quantity: '4.000', profit_paisa: '120000',
    });
    expect(l.net_amount_paisa).toBe(720000);
    expect(l.net_quantity).toBe(4);
    expect(l.profit_paisa).toBe(120000);
  });

  it('keeps a NULL cost null instead of turning it into zero', () => {
    const l = toSalesLine({ cost_price_paisa: null, profit_paisa: null });
    expect(l.cost_price_paisa).toBeNull();
    expect(l.profit_paisa).toBeNull();
  });

  it('does not let a malformed number become NaN', () => {
    expect(toSalesLine({ net_amount_paisa: 'oops' }).net_amount_paisa).toBe(0);
  });
});

describe('toProductPeriodRow', () => {
  it('defaults a missing pack size to 1 rather than 0', () => {
    expect(toProductPeriodRow({ pack_size: 0 }).pack_size).toBe(1);
    expect(toProductPeriodRow({}).pack_size).toBe(1);
  });

  it('preserves a null last sale — never sold is not "sold today"', () => {
    const r = toProductPeriodRow({ last_sale_date: null, days_since_last_sale: null });
    expect(r.last_sale_date).toBeNull();
    expect(r.days_since_last_sale).toBeNull();
  });
});

describe('summarise', () => {
  it('totals net amounts and counts distinct invoices', () => {
    const s = summarise([
      line({ invoice_id: 'i1', net_amount_paisa: 720000, net_quantity: 4 }),
      line({ invoice_id: 'i1', net_amount_paisa: 180000, net_quantity: 2 }),
      line({ invoice_id: 'i2', net_amount_paisa: 100000, net_quantity: 1 }),
    ]);
    expect(s.salesPaisa).toBe(1000000);
    expect(s.quantity).toBe(7);
    expect(s.invoiceCount).toBe(2);
    expect(s.lineCount).toBe(3);
    expect(s.averageInvoicePaisa).toBe(500000);
  });

  it('is all zeros, not NaN, for no sales at all', () => {
    const s = summarise([]);
    expect(s).toMatchObject({ salesPaisa: 0, quantity: 0, invoiceCount: 0, averageInvoicePaisa: 0 });
  });

  it('reports profit as null when cost is invisible, never as zero', () => {
    const s = summarise([line({ profit_paisa: null, cost_price_paisa: null })]);
    expect(s.profitPaisa).toBeNull();
  });

  it('sums profit when cost is visible', () => {
    const s = summarise([line({ profit_paisa: 120000 }), line({ profit_paisa: 60000 })]);
    expect(s.profitPaisa).toBe(180000);
  });
});

describe('percentChange', () => {
  it('computes a rise and a fall', () => {
    expect(percentChange(112, 100)).toBeCloseTo(12);
    expect(percentChange(97, 100)).toBeCloseTo(-3);
  });

  it('refuses to divide by a zero baseline', () => {
    expect(percentChange(5000, 0)).toBeNull();
  });
});

describe('previousRange', () => {
  it('returns the equally long span ending the day before', () => {
    // August is 31 days, so the matching span is all 31 days of July.
    expect(previousRange({ from: '2026-08-01', to: '2026-08-31' }))
      .toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('matches the length of a part-month range rather than the calendar month', () => {
    // 1-20 Aug is 20 days, so it compares against the 20 days before it.
    expect(previousRange({ from: '2026-08-01', to: '2026-08-20' }))
      .toEqual({ from: '2026-07-12', to: '2026-07-31' });
  });

  it('handles a single day', () => {
    expect(previousRange({ from: '2026-08-20', to: '2026-08-20' }))
      .toEqual({ from: '2026-08-19', to: '2026-08-19' });
  });
});

describe('byBrand', () => {
  const lines = [
    line({ brand_id: 'b1', brand_name: 'Double Horse', net_amount_paisa: 600000, net_quantity: 3, invoice_id: 'i1', product_id: 'p1' }),
    line({ brand_id: 'b1', brand_name: 'Double Horse', net_amount_paisa: 200000, net_quantity: 1, invoice_id: 'i2', product_id: 'p2' }),
    line({ brand_id: 'b2', brand_name: 'Shell', net_amount_paisa: 200000, net_quantity: 2, invoice_id: 'i1', product_id: 'p3' }),
  ];

  it('sorts by sales and counts distinct invoices and products', () => {
    const rows = byBrand(lines);
    expect(rows.map((r) => r.name)).toEqual(['Double Horse', 'Shell']);
    expect(rows[0]).toMatchObject({ salesPaisa: 800000, quantity: 4, invoiceCount: 2, productCount: 2 });
  });

  it('shares add up to 100', () => {
    const total = byBrand(lines).reduce((s, r) => s + r.sharePercent, 0);
    expect(total).toBeCloseTo(100);
  });

  it('names a missing brand rather than dropping the row', () => {
    const rows = byBrand([line({ brand_id: null, brand_name: null, net_amount_paisa: 5000 })]);
    expect(rows[0].name).toBe('Unbranded');
    expect(rows[0].salesPaisa).toBe(5000);
  });
});

describe('byCustomer / byLocation', () => {
  it('groups by customer', () => {
    const rows = byCustomer([
      line({ customer_id: 'c1', customer_name: 'Ali', net_amount_paisa: 300000 }),
      line({ customer_id: 'c2', customer_name: 'Hassan', net_amount_paisa: 500000 }),
    ]);
    expect(rows[0]).toMatchObject({ name: 'Hassan', salesPaisa: 500000 });
  });

  it('labels customers with no location instead of losing them', () => {
    const rows = byLocation([line({ location_id: null, location_name: null, net_amount_paisa: 1000 })]);
    expect(rows[0].name).toBe('No location');
  });
});

describe('lastSaleByKey', () => {
  it('keeps the latest date per key', () => {
    const map = lastSaleByKey(
      [
        line({ customer_id: 'c1', issue_date: '2026-08-01' }),
        line({ customer_id: 'c1', issue_date: '2026-08-15' }),
        line({ customer_id: 'c2', issue_date: '2026-07-04' }),
      ],
      (l) => l.customer_id,
    );
    expect(map.get('c1')).toBe('2026-08-15');
    expect(map.get('c2')).toBe('2026-07-04');
  });
});

describe('trendSeries', () => {
  it('buckets daily and sorts chronologically', () => {
    const points = trendSeries([
      line({ sale_date: '2026-08-11', net_amount_paisa: 100, net_quantity: 1 }),
      line({ sale_date: '2026-08-10', net_amount_paisa: 200, net_quantity: 2 }),
      line({ sale_date: '2026-08-10', net_amount_paisa: 300, net_quantity: 3 }),
    ], 'daily');
    expect(points).toEqual([
      { date: '2026-08-10', quantity: 5, amountPaisa: 500 },
      { date: '2026-08-11', quantity: 1, amountPaisa: 100 },
    ]);
  });

  it('buckets monthly', () => {
    const points = trendSeries([
      line({ sale_month: '2026-07-01', net_amount_paisa: 100 }),
      line({ sale_month: '2026-08-01', net_amount_paisa: 400 }),
    ], 'monthly');
    expect(points.map((p) => p.date)).toEqual(['2026-07-01', '2026-08-01']);
  });

  it('splits one series per brand', () => {
    const series = trendSeriesByBrand([
      line({ brand_id: 'b1', brand_name: 'DH', sale_date: '2026-08-10', net_amount_paisa: 100 }),
      line({ brand_id: 'b2', brand_name: 'Shell', sale_date: '2026-08-10', net_amount_paisa: 200 }),
    ], 'daily');
    expect(series).toHaveLength(2);
    expect(series.find((s) => s.brandName === 'Shell')!.points[0].amountPaisa).toBe(200);
  });
});

describe('trendOf', () => {
  it('ignores movement inside the tolerance band', () => {
    expect(trendOf(102, 100)).toBe('flat');
    expect(trendOf(98, 100)).toBe('flat');
  });

  it('reports a real rise and a real fall', () => {
    expect(trendOf(130, 100)).toBe('up');
    expect(trendOf(70, 100)).toBe('down');
  });

  it('calls a product that has never sold flat, not up', () => {
    expect(trendOf(0, 0)).toBe('flat');
  });

  it('calls a first-ever sale a rise', () => {
    expect(trendOf(5000, 0)).toBe('up');
  });

  it('reads the two 30-day windows off a product row', () => {
    expect(productTrend(product({ sales_30d_paisa: 92800, sales_prev_30d_paisa: 60000 }))).toBe('up');
    expect(productTrend(product({ sales_30d_paisa: 30000, sales_prev_30d_paisa: 60000 }))).toBe('down');
  });
});

describe('deadStock', () => {
  const rows = [
    product({ product_id: 'sold', days_since_last_sale: 3, stock_on_hand: 50 }),
    product({ product_id: 'stale', days_since_last_sale: 45, stock_on_hand: 138, sale_price_paisa: 65000 }),
    product({ product_id: 'never', days_since_last_sale: null, last_sale_date: null, stock_on_hand: 19, sale_price_paisa: 4500000 }),
    product({ product_id: 'nostock', days_since_last_sale: 200, stock_on_hand: 0 }),
  ];

  it('keeps only products holding stock that have not sold in the window', () => {
    expect(deadStock(rows, 30).map((r) => r.product_id)).toEqual(['never', 'stale']);
  });

  it('treats never-sold as dead at every window length, and flags it', () => {
    const never = deadStock(rows, 90).find((r) => r.product_id === 'never')!;
    expect(never.neverSold).toBe(true);
  });

  it('sorts by the money standing still, not by how long', () => {
    const values = deadStock(rows, 30).map((r) => r.stockValuePaisa);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(values[0]).toBe(19 * 4500000);
  });

  it('values stock at sale price, and at cost too when cost is visible', () => {
    const stale = deadStock(rows, 30).find((r) => r.product_id === 'stale')!;
    expect(stale.stockValuePaisa).toBe(138 * 65000);
    expect(stale.stockCostValuePaisa).toBe(138 * 150000);
  });

  it('omits the cost valuation entirely when cost is invisible', () => {
    const staff = deadStock([product({ days_since_last_sale: 60, purchase_price_paisa: null })], 30);
    expect(staff[0].stockCostValuePaisa).toBeNull();
  });

  it('excludes a product with no stock even if it has never sold', () => {
    const none = deadStock([product({ stock_on_hand: 0, last_sale_date: null, days_since_last_sale: null })], 30);
    expect(none).toHaveLength(0);
  });
});

describe('productPeriodsFromLines', () => {
  const TODAY = new Date('2026-08-20T12:00:00Z');
  const daysAgo = (n: number) =>
    new Date(Date.UTC(2026, 7, 20) - n * 86_400_000).toISOString().slice(0, 10);

  it('places each line in every window that contains it', () => {
    const rows = productPeriodsFromLines(
      [
        line({ issue_date: daysAgo(2),   net_quantity: 1, net_amount_paisa: 1000 }),
        line({ issue_date: daysAgo(10),  net_quantity: 2, net_amount_paisa: 2000 }),
        line({ issue_date: daysAgo(45),  net_quantity: 4, net_amount_paisa: 4000 }),
        line({ issue_date: daysAgo(200), net_quantity: 8, net_amount_paisa: 8000 }),
      ],
      [],
      TODAY,
    );
    const r = rows[0];
    expect(r.qty_7d).toBe(1);
    expect(r.qty_15d).toBe(3);
    expect(r.qty_30d).toBe(3);
    expect(r.qty_90d).toBe(7);
    expect(r.qty_365d).toBe(15);
    expect(r.qty_all).toBe(15);
  });

  it('puts a 45-day-old sale in the previous 30-day window, not the current one', () => {
    const rows = productPeriodsFromLines(
      [line({ issue_date: daysAgo(45), net_quantity: 4, net_amount_paisa: 4000 })],
      [], TODAY,
    );
    expect(rows[0].qty_30d).toBe(0);
    expect(rows[0].qty_prev_30d).toBe(4);
  });

  it('agrees with the database windows: a sale exactly 30 days old is outside the 30-day window', () => {
    const rows = productPeriodsFromLines(
      [line({ issue_date: daysAgo(30), net_quantity: 5, net_amount_paisa: 5000 })],
      [], TODAY,
    );
    expect(rows[0].qty_30d).toBe(0);
    expect(rows[0].qty_prev_30d).toBe(5);
  });

  it('takes stock and price from the rollup, which lines do not carry', () => {
    const rows = productPeriodsFromLines(
      [line({ product_id: 'p1', net_quantity: 1, net_amount_paisa: 1000 })],
      [product({ product_id: 'p1', stock_on_hand: 138, sale_price_paisa: 65000 })],
      TODAY,
    );
    expect(rows[0].stock_on_hand).toBe(138);
    expect(rows[0].sale_price_paisa).toBe(65000);
  });

  it('still produces a row when the product is missing from the rollup', () => {
    const rows = productPeriodsFromLines([line({ product_id: 'ghost' })], [], TODAY);
    expect(rows[0].product_id).toBe('ghost');
    expect(rows[0].stock_on_hand).toBe(0);
  });

  it('reports profit as null when cost is invisible', () => {
    const rows = productPeriodsFromLines([line({ profit_paisa: null })], [], TODAY);
    expect(rows[0].profit_all_paisa).toBeNull();
  });

  it('counts distinct invoices, not lines', () => {
    const rows = productPeriodsFromLines(
      [
        line({ issue_date: daysAgo(1), invoice_id: 'i1' }),
        line({ issue_date: daysAgo(1), invoice_id: 'i1' }),
        line({ issue_date: daysAgo(1), invoice_id: 'i2' }),
      ],
      [], TODAY,
    );
    expect(rows[0].invoices_7d).toBe(2);
  });
});
