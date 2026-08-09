// Server-only Excel generator. Builds the owner's business report for the
// active business: an Info sheet, a one-page Summary, and a sheet per domain
// with human-readable columns — names, not UUIDs; rupees, not paisa; Karachi
// dates, not UTC strings.
//
// Used by the "Backup Now" button. The scheduled-backup Edge Function has its
// own Deno implementation of the older raw-table dump.

import ExcelJS from 'exceljs';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';
import {
  INFO_SHEET_NAME, writeInfoSheet, setInfoSheetCount,
} from '@/lib/backup/info-sheet';
import {
  DEFAULT_BACKUP_OPTIONS, resolveRange, type BackupOptions,
} from '@/lib/backup/options';
import type { BackupDataset } from '@/lib/backup/dataset';
import { loadBackupDataset } from '@/lib/backup/load-dataset';
import { addSummarySheet } from '@/lib/backup/sheets/summary-sheet';
import {
  addCustomersSheet, addInvoiceItemsSheet, addInvoicesSheet, addLedgerSheet,
  addPaymentsSheet, addReturnsSheet,
} from '@/lib/backup/sheets/sales-sheets';
import { addProductsSheet, addStockMovementsSheet } from '@/lib/backup/sheets/inventory-sheets';
import {
  addStockPurchasesSheet, addSupplierPaymentsSheet, addSuppliersSheet,
} from '@/lib/backup/sheets/purchase-sheets';
import { addExpenseSummarySheet, addExpensesSheet } from '@/lib/backup/sheets/expense-sheets';
import {
  addAuditSheet, addBrandsSheet, addLocationsSheet, addUsersSheet,
} from '@/lib/backup/sheets/reference-sheets';

export type GeneratedBackup = {
  buffer: Buffer;
  filename: string;
  size_bytes: number;
  business_id: string;
  business_name: string;
  generated_at: Date;
};

/**
 * Build the Excel report for the active business.
 *
 * Reads run through the service-role client so nothing is missed by RLS,
 * which makes the caller's role the only gate on purchase prices — resolved
 * once here into `showCost` and threaded through the dataset. The action
 * layer still restricts who may ask for a backup at all.
 */
export async function generateExcelBackup(
  options: BackupOptions = DEFAULT_BACKUP_OPTIONS,
): Promise<GeneratedBackup> {
  const businessId = await getActiveBusinessId();

  const supabase = await createServerClient();
  const { data: biz } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', businessId)
    .single();
  const businessName = biz?.name ?? 'KOC';

  const generatedAt = new Date();
  const session = await getSession();
  // Iron rule #3: cost is absent from the file for staff and viewer, not
  // hidden inside it.
  const showCost = session?.role === 'admin' || session?.role === 'accountant';
  const range = resolveRange(options.range, generatedAt);
  const sections = new Set(options.sections);

  const data = await loadBackupDataset({
    businessId, businessName, range, showCost, sections,
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'KOC Backup System';
  wb.created = generatedAt;

  const info = wb.addWorksheet(INFO_SHEET_NAME);
  writeInfoSheet(info, {
    businessName,
    businessId,
    generatedAt,
    period: range.label,
    generatedBy: session?.full_name ?? session?.email ?? 'Unknown',
  });

  addSheets(wb, data, generatedAt);
  setInfoSheetCount(info, wb.worksheets.length);

  const ab = await wb.xlsx.writeBuffer();
  const buffer = Buffer.from(ab);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${businessName.replace(/\s+/g, '_')}-backup-${stamp}.xlsx`;

  return {
    buffer,
    filename,
    size_bytes: buffer.length,
    business_id: businessId,
    business_name: businessName,
    generated_at: generatedAt,
  };
}

/**
 * Sheet order is the order an owner reads in: what he is owed, what he holds,
 * what he sold, what he spent, what he owes — then the reference tables.
 */
function addSheets(wb: ExcelJS.Workbook, data: BackupDataset, generatedAt: Date): void {
  const has = (section: Parameters<typeof data.sections.has>[0]) => data.sections.has(section);

  if (has('summary')) addSummarySheet(wb, data, generatedAt);
  if (has('customers')) addCustomersSheet(wb, data);
  if (has('products')) addProductsSheet(wb, data);
  if (has('invoices')) {
    addInvoicesSheet(wb, data);
    addInvoiceItemsSheet(wb, data);
  }
  if (has('payments')) addPaymentsSheet(wb, data);
  if (has('returns')) addReturnsSheet(wb, data);
  if (has('expenses')) {
    addExpensesSheet(wb, data);
    addExpenseSummarySheet(wb, data, generatedAt);
  }
  if (has('suppliers')) {
    addSuppliersSheet(wb, data);
    addStockPurchasesSheet(wb, data);
    addSupplierPaymentsSheet(wb, data);
  }

  // Reference sheets are small and make the rest readable, so they are never
  // optional.
  addLocationsSheet(wb, data);
  addBrandsSheet(wb, data);
  addUsersSheet(wb, data);

  if (has('movements')) addStockMovementsSheet(wb, data);
  if (has('ledger')) addLedgerSheet(wb, data);
  if (has('audit')) addAuditSheet(wb, data);
}
