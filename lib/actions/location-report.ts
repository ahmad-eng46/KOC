'use server';

import { getSession } from '@/lib/auth/session';
import { fetchLocationReportData, type LocationReportRow } from '@/lib/reports/data';
import type { DateRange } from '@/components/reports/shared';

type Result =
  | {
      ok: true;
      rows: LocationReportRow[];
      totals: { sales: number; paid: number; outstanding: number };
    }
  | { ok: false; error: string };

/**
 * Screen-facing variant of the location report data. Serialisable (no Map —
 * the per-city breakdown is only needed by the PDF/Excel exports).
 * admin/accountant: the fetcher reads ledger_entries, which RLS empties for
 * staff/viewer — they would see a table of zeros presented as truth.
 */
export async function fetchLocationReportAction(range: DateRange): Promise<Result> {
  const session = await getSession();
  if (!session || !['admin', 'accountant'].includes(session.role)) {
    return { ok: false, error: 'Insufficient permissions.' };
  }

  try {
    const data = await fetchLocationReportData(range);
    return {
      ok: true,
      rows: data.rows,
      totals: {
        sales: data.total_sales_paisa,
        paid: data.total_paid_paisa,
        outstanding: data.total_outstanding_paisa,
      },
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
