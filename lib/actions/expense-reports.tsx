'use server';

import { renderToBuffer } from '@react-pdf/renderer';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import { getSession } from '@/lib/auth/session';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { expenseCategoryGroup } from '@/lib/validators/expense-assets';
import {
  buildAssetBreakdown, buildSubTypeShares,
  PERIOD_LABELS, type PeriodKey,
} from '@/lib/expense-analytics';
import { ExpenseAnalyticsPDF } from '@/components/reports/expense-pdfs';
import type { ExpenseSummaryRow } from '@/lib/queries/expense-assets';
import type { ExpenseType } from '@/lib/validators/expense';

type ExportResult =
  | { ok: true; base64: string; filename: string }
  | { ok: false; error: string };

export type ExpenseAnalyticsFilters = {
  category?: string;
  type?: '' | ExpenseType;
};

const TABLE_PERIODS: PeriodKey[] = ['thisMonth', 'lastMonth', 'threeMonths', 'sixMonths', 'year', 'total'];

async function fetchSummaryRows(
  filters: ExpenseAnalyticsFilters,
): Promise<{ rows: ExpenseSummaryRow[]; businessName: string }> {
  const supabase = await createServerClient();
  const businessId = await getActiveBusinessId();

  let q = supabase
    .from('expense_asset_summary_view')
    .select('*')
    .eq('business_id', businessId);
  if (filters.category) q = q.in('category', expenseCategoryGroup(filters.category));
  if (filters.type) q = q.eq('type', filters.type);

  const [{ data, error }, biz] = await Promise.all([
    q,
    supabase.from('businesses').select('name').eq('id', businessId).single(),
  ]);
  if (error) throw error;

  const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    type: r.type as ExpenseType,
    category: r.category as string,
    asset_id: (r.asset_id as string | null) ?? null,
    asset_name: (r.asset_name as string | null) ?? null,
    asset_type: (r.asset_type as string | null) ?? null,
    sub_type_id: (r.sub_type_id as string | null) ?? null,
    sub_type_name: (r.sub_type_name as string | null) ?? null,
    expense_month: r.expense_month as string,
    transaction_count: Number(r.transaction_count ?? 0),
    total_paisa: Number(r.total_paisa ?? 0),
  })) as ExpenseSummaryRow[];

  return { rows, businessName: biz.data?.name ?? 'Business' };
}

async function ensureManager(): Promise<string | null> {
  const session = await getSession();
  if (!session) return 'Not signed in.';
  if (!['admin', 'accountant'].includes(session.role)) return 'Insufficient permissions.';
  return null;
}

export async function exportExpenseAnalyticsPdf(
  filters: ExpenseAnalyticsFilters,
): Promise<ExportResult> {
  const err = await ensureManager();
  if (err) return { ok: false, error: err };
  try {
    const now = new Date();
    const { rows, businessName } = await fetchSummaryRows(filters);
    const buf = await renderToBuffer(
      <ExpenseAnalyticsPDF rows={rows} businessName={businessName} now={now} />,
    );
    return {
      ok: true,
      base64: Buffer.from(buf).toString('base64'),
      filename: `expenses-by-item-${format(now, 'yyyy-MM-dd')}.pdf`,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function exportExpenseAnalyticsExcel(
  filters: ExpenseAnalyticsFilters,
): Promise<ExportResult> {
  const err = await ensureManager();
  if (err) return { ok: false, error: err };
  try {
    const now = new Date();
    const { rows } = await fetchSummaryRows(filters);
    const breakdown = buildAssetBreakdown(rows, now);
    const wb = new ExcelJS.Workbook();

    const ws = wb.addWorksheet('Summary');
    ws.addRow(['Item', 'Category', ...TABLE_PERIODS.map((p) => PERIOD_LABELS[p])]);
    ws.getRow(1).font = { bold: true };
    for (const r of breakdown) {
      ws.addRow([
        r.assetName, r.category,
        ...TABLE_PERIODS.map((p) => r.periods[p] / 100),
      ]);
    }
    ws.columns.forEach((c) => { c.width = 16; });

    // One sheet per category present, with its assets' sub-type splits.
    const categories = Array.from(new Set(rows.map((r) => r.category))).sort();
    const used = new Set<string>(['Summary']);
    for (const cat of categories) {
      const catRows = rows.filter((r) => r.category === cat);
      const catAssets = buildAssetBreakdown(catRows, now);
      const base = cat.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || 'Category';
      let name = base;
      let n = 2;
      while (used.has(name)) name = `${base} ${n++}`;
      used.add(name);

      const sheet = wb.addWorksheet(name);
      sheet.addRow(['Item', 'Expense Type', 'Share %', 'Amount']);
      sheet.getRow(1).font = { bold: true };
      for (const asset of catAssets) {
        const shares = buildSubTypeShares(catRows, asset.key, now);
        if (shares.length === 0) {
          sheet.addRow([asset.assetName, '—', '', asset.periods.total / 100]);
          continue;
        }
        for (const sh of shares) {
          sheet.addRow([asset.assetName, sh.name, sh.pct / 100, sh.paisa / 100]);
        }
      }
      sheet.getColumn(3).numFmt = '0%';
      sheet.columns.forEach((c) => { c.width = 20; });
    }

    const buf = await wb.xlsx.writeBuffer();
    return {
      ok: true,
      base64: Buffer.from(buf).toString('base64'),
      filename: `expenses-by-item-${format(now, 'yyyy-MM-dd')}.xlsx`,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
