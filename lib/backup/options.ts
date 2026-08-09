import { z } from 'zod';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * What the owner picked in the "Generate Backup" dialog. Shared by the client
 * dialog and the server generator, so it must stay free of server-only
 * imports.
 *
 * Clicking "Backup Now" without opening the dialog uses DEFAULT_BACKUP_OPTIONS
 * — everything except the three sheets that can run to hundreds of thousands
 * of rows.
 */

const KARACHI = 'Asia/Karachi';

export const BACKUP_SECTIONS = [
  'summary',
  'customers',
  'products',
  'invoices',
  'payments',
  'returns',
  'expenses',
  'suppliers',
  'audit',
  'movements',
  'ledger',
] as const;

export type BackupSection = (typeof BACKUP_SECTIONS)[number];

export const SECTION_LABEL: Record<BackupSection, string> = {
  summary: 'Summary & Overview',
  customers: 'Customers & Balances',
  products: 'Products & Stock',
  invoices: 'Invoices & Items',
  payments: 'Payments',
  returns: 'Returns',
  expenses: 'Expenses',
  suppliers: 'Suppliers & Purchases',
  audit: 'Audit Log',
  movements: 'Stock Movements',
  ledger: 'Full Ledger',
};

/** Sheets that grow with transaction volume rather than with the business. */
export const LARGE_SECTIONS: readonly BackupSection[] = ['audit', 'movements', 'ledger'];

export const DEFAULT_SECTIONS: BackupSection[] = BACKUP_SECTIONS.filter(
  (s) => !LARGE_SECTIONS.includes(s),
);

export const RANGE_PRESETS = ['all', 'this_month', 'last_3_months', 'custom'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_LABEL: Record<RangePreset, string> = {
  all: 'All Time',
  this_month: 'This Month',
  last_3_months: 'Last 3 Months',
  custom: 'Custom',
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

export const backupOptionsSchema = z
  .object({
    sections: z.array(z.enum(BACKUP_SECTIONS)).min(1, 'Pick at least one section'),
    range: z.object({
      preset: z.enum(RANGE_PRESETS),
      from: isoDate.nullable().default(null),
      to: isoDate.nullable().default(null),
    }),
  })
  .refine(
    (o) => o.range.preset !== 'custom' || (!!o.range.from && !!o.range.to),
    { message: 'A custom range needs both a start and an end date', path: ['range'] },
  )
  .refine(
    (o) => !o.range.from || !o.range.to || o.range.from <= o.range.to,
    { message: 'The start date must not be after the end date', path: ['range'] },
  );

export type BackupOptions = z.infer<typeof backupOptionsSchema>;

export const DEFAULT_BACKUP_OPTIONS: BackupOptions = {
  sections: DEFAULT_SECTIONS,
  range: { preset: 'all', from: null, to: null },
};

/**
 * A preset turned into the concrete Karachi-local day bounds the queries use.
 * `from`/`to` are inclusive `YYYY-MM-DD` and compare directly against the DATE
 * columns (issue_date, payment_date, expense_date, …).
 */
export type ResolvedRange = {
  from: string | null;
  to: string | null;
  label: string;
};

function karachiToday(now: Date): string {
  return formatInTimeZone(now, KARACHI, 'yyyy-MM-dd');
}

/** First day of the month `back` months before the Karachi month of `now`. */
export function karachiMonthStart(now: Date, back: number): string {
  const year = Number(formatInTimeZone(now, KARACHI, 'yyyy'));
  const month = Number(formatInTimeZone(now, KARACHI, 'MM')); // 1-12
  const total = year * 12 + (month - 1) - back;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
}

export function resolveRange(range: BackupOptions['range'], now: Date): ResolvedRange {
  const today = karachiToday(now);

  switch (range.preset) {
    case 'this_month': {
      const from = karachiMonthStart(now, 0);
      return { from, to: today, label: `This Month (${pretty(from)} – ${pretty(today)})` };
    }
    case 'last_3_months': {
      const from = karachiMonthStart(now, 2);
      return { from, to: today, label: `Last 3 Months (${pretty(from)} – ${pretty(today)})` };
    }
    case 'custom': {
      const from = range.from ?? null;
      const to = range.to ?? null;
      if (!from && !to) return { from: null, to: null, label: 'All Time' };
      return {
        from,
        to,
        label: `${from ? pretty(from) : 'Start'} – ${to ? pretty(to) : 'Today'}`,
      };
    }
    case 'all':
    default:
      return { from: null, to: null, label: 'All Time' };
  }
}

/** '2026-08-09' → '09 Aug 2026'. Pure string work: no timezone to get wrong. */
export function pretty(isoDay: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = isoDay.split('-');
  const idx = Number(m) - 1;
  if (!y || !d || idx < 0 || idx > 11) return isoDay;
  return `${d} ${months[idx]} ${y}`;
}
