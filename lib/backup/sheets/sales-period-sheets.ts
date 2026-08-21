import type ExcelJS from 'exceljs';
import type { BackupDataset } from '@/lib/backup/dataset';
import { addSheet } from '@/lib/backup/sheet-writer';
import { TAB, paintBalance, paintStatus } from '@/lib/backup/xlsx-style';
import { DASH } from '@/lib/backup/sheets/labels';
import { plural } from '@/lib/pack';
import {
  PERIOD_KEYS, PERIOD_LABELS, periodStart, salesLines, totalsByKey, lastSaleByKey,
  daysSince, weekStart, monthStart, dateRangeDescending, changePercent,
  emptyTotals, addLine,
  type PeriodKey, type PeriodTotals, type SalesLineFacts,
} from '@/lib/backup/sales-periods';

/**
 * The sales sheets, all built from one pass over the invoice lines so every
 * one of them agrees about what "This Month" contains.
 */

/**
 * Only for cells this file formats by hand. Columns declared `kind: 'money'`
 * are handed raw paisa — writeMoney divides — so passing rupees there would
 * divide twice and report 52 where the books say 5,200.
 */
const rupees = (paisa: number) => paisa / 100;

/** How far back the day-by-day sheet goes. Longer than this is the month sheet's job. */
const DAILY_WINDOW_DAYS = 90;

type PeriodMap = Record<PeriodKey, PeriodTotals>;

function periodColumns<T>(
  totalsOf: (row: T) => PeriodMap,
  pick: (t: PeriodTotals) => number,
  kind: 'money' | 'qty',
) {
  return PERIOD_KEYS.map((key) => ({
    header: PERIOD_LABELS[key],
    kind,
    total: true,
    value: (row: T) => pick(totalsOf(row)[key]),
    width: 14,
  }));
}

// ───────────────────────────────────────────────
// 1. Sales Summary — one column per period, one row per metric
// ───────────────────────────────────────────────
export function addSalesSummarySheet(
  wb: ExcelJS.Workbook,
  d: BackupDataset,
  now: Date,
): void {
  const lines = salesLines(d);
  const totals = emptyTotals();
  for (const line of lines) addLine(totals, line, now);

  // Paid and outstanding are invoice-level facts, so they are summed from
  // invoices rather than lines — a payment settles a whole invoice.
  const paidByPeriod: Record<PeriodKey, { paid: number; total: number }> = Object.fromEntries(
    PERIOD_KEYS.map((k) => [k, { paid: 0, total: 0 }]),
  ) as Record<PeriodKey, { paid: number; total: number }>;

  for (const inv of d.invoices) {
    if (inv.status === 'draft' || inv.status === 'cancelled') continue;
    for (const key of PERIOD_KEYS) {
      const start = periodStart(key, now);
      if (start !== null && inv.issue_date < start) continue;
      paidByPeriod[key].paid += inv.paid_paisa;
      paidByPeriod[key].total += inv.total_paisa;
    }
  }

  type MetricRow = {
    label: string;
    kind: 'money' | 'qty' | 'int';
    of: (key: PeriodKey) => number;
  };

  const metrics: MetricRow[] = [
    { label: 'Total Sales', kind: 'money', of: (k) => rupees(totals[k].salesPaisa) },
    { label: 'Total Invoices', kind: 'int', of: (k) => totals[k].invoiceIds.size },
    { label: 'Qty Sold', kind: 'qty', of: (k) => totals[k].quantity },
    {
      label: 'Avg Invoice Value',
      kind: 'money',
      of: (k) => {
        const n = totals[k].invoiceIds.size;
        return n === 0 ? 0 : rupees(Math.round(totals[k].salesPaisa / n));
      },
    },
    { label: 'Total Paid', kind: 'money', of: (k) => rupees(paidByPeriod[k].paid) },
    {
      label: 'Outstanding',
      kind: 'money',
      of: (k) => rupees(paidByPeriod[k].total - paidByPeriod[k].paid),
    },
  ];

  addSheet(wb, {
    name: 'Sales Summary',
    tab: TAB.summary,
    businessName: d.businessName,
    rows: metrics,
    emptyNote: 'No sales yet.',
    columns: [
      { header: 'Metric', value: (m) => m.label, width: 22 },
      ...PERIOD_KEYS.map((key) => ({
        header: PERIOD_LABELS[key],
        // The column mixes money, counts and quantities down its length, so the
        // kind comes from the row rather than the column.
        kind: 'text' as const,
        value: (m: MetricRow) => m.of(key),
        width: 15,
        paint: (cell: ExcelJS.Cell, m: MetricRow) => {
          if (m.kind === 'money') cell.numFmt = '#,##,##0.00';
          else if (m.kind === 'qty') cell.numFmt = '#,##,##0.###';
          else cell.numFmt = '#,##,##0';
          cell.alignment = { horizontal: 'right' };
          if (m.label === 'Outstanding' && Number(cell.value) > 0) {
            paintBalance(cell, 1);
          }
        },
      })),
    ],
  });
}

// ───────────────────────────────────────────────
// 2. Sales by Product — quantity row, amount row beneath it
// ───────────────────────────────────────────────
export function addSalesByProductSheet(
  wb: ExcelJS.Workbook,
  d: BackupDataset,
  now: Date,
): void {
  const lines = salesLines(d);
  const byProduct = totalsByKey(lines, (l) => l.productId, now);
  const lastSale = lastSaleByKey(lines, (l) => l.productId);
  const stock = stockByProduct(d);

  type Row = {
    kind: 'qty' | 'amount';
    productId: string;
    name: string;
    brand: string;
    unit: string;
    totals: PeriodMap;
    lastSale: string | null;
    neverSold: boolean;
    dead: boolean;
  };

  const products = [...d.products].sort((a, b) => {
    const at = byProduct.get(a.id)?.all.salesPaisa ?? 0;
    const bt = byProduct.get(b.id)?.all.salesPaisa ?? 0;
    // Never-sold products sink, so the top of the sheet is the top sellers.
    return bt - at;
  });

  const rows: Row[] = [];
  for (const p of products) {
    const totals = byProduct.get(p.id) ?? emptyTotals();
    const last = lastSale.get(p.id) ?? null;
    const onHand = stock.get(p.id) ?? 0;
    const base = {
      productId: p.id,
      name: p.name,
      brand: p.brand_id ? d.brandName.get(p.brand_id) ?? DASH : DASH,
      unit: p.unit,
      totals,
      lastSale: last,
      neverSold: last === null,
      // Money standing still: stock on the shelf that has not moved in a month.
      dead: onHand > 0 && (last === null || daysSince(last, now) > 30),
    };
    rows.push({ ...base, kind: 'qty' });
    rows.push({ ...base, kind: 'amount' });
  }

  addSheet(wb, {
    name: 'Sales by Product',
    tab: TAB.summary,
    businessName: d.businessName,
    rows,
    emptyNote: 'No products yet.',
    rowStyle: () => 'normal',
    columns: [
      {
        header: 'Product',
        width: 30,
        value: (r) => (r.kind === 'qty' ? r.name : '  Amount'),
        paint: (cell, r) => {
          if (r.kind === 'amount') cell.font = { italic: true, color: { argb: 'FF6B7280' } };
          else if (r.neverSold) cell.font = { color: { argb: 'FFB91C1C' } };
        },
      },
      { header: 'Brand', width: 18, value: (r) => (r.kind === 'qty' ? r.brand : '') },
      { header: 'Unit', width: 8, value: (r) => (r.kind === 'qty' ? r.unit : '') },
      ...PERIOD_KEYS.map((key) => ({
        header: PERIOD_LABELS[key],
        kind: 'text' as const,
        width: 14,
        value: (r: Row) =>
          r.kind === 'qty' ? r.totals[key].quantity : rupees(r.totals[key].salesPaisa),
        paint: (cell: ExcelJS.Cell, r: Row) => {
          cell.numFmt = r.kind === 'qty' ? '#,##,##0.###' : '#,##,##0.00';
          cell.alignment = { horizontal: 'right' };
          if (r.kind === 'amount') cell.font = { color: { argb: 'FF6B7280' } };
        },
      })),
      {
        // Text rather than date: this column carries 'Never' and blanks, and a
        // date cell given either of those renders "Invalid Date".
        header: 'Last Sale',
        kind: 'text',
        width: 14,
        value: (r) => (r.kind === 'qty' ? r.lastSale ?? 'Never' : ''),
        paint: (cell, r) => {
          if (r.kind !== 'qty') return;
          if (r.neverSold) paintStatus(cell, 'bad');
          else if (r.dead) paintStatus(cell, 'warn');
        },
      },
    ],
  });
}

// ───────────────────────────────────────────────
// 3. Sales by Brand
// ───────────────────────────────────────────────
export function addSalesByBrandSheet(
  wb: ExcelJS.Workbook,
  d: BackupDataset,
  now: Date,
): void {
  const lines = salesLines(d);
  const productBrand = new Map(d.products.map((p) => [p.id, p.brand_id]));
  const byBrand = totalsByKey(lines, (l) => productBrand.get(l.productId) ?? '', now);

  const productCount = new Map<string, number>();
  for (const p of d.products) {
    const key = p.brand_id ?? '';
    productCount.set(key, (productCount.get(key) ?? 0) + 1);
  }

  type Row = {
    id: string; name: string; type: string; products: number; totals: PeriodMap;
  };

  const rows: Row[] = [...productCount.keys()]
    .map((id) => ({
      id,
      name: id ? d.brandName.get(id) ?? DASH : 'Unbranded',
      type: id ? brandTypeOf(d, id) : DASH,
      products: productCount.get(id) ?? 0,
      totals: byBrand.get(id) ?? emptyTotals(),
    }))
    .sort((a, b) => b.totals.all.salesPaisa - a.totals.all.salesPaisa);

  addSheet(wb, {
    name: 'Sales by Brand',
    tab: TAB.summary,
    businessName: d.businessName,
    rows,
    totals: true,
    emptyNote: 'No brands yet.',
    columns: [
      { header: 'Brand', width: 22, value: (r) => r.name },
      { header: 'Type', width: 16, value: (r) => r.type },
      { header: 'Products', kind: 'int', total: true, width: 10, value: (r) => r.products },
      ...periodColumns<Row>((r) => r.totals, (t) => t.salesPaisa, 'money'),
    ],
  });
}

function brandTypeOf(d: BackupDataset, brandId: string): string {
  const brand = d.brands.find((b) => b.id === brandId);
  if (!brand) return DASH;
  return brand.brand_type === 'local_dealer' ? 'Local Dealer' : 'Multinational';
}

// ───────────────────────────────────────────────
// 4. Sales by Customer
// ───────────────────────────────────────────────
export function addSalesByCustomerSheet(
  wb: ExcelJS.Workbook,
  d: BackupDataset,
  now: Date,
): void {
  const lines = salesLines(d);
  const byCustomer = totalsByKey(lines, (l) => l.customerId, now);

  type Row = {
    name: string; location: string; category: string;
    totals: PeriodMap; balance: number;
  };

  const rows: Row[] = d.customers
    .map((c) => ({
      name: c.name,
      location: c.location_id ? d.locationName.get(c.location_id) ?? DASH : DASH,
      category: c.category_id ? d.customerCategoryName.get(c.category_id) ?? DASH : DASH,
      totals: byCustomer.get(c.id) ?? emptyTotals(),
      balance: d.customerStats.get(c.id)?.balance ?? 0,
    }))
    .sort((a, b) => b.totals.all.salesPaisa - a.totals.all.salesPaisa);

  addSheet(wb, {
    name: 'Sales by Customer',
    tab: TAB.summary,
    businessName: d.businessName,
    rows,
    totals: true,
    emptyNote: 'No customers yet.',
    columns: [
      { header: 'Customer', width: 26, value: (r) => r.name },
      { header: 'Location', width: 16, value: (r) => r.location },
      { header: 'Category', width: 16, value: (r) => r.category },
      ...periodColumns<Row>((r) => r.totals, (t) => t.salesPaisa, 'money'),
      {
        header: 'Balance',
        kind: 'money',
        total: true,
        width: 14,
        value: (r) => r.balance,
        paint: (cell, r) => paintBalance(cell, r.balance),
      },
    ],
  });
}

// ───────────────────────────────────────────────
// 5. Sales by Day — every day in the window, including the quiet ones
// ───────────────────────────────────────────────
export function addSalesByDaySheet(
  wb: ExcelJS.Workbook,
  d: BackupDataset,
  now: Date,
): void {
  const lines = salesLines(d);
  const invoiceById = new Map(d.invoices.map((i) => [i.id, i]));

  type DayFacts = {
    invoices: Set<string>; quantity: number; sales: number; paid: number; total: number;
  };
  const byDay = new Map<string, DayFacts>();

  for (const line of lines) {
    const f = byDay.get(line.issueDate)
      ?? { invoices: new Set<string>(), quantity: 0, sales: 0, paid: 0, total: 0 };
    f.quantity += line.quantity;
    f.sales += line.netAmountPaisa;
    if (!f.invoices.has(line.invoiceId)) {
      f.invoices.add(line.invoiceId);
      const inv = invoiceById.get(line.invoiceId);
      if (inv) { f.paid += inv.paid_paisa; f.total += inv.total_paisa; }
    }
    byDay.set(line.issueDate, f);
  }

  const today = new Date(now).toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - (DAILY_WINDOW_DAYS - 1) * 86_400_000)
    .toISOString().slice(0, 10);

  type Row = {
    kind: 'day' | 'week' | 'month';
    label: string;
    day: string;
    weekday: string;
    invoices: number;
    quantity: number;
    sales: number;
    paid: number;
    outstanding: number;
  };

  const rows: Row[] = [];
  const days = dateRangeDescending(from, today);

  for (const [i, day] of days.entries()) {
    const f = byDay.get(day);
    rows.push({
      kind: 'day',
      label: day,
      day,
      weekday: weekdayName(day),
      invoices: f?.invoices.size ?? 0,
      quantity: f?.quantity ?? 0,
      sales: f?.sales ?? 0,
      paid: f?.paid ?? 0,
      outstanding: (f?.total ?? 0) - (f?.paid ?? 0),
    });

    const next = days[i + 1];
    // Rows run newest first, so a subtotal is emitted when the NEXT row crosses
    // out of the current week or month.
    if (!next || weekStart(next) !== weekStart(day)) {
      rows.push(subtotalRow('week', `Week of ${weekStart(day)}`, days, byDay, (x) => weekStart(x) === weekStart(day)));
    }
    if (!next || monthStart(next) !== monthStart(day)) {
      rows.push(subtotalRow('month', monthLabel(day), days, byDay, (x) => monthStart(x) === monthStart(day)));
    }
  }

  addSheet(wb, {
    name: 'Sales by Day',
    tab: TAB.summary,
    businessName: d.businessName,
    rows,
    emptyNote: 'No sales in the last 90 days.',
    rowStyle: (r) => (r.kind === 'month' ? 'grand' : r.kind === 'week' ? 'subtotal' : 'normal'),
    columns: [
      {
        header: 'Date',
        kind: 'text',
        width: 18,
        value: (r) => (r.kind === 'day' ? r.day : r.label),
      },
      { header: 'Day', width: 12, value: (r) => (r.kind === 'day' ? r.weekday : '') },
      { header: 'Invoices', kind: 'int', width: 10, value: (r) => r.invoices },
      { header: 'Qty Sold', kind: 'qty', width: 12, value: (r) => r.quantity },
      { header: 'Total Sales', kind: 'money', width: 15, value: (r) => r.sales },
      { header: 'Paid', kind: 'money', width: 14, value: (r) => r.paid },
      {
        header: 'Outstanding',
        kind: 'money',
        width: 14,
        value: (r) => r.outstanding,
        paint: (cell, r) => { if (r.outstanding > 0) paintBalance(cell, r.outstanding); },
      },
    ],
  });
}

function subtotalRow(
  kind: 'week' | 'month',
  label: string,
  days: string[],
  byDay: Map<string, { invoices: Set<string>; quantity: number; sales: number; paid: number; total: number }>,
  belongs: (day: string) => boolean,
) {
  let invoices = 0, quantity = 0, sales = 0, paid = 0, total = 0;
  for (const day of days) {
    if (!belongs(day)) continue;
    const f = byDay.get(day);
    if (!f) continue;
    invoices += f.invoices.size;
    quantity += f.quantity;
    sales += f.sales;
    paid += f.paid;
    total += f.total;
  }
  return {
    kind, label, day: '', weekday: '',
    invoices, quantity, sales, paid, outstanding: total - paid,
  };
}

function weekdayName(dateISO: string): string {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', timeZone: 'UTC',
  });
}

function monthLabel(dateISO: string): string {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

// ───────────────────────────────────────────────
// 6 & 7. Sales by Week / by Month
// ───────────────────────────────────────────────
export function addSalesByWeekSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  addBucketSheet(wb, d, 'Sales by Week', 'Week Starting', weekStart, 'vs Previous Week');
}

export function addSalesByMonthSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  addBucketSheet(wb, d, 'Sales by Month', 'Month', monthStart, 'vs Previous Month');
}

function addBucketSheet(
  wb: ExcelJS.Workbook,
  d: BackupDataset,
  name: string,
  firstHeader: string,
  bucketOf: (dateISO: string) => string,
  changeHeader: string,
): void {
  const lines = salesLines(d);
  const buckets = new Map<string, { invoices: Set<string>; quantity: number; sales: number }>();

  for (const line of lines) {
    const key = bucketOf(line.issueDate);
    const b = buckets.get(key) ?? { invoices: new Set<string>(), quantity: 0, sales: 0 };
    b.invoices.add(line.invoiceId);
    b.quantity += line.quantity;
    b.sales += line.netAmountPaisa;
    buckets.set(key, b);
  }

  // Ascending to compute each change against the one before, then reversed so
  // the newest period is at the top where the owner looks first.
  const ascending = [...buckets.keys()].sort();
  type Row = {
    key: string; invoices: number; quantity: number; sales: number; change: number | null;
  };

  const rows: Row[] = ascending
    .map((key, i) => {
      const b = buckets.get(key)!;
      const prev = i > 0 ? buckets.get(ascending[i - 1])!.sales : 0;
      return {
        key,
        invoices: b.invoices.size,
        quantity: b.quantity,
        sales: b.sales,
        change: i === 0 ? null : changePercent(b.sales, prev),
      };
    })
    .reverse();

  addSheet(wb, {
    name,
    tab: TAB.summary,
    businessName: d.businessName,
    rows,
    totals: true,
    emptyNote: 'No sales yet.',
    columns: [
      {
        header: firstHeader,
        width: 18,
        value: (r) => (name === 'Sales by Month' ? monthLabel(r.key) : r.key),
      },
      { header: 'Invoices', kind: 'int', total: true, width: 10, value: (r) => r.invoices },
      { header: 'Qty Sold', kind: 'qty', total: true, width: 12, value: (r) => r.quantity },
      { header: 'Total Sales', kind: 'money', total: true, width: 16, value: (r) => r.sales },
      {
        header: changeHeader,
        kind: 'text',
        width: 18,
        value: (r) => (r.change === null ? DASH : `${r.change >= 0 ? '▲' : '▼'} ${Math.abs(r.change).toFixed(1)}%`),
        paint: (cell, r) => {
          if (r.change === null) return;
          cell.font = { color: { argb: r.change >= 0 ? 'FF15803D' : 'FFB91C1C' }, bold: true };
          cell.alignment = { horizontal: 'right' };
        },
      },
    ],
  });
}

// ───────────────────────────────────────────────
// 8. Dead Stock
// ───────────────────────────────────────────────
export function addDeadStockSheet(
  wb: ExcelJS.Workbook,
  d: BackupDataset,
  now: Date,
): void {
  const lines = salesLines(d);
  const lastSale = lastSaleByKey(lines, (l) => l.productId);
  const stock = stockByProduct(d);

  type Row = {
    name: string; brand: string; onHand: number; valuePaisa: number;
    lastSale: string | null; days: number | null;
  };

  const rows: Row[] = d.products
    .map((p) => {
      const onHand = stock.get(p.id) ?? 0;
      const last = lastSale.get(p.id) ?? null;
      return {
        name: p.name,
        brand: p.brand_id ? d.brandName.get(p.brand_id) ?? DASH : DASH,
        onHand,
        valuePaisa: Math.round(onHand * p.sale_price_paisa),
        lastSale: last,
        days: last === null ? null : daysSince(last, now),
      };
    })
    .filter((r) => r.onHand > 0 && (r.days === null || r.days > 30))
    // Sorted by the money standing still, not by how long it has stood.
    .sort((a, b) => b.valuePaisa - a.valuePaisa);

  addSheet(wb, {
    name: 'Dead Stock',
    tab: TAB.data,
    businessName: d.businessName,
    rows,
    totals: true,
    emptyNote: 'Nothing is sitting still — every product with stock has sold in the last 30 days.',
    columns: [
      { header: 'Product', width: 30, value: (r) => r.name },
      { header: 'Brand', width: 20, value: (r) => r.brand },
      { header: 'Stock', kind: 'qty', total: true, width: 10, value: (r) => r.onHand },
      { header: 'Stock Value', kind: 'money', total: true, width: 16, value: (r) => r.valuePaisa },
      {
        // Text, not date: the column carries "Never sold" for products that
        // have none, and a date cell given a non-date renders "Invalid Date".
        header: 'Last Sale',
        kind: 'text',
        width: 14,
        value: (r) => r.lastSale ?? 'Never sold',
        paint: (cell, r) => { if (r.lastSale === null) paintStatus(cell, 'bad'); },
      },
      {
        header: 'Days Since Sale',
        kind: 'text',
        width: 16,
        value: (r) => (r.days === null ? 'Never sold' : `${r.days} days`),
        paint: (cell, r) => {
          cell.alignment = { horizontal: 'right' };
          if (r.days === null) paintStatus(cell, 'bad');
        },
      },
    ],
  });
}

/** Net stock per product, using the same arithmetic as the current_stock view. */
export function stockByProduct(d: BackupDataset): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of d.stockMovements) {
    const delta = m.type === 'out' ? -m.quantity : m.quantity;
    out.set(m.product_id, (out.get(m.product_id) ?? 0) + delta);
  }
  return out;
}

export type { SalesLineFacts };

// ───────────────────────────────────────────────
// 9. Stock Report — what is on the shelf and what it is worth
// ───────────────────────────────────────────────
export function addStockReportSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  const stock = stockByProduct(d);

  type Row = {
    isSubtotal: boolean;
    brand: string;
    name: string;
    sku: string;
    unit: string;
    packInfo: string;
    onHand: number;
    salePaisa: number;
    valuePaisa: number;
    costPaisa: number;
    costValuePaisa: number;
    status: 'ok' | 'low' | 'out';
    threshold: number;
  };

  // Grouped by brand so the subtotals mean something, with Unbranded last.
  const byBrand = new Map<string, typeof d.products>();
  for (const p of d.products) {
    const key = p.brand_id ? d.brandName.get(p.brand_id) ?? DASH : 'Unbranded';
    byBrand.set(key, [...(byBrand.get(key) ?? []), p]);
  }
  const brandNames = [...byBrand.keys()].sort((a, b) => {
    if (a === 'Unbranded') return 1;
    if (b === 'Unbranded') return -1;
    return a.localeCompare(b);
  });

  const rows: Row[] = [];

  for (const brand of brandNames) {
    const products = [...(byBrand.get(brand) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    let brandValue = 0;
    let brandCostValue = 0;
    let brandStock = 0;

    for (const p of products) {
      const onHand = stock.get(p.id) ?? 0;
      const threshold = p.low_stock_threshold ?? 0;
      const value = Math.round(onHand * p.sale_price_paisa);
      const costValue = Math.round(onHand * p.purchase_price_paisa);

      brandValue += value;
      brandCostValue += costValue;
      brandStock += onHand;

      rows.push({
        isSubtotal: false,
        brand,
        name: p.name,
        sku: p.sku ?? DASH,
        unit: p.unit,
        packInfo: packInfoOf(onHand, p.pack_size, p.pack_name),
        onHand,
        salePaisa: p.sale_price_paisa,
        valuePaisa: value,
        costPaisa: p.purchase_price_paisa,
        costValuePaisa: costValue,
        status: onHand <= 0 ? 'out' : onHand <= threshold ? 'low' : 'ok',
        threshold,
      });
    }

    rows.push({
      isSubtotal: true,
      brand, name: `${brand} — subtotal`, sku: '', unit: '', packInfo: '',
      onHand: brandStock, salePaisa: 0, valuePaisa: brandValue,
      costPaisa: 0, costValuePaisa: brandCostValue, status: 'ok', threshold: 0,
    });
  }

  addSheet(wb, {
    name: 'Stock Report',
    tab: TAB.data,
    businessName: d.businessName,
    rows,
    totals: true,
    emptyNote: 'No products yet.',
    rowStyle: (r) => (r.isSubtotal ? 'subtotal' : 'normal'),
    columns: [
      { header: 'Product', width: 30, value: (r) => r.name },
      { header: 'Brand', width: 18, value: (r) => (r.isSubtotal ? '' : r.brand) },
      { header: 'SKU', width: 14, value: (r) => r.sku },
      { header: 'Unit', width: 8, value: (r) => r.unit },
      { header: 'Stock', kind: 'qty', total: true, width: 10, value: (r) => r.onHand },
      { header: 'Pack Info', width: 18, value: (r) => r.packInfo },
      {
        header: 'Sale Price',
        kind: 'money',
        width: 13,
        value: (r) => (r.isSubtotal ? null : r.salePaisa),
      },
      { header: 'Stock Value', kind: 'money', total: true, width: 16, value: (r) => r.valuePaisa },
      // Iron rule #3: for staff and viewer these two columns are not written at
      // all, rather than written blank.
      d.showCost
        ? { header: 'Cost', kind: 'money' as const, width: 13, value: (r: Row) => (r.isSubtotal ? null : r.costPaisa) }
        : null,
      d.showCost
        ? { header: 'Cost Value', kind: 'money' as const, total: true, width: 16, value: (r: Row) => r.costValuePaisa }
        : null,
      {
        header: 'Status',
        width: 12,
        value: (r) => (r.isSubtotal ? '' : r.status === 'out' ? 'Out' : r.status === 'low' ? 'Low' : 'OK'),
        paint: (cell, r) => {
          if (r.isSubtotal) return;
          paintStatus(cell, r.status === 'out' ? 'bad' : r.status === 'low' ? 'warn' : 'good');
        },
      },
    ],
  });
}

/** "20 boxes of 12", or a dash when the product has no pack. */
function packInfoOf(onHand: number, packSize: number, packName: string | null): string {
  if (!packName || packSize <= 1) return DASH;
  const packs = Math.floor(Math.max(onHand, 0) / packSize);
  if (packs <= 0) return `${packName} of ${packSize}`;
  return `${packs} ${plural(packName, packs)} of ${packSize}`;
}
