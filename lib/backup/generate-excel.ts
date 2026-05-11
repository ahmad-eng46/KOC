// Server-only Excel generator. Builds a multi-sheet .xlsx workbook
// covering every major table for the active business. Money columns use
// the format '"Rs. "#,##0.00'. Used by both the manual "Backup Now"
// button and the scheduled-backup Edge Function (which imports the same
// data shape but generates the workbook in Deno).

import ExcelJS from 'exceljs';
import { createServerClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { getActiveBusinessId } from '@/lib/business';

const MONEY_FMT = '"Rs. "#,##0.00';
const DATE_FMT = 'yyyy-mm-dd';
const DATETIME_FMT = 'yyyy-mm-dd hh:mm:ss';

type SheetSpec = {
  name: string;
  table: string;
  columns: Array<{
    header: string;
    key: string;
    width?: number;
    /** 'paisa' divides by 100 and applies money format. 'date' / 'datetime' apply date format. */
    type?: 'paisa' | 'date' | 'datetime' | 'json';
  }>;
};

// Tables and the columns we want exported. Order matters for column order.
const SHEETS: SheetSpec[] = [
  {
    name: 'Customers', table: 'customers',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'Category ID', key: 'category_id', width: 38 },
      { header: 'Opening Balance', key: 'opening_balance_paisa', width: 16, type: 'paisa' },
      { header: 'Credit Limit', key: 'credit_limit_paisa', width: 16, type: 'paisa' },
      { header: 'Is Defaulter', key: 'is_defaulter', width: 12 },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Created At', key: 'created_at', width: 20, type: 'datetime' },
      { header: 'Deleted At', key: 'deleted_at', width: 20, type: 'datetime' },
    ],
  },
  {
    name: 'Products', table: 'products',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Name', key: 'name', width: 30 },
      { header: 'SKU', key: 'sku', width: 14 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Sale Price', key: 'sale_price_paisa', width: 14, type: 'paisa' },
      { header: 'Purchase Price', key: 'purchase_price_paisa', width: 14, type: 'paisa' },
      { header: 'Low Stock Threshold', key: 'low_stock_threshold', width: 16 },
      { header: 'Active', key: 'is_active', width: 10 },
      { header: 'Created At', key: 'created_at', width: 20, type: 'datetime' },
      { header: 'Deleted At', key: 'deleted_at', width: 20, type: 'datetime' },
    ],
  },
  {
    name: 'Invoices', table: 'invoices',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Number', key: 'invoice_number', width: 14 },
      { header: 'Customer ID', key: 'customer_id', width: 38 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Issue Date', key: 'issue_date', width: 12, type: 'date' },
      { header: 'Due Date', key: 'due_date', width: 12, type: 'date' },
      { header: 'Subtotal', key: 'subtotal_paisa', width: 14, type: 'paisa' },
      { header: 'Discount', key: 'discount_paisa', width: 14, type: 'paisa' },
      { header: 'Total', key: 'total_paisa', width: 14, type: 'paisa' },
      { header: 'Paid', key: 'paid_paisa', width: 14, type: 'paisa' },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Created By', key: 'created_by', width: 38 },
      { header: 'Created At', key: 'created_at', width: 20, type: 'datetime' },
      { header: 'Deleted At', key: 'deleted_at', width: 20, type: 'datetime' },
    ],
  },
  {
    name: 'Invoice Items', table: 'invoice_items',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Invoice ID', key: 'invoice_id', width: 38 },
      { header: 'Product ID', key: 'product_id', width: 38 },
      { header: 'Quantity', key: 'quantity', width: 10 },
      { header: 'Unit Price', key: 'unit_price_paisa', width: 14, type: 'paisa' },
      { header: 'Cost at Sale', key: 'purchase_price_at_sale_paisa', width: 14, type: 'paisa' },
      { header: 'Discount', key: 'discount_paisa', width: 14, type: 'paisa' },
      { header: 'Line Total', key: 'line_total_paisa', width: 14, type: 'paisa' },
    ],
  },
  {
    name: 'Returns', table: 'returns',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Number', key: 'return_number', width: 14 },
      { header: 'Invoice ID', key: 'invoice_id', width: 38 },
      { header: 'Customer ID', key: 'customer_id', width: 38 },
      { header: 'Date', key: 'return_date', width: 12, type: 'date' },
      { header: 'Total', key: 'total_paisa', width: 14, type: 'paisa' },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Created At', key: 'created_at', width: 20, type: 'datetime' },
      { header: 'Deleted At', key: 'deleted_at', width: 20, type: 'datetime' },
    ],
  },
  {
    name: 'Return Items', table: 'return_items',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Return ID', key: 'return_id', width: 38 },
      { header: 'Invoice Item ID', key: 'invoice_item_id', width: 38 },
      { header: 'Product ID', key: 'product_id', width: 38 },
      { header: 'Quantity', key: 'quantity', width: 10 },
      { header: 'Unit Price', key: 'unit_price_paisa', width: 14, type: 'paisa' },
      { header: 'Line Total', key: 'line_total_paisa', width: 14, type: 'paisa' },
    ],
  },
  {
    name: 'Payments', table: 'payments',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Customer ID', key: 'customer_id', width: 38 },
      { header: 'Invoice ID', key: 'invoice_id', width: 38 },
      { header: 'Amount', key: 'amount_paisa', width: 14, type: 'paisa' },
      { header: 'Method', key: 'method', width: 14 },
      { header: 'Reference', key: 'reference', width: 20 },
      { header: 'Date', key: 'payment_date', width: 12, type: 'date' },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Created At', key: 'created_at', width: 20, type: 'datetime' },
      { header: 'Deleted At', key: 'deleted_at', width: 20, type: 'datetime' },
    ],
  },
  {
    name: 'Expenses', table: 'expenses',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Type', key: 'type', width: 10 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Amount', key: 'amount_paisa', width: 14, type: 'paisa' },
      { header: 'Date', key: 'expense_date', width: 12, type: 'date' },
      { header: 'In P&L', key: 'include_in_pnl', width: 10 },
      { header: 'Receipt URL', key: 'receipt_url', width: 30 },
      { header: 'Created At', key: 'created_at', width: 20, type: 'datetime' },
      { header: 'Deleted At', key: 'deleted_at', width: 20, type: 'datetime' },
    ],
  },
  {
    name: 'Investments', table: 'investments',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Investor', key: 'investor_name', width: 24 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Amount', key: 'amount_paisa', width: 14, type: 'paisa' },
      { header: 'Date', key: 'investment_date', width: 12, type: 'date' },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Created At', key: 'created_at', width: 20, type: 'datetime' },
    ],
  },
  {
    name: 'Loans', table: 'loans',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Direction', key: 'direction', width: 10 },
      { header: 'Party', key: 'party_name', width: 24 },
      { header: 'Principal', key: 'principal_paisa', width: 14, type: 'paisa' },
      { header: 'Balance', key: 'balance_paisa', width: 14, type: 'paisa' },
      { header: 'Interest %', key: 'interest_rate', width: 10 },
      { header: 'Loan Date', key: 'loan_date', width: 12, type: 'date' },
      { header: 'Due Date', key: 'due_date', width: 12, type: 'date' },
      { header: 'Settled', key: 'is_settled', width: 10 },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Created At', key: 'created_at', width: 20, type: 'datetime' },
    ],
  },
  {
    name: 'Stock Movements', table: 'stock_movements',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Product ID', key: 'product_id', width: 38 },
      { header: 'Invoice ID', key: 'invoice_id', width: 38 },
      { header: 'Return ID', key: 'return_id', width: 38 },
      { header: 'Type', key: 'type', width: 12 },
      { header: 'Quantity', key: 'quantity', width: 10 },
      { header: 'Note', key: 'note', width: 30 },
      { header: 'Created At', key: 'created_at', width: 20, type: 'datetime' },
    ],
  },
  {
    name: 'Ledger Entries', table: 'ledger_entries',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Customer ID', key: 'customer_id', width: 38 },
      { header: 'Ref Type', key: 'ref_type', width: 12 },
      { header: 'Ref ID', key: 'ref_id', width: 38 },
      { header: 'Date', key: 'entry_date', width: 12, type: 'date' },
      { header: 'Debit', key: 'debit_paisa', width: 14, type: 'paisa' },
      { header: 'Credit', key: 'credit_paisa', width: 14, type: 'paisa' },
      { header: 'Balance', key: 'balance_paisa', width: 14, type: 'paisa' },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Created At', key: 'created_at', width: 20, type: 'datetime' },
    ],
  },
  {
    name: 'SMS Log', table: 'sms_log',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Customer ID', key: 'customer_id', width: 38 },
      { header: 'Channel', key: 'channel', width: 10 },
      { header: 'To', key: 'to_number', width: 18 },
      { header: 'Message', key: 'message', width: 50 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Provider SID', key: 'provider_sid', width: 30 },
      { header: 'Sent At', key: 'sent_at', width: 20, type: 'datetime' },
      { header: 'Created At', key: 'created_at', width: 20, type: 'datetime' },
    ],
  },
  {
    name: 'Audit Log', table: 'audit_log',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'User ID', key: 'user_id', width: 38 },
      { header: 'Table', key: 'table_name', width: 18 },
      { header: 'Row ID', key: 'row_id', width: 38 },
      { header: 'Action', key: 'action', width: 10 },
      { header: 'Before', key: 'before_jsonb', width: 50, type: 'json' },
      { header: 'After', key: 'after_jsonb', width: 50, type: 'json' },
      { header: 'At', key: 'at', width: 20, type: 'datetime' },
    ],
  },
];

export type GeneratedBackup = {
  buffer: Buffer;
  filename: string;
  size_bytes: number;
  business_id: string;
  business_name: string;
  generated_at: Date;
};

/**
 * Build the full Excel backup for the active business.
 * Reads via SERVICE ROLE so we capture deleted rows too (audit_log
 * RLS is admin-only-readable, sms_log doesn't yet have RLS, etc.).
 *
 * The caller is expected to be admin — gate this at the action layer.
 */
export async function generateExcelBackup(): Promise<GeneratedBackup> {
  const businessId = await getActiveBusinessId();

  const supabase = await createServerClient();
  const { data: biz } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', businessId)
    .single();
  const businessName = biz?.name ?? 'KOC';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'KOC Backup System';
  wb.created = new Date();

  // First sheet: meta info
  const meta = wb.addWorksheet('Meta');
  meta.columns = [{ header: 'Key', key: 'key', width: 22 }, { header: 'Value', key: 'value', width: 50 }];
  meta.getRow(1).font = { bold: true };
  meta.addRow({ key: 'Business', value: businessName });
  meta.addRow({ key: 'Business ID', value: businessId });
  meta.addRow({ key: 'Generated At', value: new Date().toISOString() });
  meta.addRow({ key: 'Sheet Count', value: SHEETS.length + 1 });

  // Per table
  for (const spec of SHEETS) {
    const ws = wb.addWorksheet(spec.name);
    ws.columns = spec.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: 'FFEFEFEF' },
    } as ExcelJS.Fill;

    // Tables with no business_id column must scope via their parent:
    //   invoice_items → filter by invoice_id ∈ invoices(business_id=...)
    //   return_items  → filter by return_id  ∈ returns(business_id=...)
    //   audit_log     → global, admin sees everything
    let q = adminClient.from(spec.table).select('*').limit(50_000);
    if (spec.table === 'invoice_items') {
      const { data: invIds } = await adminClient
        .from('invoices').select('id').eq('business_id', businessId);
      const ids = (invIds ?? []).map((r) => r.id);
      if (ids.length === 0) {
        // No parent rows → leave sheet empty
        for (let i = 0; i < spec.columns.length; i++) {
          const col = ws.getColumn(i + 1);
          const def = spec.columns[i];
          if (def.type === 'paisa') col.numFmt = MONEY_FMT;
          if (def.type === 'date') col.numFmt = DATE_FMT;
          if (def.type === 'datetime') col.numFmt = DATETIME_FMT;
        }
        ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
        continue;
      }
      q = adminClient.from(spec.table).select('*').in('invoice_id', ids).limit(50_000);
    } else if (spec.table === 'return_items') {
      const { data: retIds } = await adminClient
        .from('returns').select('id').eq('business_id', businessId);
      const ids = (retIds ?? []).map((r) => r.id);
      if (ids.length === 0) {
        for (let i = 0; i < spec.columns.length; i++) {
          const col = ws.getColumn(i + 1);
          const def = spec.columns[i];
          if (def.type === 'paisa') col.numFmt = MONEY_FMT;
          if (def.type === 'date') col.numFmt = DATE_FMT;
          if (def.type === 'datetime') col.numFmt = DATETIME_FMT;
        }
        ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
        continue;
      }
      q = adminClient.from(spec.table).select('*').in('return_id', ids).limit(50_000);
    } else if (spec.table !== 'audit_log') {
      q = q.eq('business_id', businessId);
    }

    const { data, error } = await q;
    if (error) {
      ws.addRow({ [spec.columns[0].key]: `ERROR: ${error.message}` });
      continue;
    }

    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const cleaned: Record<string, unknown> = {};
      for (const col of spec.columns) {
        const raw = row[col.key];
        if (raw === null || raw === undefined) {
          cleaned[col.key] = null;
        } else if (col.type === 'paisa') {
          // Store as a number so Excel formula sums work; format applies the Rs. prefix.
          cleaned[col.key] = Number(raw) / 100;
        } else if (col.type === 'date' || col.type === 'datetime') {
          cleaned[col.key] = new Date(raw as string);
        } else if (col.type === 'json') {
          cleaned[col.key] = raw == null ? '' : JSON.stringify(raw);
        } else {
          cleaned[col.key] = raw;
        }
      }
      ws.addRow(cleaned);
    }

    // Apply column number formats
    for (let i = 0; i < spec.columns.length; i++) {
      const col = ws.getColumn(i + 1);
      const def = spec.columns[i];
      if (def.type === 'paisa') col.numFmt = MONEY_FMT;
      if (def.type === 'date') col.numFmt = DATE_FMT;
      if (def.type === 'datetime') col.numFmt = DATETIME_FMT;
    }

    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
  }

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
    generated_at: new Date(),
  };
}
