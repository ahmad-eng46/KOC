import type ExcelJS from 'exceljs';
import type { BackupDataset } from '@/lib/backup/dataset';
import { inRange } from '@/lib/backup/dataset';
import { addSheet } from '@/lib/backup/sheet-writer';
import { TAB, paintStatus } from '@/lib/backup/xlsx-style';
import { DASH, titleCase } from '@/lib/backup/sheets/labels';
import {
  EXPENSE_PERIODS, EXPENSE_PERIOD_LABEL, buildExpenseSummary,
  type ExpenseSummaryRow,
} from '@/lib/backup/expense-summary';

/** What the business spent, line by line. */

export function addExpensesSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  const rows = d.expenses
    .filter((e) => inRange(e.expense_date, d.range))
    .sort((a, b) => b.expense_date.localeCompare(a.expense_date));

  addSheet(wb, {
    name: 'Expenses',
    tab: TAB.data,
    businessName: d.businessName,
    rows,
    totals: true,
    emptyNote: 'No expenses in the selected period.',
    columns: [
      { header: '#', kind: 'int', value: (_e, i) => i + 1, width: 6 },
      { header: 'Date (PKT)', kind: 'date', value: (e) => e.expense_date },
      { header: 'Type', value: (e) => titleCase(e.type) },
      { header: 'Category', value: (e) => e.category },
      // asset_name is the name snapshotted at entry, which survives a rename
      // or a deleted asset; the live table is only a fallback.
      {
        header: 'Asset',
        value: (e) => e.asset_name
          ?? (e.asset_id ? d.expenseAssets.find((a) => a.id === e.asset_id)?.name ?? DASH : DASH),
      },
      { header: 'Expense Type', value: (e) => e.sub_type_name ?? DASH },
      { header: 'Amount', kind: 'money', total: true, value: (e) => e.amount_paisa },
      { header: 'Description', value: (e) => e.description ?? DASH, width: 40 },
      {
        header: 'In P&L',
        value: (e) => (e.include_in_pnl ? 'Yes' : 'No'),
        paint: (cell, e) => paintStatus(cell, e.include_in_pnl ? 'none' : 'warn'),
      },
      { header: 'Receipt?', value: (e) => (e.receipt_url ? 'Yes' : 'No') },
    ],
  });
}

/**
 * One row per asset, a column per period, grouped by category with subtotals —
 * the sheet that answers "is this car costing me more than last month?".
 *
 * Always all-time in its base data, whatever range the rest of the workbook
 * uses: the period columns are the comparison, so narrowing them first would
 * leave nothing to compare.
 */
export function addExpenseSummarySheet(
  wb: ExcelJS.Workbook,
  d: BackupDataset,
  now: Date,
): void {
  const rows = buildExpenseSummary(d.expenses, now);

  addSheet(wb, {
    name: 'Expense Summary',
    tab: TAB.summary,
    businessName: d.businessName,
    rows,
    emptyNote: 'No expenses recorded.',
    rowStyle: (r) => (r.kind === 'asset' ? 'normal' : r.kind),
    columns: [
      { header: 'Category', value: (r) => (r.kind === 'grand' ? '' : r.category) },
      { header: 'Asset', value: (r) => r.asset, width: 28 },
      ...EXPENSE_PERIODS.map((period) => ({
        header: EXPENSE_PERIOD_LABEL[period],
        kind: 'money' as const,
        value: (r: ExpenseSummaryRow) => r.periods[period],
      })),
    ],
  });
}
