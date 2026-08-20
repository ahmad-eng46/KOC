import type { Money } from '@/lib/money';
import type { DateRange } from '@/components/reports/shared';

/**
 * Every number the sales analytics screens show is produced here, from rows the
 * two database views hand over. Pure on purpose: the page, the PDF and the
 * Excel export all call these, so the three cannot report different totals for
 * the same period.
 */

export type SalesLine = {
  line_item_id: string;
  invoice_id: string;
  invoice_number: string;
  issue_date: string;
  invoice_status: string;
  customer_id: string | null;
  customer_name: string | null;
  location_id: string | null;
  location_name: string | null;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  product_unit: string | null;
  brand_id: string | null;
  brand_name: string | null;
  brand_type: string | null;
  quantity: number;
  returned_quantity: number;
  net_quantity: number;
  unit_price_paisa: Money;
  line_total_paisa: Money;
  discount_share_paisa: Money;
  effective_amount_paisa: Money;
  returned_amount_paisa: Money;
  net_amount_paisa: Money;
  /** null for staff and viewer — the view omits it, it is not hidden here. */
  cost_price_paisa: Money | null;
  profit_paisa: Money | null;
  sale_date: string;
  sale_week: string;
  sale_month: string;
};

export type ProductPeriodRow = {
  product_id: string;
  product_name: string;
  product_sku: string | null;
  product_unit: string | null;
  pack_size: number;
  pack_name: string | null;
  is_active: boolean;
  sale_price_paisa: Money;
  purchase_price_paisa: Money | null;
  brand_id: string | null;
  brand_name: string | null;
  brand_type: string | null;
  stock_on_hand: number;
  qty_7d: number;      sales_7d_paisa: Money;   invoices_7d: number;
  qty_15d: number;     sales_15d_paisa: Money;  invoices_15d: number;
  qty_30d: number;     sales_30d_paisa: Money;  invoices_30d: number;
  qty_prev_30d: number; sales_prev_30d_paisa: Money;
  qty_90d: number;     sales_90d_paisa: Money;  invoices_90d: number;
  qty_180d: number;    sales_180d_paisa: Money;
  qty_365d: number;    sales_365d_paisa: Money;
  qty_all: number;     sales_all_paisa: Money;  invoices_all: number;
  profit_all_paisa: Money | null;
  profit_30d_paisa: Money | null;
  last_sale_date: string | null;
  days_since_last_sale: number | null;
  avg_daily_qty_30d: number;
};

// ───────────────────────────────────────────────
// Row coercion. supabase-js hands BIGINT and NUMERIC back as string or number
// depending on magnitude, so every figure is forced through Number() once here
// rather than hopefully at each use.
// ───────────────────────────────────────────────
const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
const str = (v: unknown): string => String(v ?? '');
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export function toSalesLine(r: Record<string, unknown>): SalesLine {
  return {
    line_item_id: str(r.line_item_id),
    invoice_id: str(r.invoice_id),
    invoice_number: str(r.invoice_number),
    issue_date: str(r.issue_date),
    invoice_status: str(r.invoice_status),
    customer_id: strOrNull(r.customer_id),
    customer_name: strOrNull(r.customer_name),
    location_id: strOrNull(r.location_id),
    location_name: strOrNull(r.location_name),
    product_id: str(r.product_id),
    product_name: str(r.product_name),
    product_sku: strOrNull(r.product_sku),
    product_unit: strOrNull(r.product_unit),
    brand_id: strOrNull(r.brand_id),
    brand_name: strOrNull(r.brand_name),
    brand_type: strOrNull(r.brand_type),
    quantity: num(r.quantity),
    returned_quantity: num(r.returned_quantity),
    net_quantity: num(r.net_quantity),
    unit_price_paisa: num(r.unit_price_paisa),
    line_total_paisa: num(r.line_total_paisa),
    discount_share_paisa: num(r.discount_share_paisa),
    effective_amount_paisa: num(r.effective_amount_paisa),
    returned_amount_paisa: num(r.returned_amount_paisa),
    net_amount_paisa: num(r.net_amount_paisa),
    cost_price_paisa: numOrNull(r.cost_price_paisa),
    profit_paisa: numOrNull(r.profit_paisa),
    sale_date: str(r.sale_date),
    sale_week: str(r.sale_week),
    sale_month: str(r.sale_month),
  };
}

export function toProductPeriodRow(r: Record<string, unknown>): ProductPeriodRow {
  return {
    product_id: str(r.product_id),
    product_name: str(r.product_name),
    product_sku: strOrNull(r.product_sku),
    product_unit: strOrNull(r.product_unit),
    pack_size: num(r.pack_size) || 1,
    pack_name: strOrNull(r.pack_name),
    is_active: Boolean(r.is_active),
    sale_price_paisa: num(r.sale_price_paisa),
    purchase_price_paisa: numOrNull(r.purchase_price_paisa),
    brand_id: strOrNull(r.brand_id),
    brand_name: strOrNull(r.brand_name),
    brand_type: strOrNull(r.brand_type),
    stock_on_hand: num(r.stock_on_hand),
    qty_7d: num(r.qty_7d), sales_7d_paisa: num(r.sales_7d_paisa), invoices_7d: num(r.invoices_7d),
    qty_15d: num(r.qty_15d), sales_15d_paisa: num(r.sales_15d_paisa), invoices_15d: num(r.invoices_15d),
    qty_30d: num(r.qty_30d), sales_30d_paisa: num(r.sales_30d_paisa), invoices_30d: num(r.invoices_30d),
    qty_prev_30d: num(r.qty_prev_30d), sales_prev_30d_paisa: num(r.sales_prev_30d_paisa),
    qty_90d: num(r.qty_90d), sales_90d_paisa: num(r.sales_90d_paisa), invoices_90d: num(r.invoices_90d),
    qty_180d: num(r.qty_180d), sales_180d_paisa: num(r.sales_180d_paisa),
    qty_365d: num(r.qty_365d), sales_365d_paisa: num(r.sales_365d_paisa),
    qty_all: num(r.qty_all), sales_all_paisa: num(r.sales_all_paisa), invoices_all: num(r.invoices_all),
    profit_all_paisa: numOrNull(r.profit_all_paisa),
    profit_30d_paisa: numOrNull(r.profit_30d_paisa),
    last_sale_date: strOrNull(r.last_sale_date),
    days_since_last_sale: numOrNull(r.days_since_last_sale),
    avg_daily_qty_30d: num(r.avg_daily_qty_30d),
  };
}

// ───────────────────────────────────────────────
// Overview
// ───────────────────────────────────────────────
export type SalesSummary = {
  salesPaisa: Money;
  quantity: number;
  invoiceCount: number;
  lineCount: number;
  averageInvoicePaisa: Money;
  /** null when the caller may not see cost — never 0, which would read as "no profit". */
  profitPaisa: Money | null;
};

export function summarise(lines: readonly SalesLine[]): SalesSummary {
  const salesPaisa = sum(lines, (l) => l.net_amount_paisa);
  const invoiceCount = new Set(lines.map((l) => l.invoice_id)).size;
  const anyCostVisible = lines.some((l) => l.profit_paisa !== null);

  return {
    salesPaisa,
    quantity: sum(lines, (l) => l.net_quantity),
    invoiceCount,
    lineCount: lines.length,
    averageInvoicePaisa: invoiceCount === 0 ? 0 : Math.round(salesPaisa / invoiceCount),
    profitPaisa: anyCostVisible ? sum(lines, (l) => l.profit_paisa ?? 0) : null,
  };
}

/**
 * Percentage change, or null when there is no honest answer: growth from zero
 * is not "infinite percent", it is a new thing happening.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** The span of equal length immediately before `range`, for like-for-like comparison. */
export function previousRange(range: DateRange): DateRange {
  const from = new Date(range.from);
  const to = new Date(range.to);
  const spanDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);

  const prevTo = new Date(from.getTime() - 86_400_000);
  const prevFrom = new Date(prevTo.getTime() - (spanDays - 1) * 86_400_000);
  return { from: iso(prevFrom), to: iso(prevTo) };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

// ───────────────────────────────────────────────
// Groupings
// ───────────────────────────────────────────────
export type GroupRow = {
  id: string;
  name: string;
  salesPaisa: Money;
  quantity: number;
  invoiceCount: number;
  productCount: number;
  profitPaisa: Money | null;
  /** Share of the whole set's sales, 0–100. */
  sharePercent: number;
};

function groupBy(
  lines: readonly SalesLine[],
  keyOf: (l: SalesLine) => string | null,
  nameOf: (l: SalesLine) => string | null,
  fallbackName: string,
): GroupRow[] {
  type Acc = {
    id: string; name: string; salesPaisa: number; quantity: number;
    invoices: Set<string>; products: Set<string>; profit: number; costVisible: boolean;
  };
  const acc = new Map<string, Acc>();

  for (const l of lines) {
    const id = keyOf(l) ?? '';
    let a = acc.get(id);
    if (!a) {
      a = {
        id, name: nameOf(l) ?? fallbackName, salesPaisa: 0, quantity: 0,
        invoices: new Set(), products: new Set(), profit: 0, costVisible: false,
      };
      acc.set(id, a);
    }
    a.salesPaisa += l.net_amount_paisa;
    a.quantity += l.net_quantity;
    a.invoices.add(l.invoice_id);
    a.products.add(l.product_id);
    if (l.profit_paisa !== null) { a.profit += l.profit_paisa; a.costVisible = true; }
  }

  const total = sum(lines, (l) => l.net_amount_paisa);

  return [...acc.values()]
    .map((a) => ({
      id: a.id,
      name: a.name,
      salesPaisa: a.salesPaisa,
      quantity: a.quantity,
      invoiceCount: a.invoices.size,
      productCount: a.products.size,
      profitPaisa: a.costVisible ? a.profit : null,
      sharePercent: total === 0 ? 0 : (a.salesPaisa / total) * 100,
    }))
    .sort((x, y) => y.salesPaisa - x.salesPaisa);
}

export function byBrand(lines: readonly SalesLine[]): GroupRow[] {
  return groupBy(lines, (l) => l.brand_id, (l) => l.brand_name, 'Unbranded');
}

export function byCustomer(lines: readonly SalesLine[]): GroupRow[] {
  return groupBy(lines, (l) => l.customer_id, (l) => l.customer_name, 'Unknown customer');
}

export function byLocation(lines: readonly SalesLine[]): GroupRow[] {
  return groupBy(lines, (l) => l.location_id, (l) => l.location_name, 'No location');
}

export function byProduct(lines: readonly SalesLine[]): GroupRow[] {
  return groupBy(lines, (l) => l.product_id, (l) => l.product_name, 'Unknown product');
}

/** Last purchase date per group — used by the per-product customer table. */
export function lastSaleByKey(
  lines: readonly SalesLine[],
  keyOf: (l: SalesLine) => string | null,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of lines) {
    const k = keyOf(l) ?? '';
    const prev = out.get(k);
    if (!prev || l.issue_date > prev) out.set(k, l.issue_date);
  }
  return out;
}

// ───────────────────────────────────────────────
// Trend
// ───────────────────────────────────────────────
export type TrendPeriod = 'daily' | 'weekly' | 'monthly';
export type TrendPoint = { date: string; quantity: number; amountPaisa: Money };

export function trendSeries(lines: readonly SalesLine[], period: TrendPeriod): TrendPoint[] {
  const bucketOf = (l: SalesLine) =>
    period === 'daily' ? l.sale_date : period === 'weekly' ? l.sale_week : l.sale_month;

  const acc = new Map<string, TrendPoint>();
  for (const l of lines) {
    const date = bucketOf(l);
    if (!date) continue;
    const point = acc.get(date) ?? { date, quantity: 0, amountPaisa: 0 };
    point.quantity += l.net_quantity;
    point.amountPaisa += l.net_amount_paisa;
    acc.set(date, point);
  }
  return [...acc.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** One series per brand, for the multi-line chart. */
export function trendSeriesByBrand(
  lines: readonly SalesLine[],
  period: TrendPeriod,
): Array<{ brandId: string; brandName: string; points: TrendPoint[] }> {
  const brands = new Map<string, { name: string; lines: SalesLine[] }>();
  for (const l of lines) {
    const id = l.brand_id ?? '';
    const entry = brands.get(id) ?? { name: l.brand_name ?? 'Unbranded', lines: [] };
    entry.lines.push(l);
    brands.set(id, entry);
  }
  return [...brands.entries()].map(([brandId, e]) => ({
    brandId,
    brandName: e.name,
    points: trendSeries(e.lines, period),
  }));
}

// ───────────────────────────────────────────────
// Trend direction, from the rollup's two 30-day windows
// ───────────────────────────────────────────────
export type Trend = 'up' | 'down' | 'flat';

/**
 * Flat covers both "no movement either way" and "nothing in either window" —
 * an arrow for a product that has never sold would be noise, not information.
 */
export function trendOf(current: number, previous: number, tolerancePercent = 5): Trend {
  if (current === 0 && previous === 0) return 'flat';
  if (previous === 0) return current > 0 ? 'up' : 'flat';
  const change = ((current - previous) / Math.abs(previous)) * 100;
  if (change > tolerancePercent) return 'up';
  if (change < -tolerancePercent) return 'down';
  return 'flat';
}

export function productTrend(row: ProductPeriodRow): Trend {
  return trendOf(row.sales_30d_paisa, row.sales_prev_30d_paisa);
}

// ───────────────────────────────────────────────
// Dead stock
// ───────────────────────────────────────────────
export type DeadStockRow = ProductPeriodRow & {
  stockValuePaisa: Money;
  /** null for staff and viewer, who may not see cost. */
  stockCostValuePaisa: Money | null;
  neverSold: boolean;
};

/**
 * Products holding stock that have not sold in `days`. Sorted by the money
 * standing still, because that is the question being asked — not by how long.
 */
export function deadStock(rows: readonly ProductPeriodRow[], days: number): DeadStockRow[] {
  return rows
    .filter((r) => r.stock_on_hand > 0)
    .filter((r) => r.days_since_last_sale === null || r.days_since_last_sale >= days)
    .map((r) => ({
      ...r,
      stockValuePaisa: Math.round(r.stock_on_hand * r.sale_price_paisa),
      stockCostValuePaisa:
        r.purchase_price_paisa === null ? null : Math.round(r.stock_on_hand * r.purchase_price_paisa),
      neverSold: r.last_sale_date === null,
    }))
    .sort((a, b) => b.stockValuePaisa - a.stockValuePaisa);
}

// ───────────────────────────────────────────────
function sum<T>(items: readonly T[], of: (item: T) => number): number {
  return items.reduce((total, item) => total + of(item), 0);
}

// ───────────────────────────────────────────────
// Period columns from lines
//
// product_sales_periods_view has no location dimension — it rolls up every line
// for a product regardless of who bought it. So when the table is filtered to a
// location, the same windows are rebuilt here from the lines that survive the
// filter. Identical window definitions, one source of truth for the boundaries.
// ───────────────────────────────────────────────
export const WINDOW_DAYS = {
  d7: 7, d15: 15, d30: 30, d90: 90, d180: 180, d365: 365,
} as const;

function daysBetween(fromISO: string, to: Date): number {
  const from = new Date(`${fromISO}T00:00:00Z`);
  const toUTC = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((toUTC - from.getTime()) / 86_400_000);
}

/**
 * Rebuild per-product period rows from raw lines. `base` supplies the facts that
 * lines do not carry — stock on hand, sale price, active flag — so a filtered
 * table still shows real stock rather than guessing at it.
 */
export function productPeriodsFromLines(
  lines: readonly SalesLine[],
  base: readonly ProductPeriodRow[],
  today: Date = new Date(),
): ProductPeriodRow[] {
  const baseById = new Map(base.map((b) => [b.product_id, b]));
  const grouped = new Map<string, SalesLine[]>();

  for (const l of lines) {
    const list = grouped.get(l.product_id) ?? [];
    list.push(l);
    grouped.set(l.product_id, list);
  }

  const out: ProductPeriodRow[] = [];

  for (const [productId, productLines] of grouped) {
    const b = baseById.get(productId);
    const within = (days: number) => productLines.filter((l) => daysBetween(l.issue_date, today) < days);
    const qty = (ls: SalesLine[]) => sum(ls, (l) => l.net_quantity);
    const amt = (ls: SalesLine[]) => sum(ls, (l) => l.net_amount_paisa);
    const invoices = (ls: SalesLine[]) => new Set(ls.map((l) => l.invoice_id)).size;

    const d7 = within(7), d15 = within(15), d30 = within(30);
    const d90 = within(90), d180 = within(180), d365 = within(365);
    const prev30 = productLines.filter((l) => {
      const age = daysBetween(l.issue_date, today);
      return age >= 30 && age < 60;
    });

    const costVisible = productLines.some((l) => l.profit_paisa !== null);
    const lastSale = productLines.reduce<string | null>(
      (latest, l) => (latest === null || l.issue_date > latest ? l.issue_date : latest),
      null,
    );
    const first = productLines[0];

    out.push({
      product_id: productId,
      product_name: b?.product_name ?? first.product_name,
      product_sku: b?.product_sku ?? first.product_sku,
      product_unit: b?.product_unit ?? first.product_unit,
      pack_size: b?.pack_size ?? 1,
      pack_name: b?.pack_name ?? null,
      is_active: b?.is_active ?? true,
      sale_price_paisa: b?.sale_price_paisa ?? 0,
      purchase_price_paisa: b?.purchase_price_paisa ?? null,
      brand_id: b?.brand_id ?? first.brand_id,
      brand_name: b?.brand_name ?? first.brand_name,
      brand_type: b?.brand_type ?? first.brand_type,
      stock_on_hand: b?.stock_on_hand ?? 0,
      qty_7d: qty(d7), sales_7d_paisa: amt(d7), invoices_7d: invoices(d7),
      qty_15d: qty(d15), sales_15d_paisa: amt(d15), invoices_15d: invoices(d15),
      qty_30d: qty(d30), sales_30d_paisa: amt(d30), invoices_30d: invoices(d30),
      qty_prev_30d: qty(prev30), sales_prev_30d_paisa: amt(prev30),
      qty_90d: qty(d90), sales_90d_paisa: amt(d90), invoices_90d: invoices(d90),
      qty_180d: qty(d180), sales_180d_paisa: amt(d180),
      qty_365d: qty(d365), sales_365d_paisa: amt(d365),
      qty_all: qty(productLines), sales_all_paisa: amt(productLines), invoices_all: invoices(productLines),
      profit_all_paisa: costVisible ? sum(productLines, (l) => l.profit_paisa ?? 0) : null,
      profit_30d_paisa: costVisible ? sum(d30, (l) => l.profit_paisa ?? 0) : null,
      last_sale_date: lastSale,
      days_since_last_sale: lastSale === null ? null : daysBetween(lastSale, today),
      avg_daily_qty_30d: Math.round((qty(d30) / 30) * 100) / 100,
    });
  }

  return out.sort((a, b) => b.sales_30d_paisa - a.sales_30d_paisa);
}
