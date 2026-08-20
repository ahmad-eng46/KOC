'use server';

import { format } from 'date-fns';
import { getSession } from '@/lib/auth/session';
import { currentUserCan } from '@/lib/auth/can-user';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { logActivity } from '@/lib/actions/activity-log';
import {
  fetchSalesAnalyticsData,
  type SalesAnalyticsFilters, type SalesAnalyticsData,
} from '@/lib/reports/sales-analytics-data';
import { buildSalesAnalyticsWorkbook } from '@/lib/reports/sales-analytics-excel';

type ExportResult =
  | { ok: true; base64: string; filename: string }
  | { ok: false; error: string };

async function guard(): Promise<string | null> {
  const session = await getSession();
  if (!session) return 'Not signed in.';
  if (!(await currentUserCan('reports.view'))) return 'Insufficient permissions.';
  return null;
}

async function businessName(): Promise<string> {
  const supabase = await createServerClient();
  const businessId = await getActiveBusinessId();
  const { data } = await supabase.from('businesses').select('name').eq('id', businessId).single();
  return (data as { name: string } | null)?.name ?? 'Business';
}

function slug(data: SalesAnalyticsData): string {
  const scope = data.brandName ? `-${data.brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '';
  return `sales-analytics${scope}-${data.range.from}-to-${data.range.to}`;
}

/**
 * Shared entry point for both exports and for anything else that needs the same
 * numbers server-side. The views decide what cost this caller may see, so no
 * role check is duplicated here — `costVisible` reports what came back.
 */
export async function getSalesReportData(
  filters: SalesAnalyticsFilters,
): Promise<{ ok: true; data: SalesAnalyticsData } | { ok: false; error: string }> {
  const err = await guard();
  if (err) return { ok: false, error: err };
  try {
    return { ok: true, data: await fetchSalesAnalyticsData(filters) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ───────────────────────────────────────────────
// PDF
// ───────────────────────────────────────────────
export async function exportSalesAnalyticsPdf(
  filters: SalesAnalyticsFilters,
): Promise<ExportResult> {
  const err = await guard();
  if (err) return { ok: false, error: err };

  try {
    // Imported here rather than at module scope: @react-pdf/renderer and the
    // JSX document pull a lot in, and every other export in this file is Excel.
    const [{ renderToBuffer }, { SalesAnalyticsPDF }, data, name] = await Promise.all([
      import('@react-pdf/renderer'),
      import('@/components/reports/sales-analytics-pdf'),
      fetchSalesAnalyticsData(filters),
      businessName(),
    ]);

    const buf = await renderToBuffer(
      SalesAnalyticsPDF({
        data,
        businessName: name,
        generatedAt: format(new Date(), 'dd MMM yyyy HH:mm'),
      }),
    );

    await logActivity({
      action: 'backup.downloaded',
      entityType: 'report',
      description: `Exported the sales analytics PDF for ${data.range.from} to ${data.range.to}`,
      metadata: { format: 'pdf', ...filters },
    });

    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `${slug(data)}.pdf` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ───────────────────────────────────────────────
// Excel
// ───────────────────────────────────────────────
export async function exportSalesAnalyticsExcel(
  filters: SalesAnalyticsFilters,
): Promise<ExportResult> {
  const err = await guard();
  if (err) return { ok: false, error: err };

  try {
    const [data, name] = await Promise.all([fetchSalesAnalyticsData(filters), businessName()]);
    const buf = await buildSalesAnalyticsWorkbook(data, name);

    await logActivity({
      action: 'backup.downloaded',
      entityType: 'report',
      description: `Exported the sales analytics workbook for ${data.range.from} to ${data.range.to}`,
      metadata: { format: 'xlsx', ...filters },
    });

    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `${slug(data)}.xlsx` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

