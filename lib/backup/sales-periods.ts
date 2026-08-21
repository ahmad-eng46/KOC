import type {
  BackupDataset, InvoiceRow, InvoiceItemRow, ReturnItemRow,
} from '@/lib/backup/dataset';

/**
 * The time buckets every sales sheet in the workbook shares. Defined once so
 * "This Month" means the same thing on the summary, the per-product sheet and
 * the per-brand sheet — three definitions of the same word is how a workbook
 * ends up disagreeing with itself.
 *
 * Boundaries are calendar-based, not rolling: "This Month" is the month to
 * date, which is what the owner means when they ask how the month is going.
 * Only the two "N months" windows roll, because there is no calendar unit for
 * them.
 */
export const PERIOD_KEYS = [
  'today', 'week', 'month', 'quarter', 'year', 'all',
] as const;

export type PeriodKey = (typeof PERIOD_KEYS)[number];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
  quarter: 'Last 3 Months',
  year: 'This Year',
  all: 'All Time',
};

const DAY = 86_400_000;

function startOfDayUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Monday-based, matching the app's date pickers. */
function startOfWeekUTC(d: Date): number {
  const day = (d.getUTCDay() + 6) % 7;
  return startOfDayUTC(d) - day * DAY;
}

/** The earliest date, inclusive, that still counts as inside the period. */
export function periodStart(period: PeriodKey, now: Date): string | null {
  switch (period) {
    case 'today':   return iso(startOfDayUTC(now));
    case 'week':    return iso(startOfWeekUTC(now));
    case 'month':   return iso(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    case 'quarter': return iso(startOfDayUTC(now) - 89 * DAY);
    case 'year':    return iso(Date.UTC(now.getUTCFullYear(), 0, 1));
    case 'all':     return null;
  }
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function inPeriod(issueDate: string, period: PeriodKey, now: Date): boolean {
  const start = periodStart(period, now);
  if (start === null) return true;
  // Dates are plain YYYY-MM-DD, so a string compare is the date compare.
  return issueDate >= start && issueDate <= iso(startOfDayUTC(now));
}

// ───────────────────────────────────────────────
// Line-level figures, matching sales_analytics_view's arithmetic
// ───────────────────────────────────────────────
export type SalesLineFacts = {
  invoiceId: string;
  issueDate: string;
  productId: string;
  customerId: string;
  quantity: number;
  /** Line total less its share of the invoice discount, less anything returned. */
  netAmountPaisa: number;
};

/**
 * Flattens the backup dataset into the same shape the analytics view produces:
 * invoice discount shared across lines in proportion to each line's value, and
 * returns netted off. Draft, cancelled and deleted invoices never appear.
 */
export function salesLines(d: BackupDataset): SalesLineFacts[] {
  const invoiceById = new Map<string, InvoiceRow>();
  for (const i of d.invoices) {
    if (i.status === 'draft' || i.status === 'cancelled') continue;
    invoiceById.set(i.id, i);
  }

  const returnedByItem = new Map<string, { qty: number; amount: number }>();
  for (const ri of d.returnItems as ReturnItemRow[]) {
    const key = itemKeyOf(ri);
    if (!key) continue;
    const prev = returnedByItem.get(key) ?? { qty: 0, amount: 0 };
    prev.qty += Number(ri.quantity ?? 0);
    prev.amount += Number(ri.quantity ?? 0) * Number(returnPriceOf(ri));
    returnedByItem.set(key, prev);
  }

  const out: SalesLineFacts[] = [];

  for (const item of d.invoiceItems as InvoiceItemRow[]) {
    const invoice = invoiceById.get(item.invoice_id);
    if (!invoice) continue;

    const share = invoice.subtotal_paisa > 0
      ? Math.round((item.line_total_paisa / invoice.subtotal_paisa) * (invoice.discount_paisa ?? 0))
      : 0;
    const returned = returnedByItem.get(item.id) ?? { qty: 0, amount: 0 };

    out.push({
      invoiceId: invoice.id,
      issueDate: invoice.issue_date,
      productId: item.product_id,
      customerId: invoice.customer_id,
      quantity: item.quantity - returned.qty,
      netAmountPaisa: item.line_total_paisa - share - Math.round(returned.amount),
    });
  }

  return out;
}

function itemKeyOf(ri: ReturnItemRow): string | null {
  const v = (ri as unknown as Record<string, unknown>).invoice_item_id;
  return typeof v === 'string' ? v : null;
}

function returnPriceOf(ri: ReturnItemRow): number {
  const r = ri as unknown as Record<string, unknown>;
  return Number(r.return_price_paisa ?? r.unit_price_paisa ?? 0);
}

// ───────────────────────────────────────────────
// Aggregation
// ───────────────────────────────────────────────
export type PeriodTotals = {
  salesPaisa: number;
  quantity: number;
  invoiceIds: Set<string>;
};

export function emptyTotals(): Record<PeriodKey, PeriodTotals> {
  return Object.fromEntries(
    PERIOD_KEYS.map((k) => [k, { salesPaisa: 0, quantity: 0, invoiceIds: new Set<string>() }]),
  ) as Record<PeriodKey, PeriodTotals>;
}

export function addLine(
  totals: Record<PeriodKey, PeriodTotals>,
  line: SalesLineFacts,
  now: Date,
): void {
  for (const key of PERIOD_KEYS) {
    if (!inPeriod(line.issueDate, key, now)) continue;
    const t = totals[key];
    t.salesPaisa += line.netAmountPaisa;
    t.quantity += line.quantity;
    t.invoiceIds.add(line.invoiceId);
  }
}

/** Groups lines by any key, returning per-period totals for each group. */
export function totalsByKey(
  lines: readonly SalesLineFacts[],
  keyOf: (line: SalesLineFacts) => string,
  now: Date,
): Map<string, Record<PeriodKey, PeriodTotals>> {
  const out = new Map<string, Record<PeriodKey, PeriodTotals>>();
  for (const line of lines) {
    const key = keyOf(line);
    let totals = out.get(key);
    if (!totals) {
      totals = emptyTotals();
      out.set(key, totals);
    }
    addLine(totals, line, now);
  }
  return out;
}

/** The most recent sale date per key, or null where there has never been one. */
export function lastSaleByKey(
  lines: readonly SalesLineFacts[],
  keyOf: (line: SalesLineFacts) => string,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of lines) {
    const key = keyOf(line);
    const prev = out.get(key);
    if (!prev || line.issueDate > prev) out.set(key, line.issueDate);
  }
  return out;
}

export function daysSince(dateISO: string, now: Date): number {
  const then = Date.parse(`${dateISO}T00:00:00Z`);
  return Math.floor((startOfDayUTC(now) - then) / DAY);
}

// ───────────────────────────────────────────────
// Calendar buckets for the day / week / month sheets
// ───────────────────────────────────────────────
export function weekStart(dateISO: string): string {
  return iso(startOfWeekUTC(new Date(`${dateISO}T00:00:00Z`)));
}

export function monthStart(dateISO: string): string {
  return `${dateISO.slice(0, 7)}-01`;
}

/** Every date from `from` to `to` inclusive, so gaps in trading are visible. */
export function dateRangeDescending(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];

  const out: string[] = [];
  for (let t = end; t >= start; t -= DAY) out.push(iso(t));
  return out;
}

/** Percentage change, or null when there is no honest answer. */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
