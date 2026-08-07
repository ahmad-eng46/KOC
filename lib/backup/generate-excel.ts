// Server-only Excel generator. Builds a multi-sheet .xlsx workbook
// covering every major table for the active business. Money columns use
// the format '"Rs. "#,##0.00'. Used by both the manual "Backup Now"
// button and the scheduled-backup Edge Function (which imports the same
// data shape but generates the workbook in Deno).

import ExcelJS from 'exceljs';
import { createServerClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { getActiveBusinessId } from '@/lib/business';
import { toKarachiExcelDate } from '@/lib/date';

const MONEY_FMT = '"Rs. "#,##0.00';
const DATE_FMT = 'yyyy-mm-dd';
const DATETIME_FMT = 'yyyy-mm-dd hh:mm:ss';
const ROW_LIMIT = 50_000;

const AUTO_WIDTH_MIN = 12;
const AUTO_WIDTH_MAX = 60;

function autoSizeColumns(ws: ExcelJS.Worksheet): void {
  ws.columns.forEach((col) => {
    let widest = 0;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      const text =
        v instanceof Date
          ? 'yyyy-mm-dd hh:mm:ss'
          : v === null || v === undefined
            ? ''
            : String(v);
      if (text.length > widest) widest = text.length;
    });
    col.width = Math.min(Math.max(widest + 2, AUTO_WIDTH_MIN), AUTO_WIDTH_MAX);
  });
}

/**
 * How a sheet's rows are narrowed to the active business.
 *
 *  business   — table has its own business_id column (the common case)
 *  self       — the businesses table itself; matched on id
 *  global     — not business-scoped at all (audit_log)
 *  or-global  — business_id matches, OR is NULL for rows shared across
 *               businesses (app_settings defaults)
 *  via-*      — no business_id of its own; scoped through a parent table
 */
type SheetScope =
  | 'business'
  | 'self'
  | 'global'
  | 'or-global'
  | 'via-invoices'
  | 'via-returns'
  | 'via-user-businesses';

type SheetSpec = {
  name: string;
  table: string;
  /** Defaults to 'business'. */
  scope?: SheetScope;
  /** Omit soft-deleted rows. Off by default: a backup normally keeps them. */
  excludeDeleted?: boolean;
  /** Render TIMESTAMPTZ as Asia/Karachi wall-clock rather than UTC. */
  karachiDates?: boolean;
  /** Size columns to their content instead of the fixed `width`. */
  autoSize?: boolean;
  columns: Array<{
    header: string;
    key: string;
    width?: number;
    /** 'paisa' divides by 100 and applies money format. 'date' / 'datetime' apply date format. */
    type?: 'paisa' | 'date' | 'datetime' | 'json';
    /**
     * Denormalised column: `key` doesn't exist on the table; the value is
     * looked up from another table via lookup.via (an FK column on this row).
     * `fallback` renders when the FK is NULL or unresolvable.
     */
    lookup?: { table: string; via: string; column: string; fallback?: string };
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
      { header: 'Location ID', key: 'location_id', width: 38 },
      {
        header: 'Location', key: 'location_name', width: 16,
        lookup: { table: 'locations', via: 'location_id', column: 'name' },
      },
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
      { header: 'Brand ID', key: 'brand_id', width: 38 },
      {
        header: 'Brand', key: 'brand_name', width: 20,
        lookup: { table: 'brands', via: 'brand_id', column: 'name', fallback: '—' },
      },
      { header: 'Sale Price', key: 'sale_price_paisa', width: 14, type: 'paisa' },
      { header: 'Purchase Price', key: 'purchase_price_paisa', width: 14, type: 'paisa' },
      { header: 'Low Stock Threshold', key: 'low_stock_threshold', width: 16 },
      { header: 'Active', key: 'is_active', width: 10 },
      { header: 'Created At', key: 'created_at', width: 20, type: 'datetime' },
      { header: 'Deleted At', key: 'deleted_at', width: 20, type: 'datetime' },
    ],
  },
  {
    name: 'Brands', table: 'brands',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Type', key: 'brand_type', width: 14 },
      { header: 'Contact Person', key: 'contact_person', width: 20 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Sort Order', key: 'sort_order', width: 10 },
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
    name: 'Invoice Items', table: 'invoice_items', scope: 'via-invoices',
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
    name: 'Return Items', table: 'return_items', scope: 'via-returns',
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
      { header: 'Item', key: 'asset_name', width: 20 },
      { header: 'Expense Type', key: 'sub_type_name', width: 16 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Amount', key: 'amount_paisa', width: 14, type: 'paisa' },
      { header: 'Date', key: 'expense_date', width: 12, type: 'date' },
      { header: 'In P&L', key: 'include_in_pnl', width: 10 },
      { header: 'Receipt URL', key: 'receipt_url', width: 30 },
      { header: 'Asset ID', key: 'asset_id', width: 38 },
      { header: 'Sub-type ID', key: 'sub_type_id', width: 38 },
      { header: 'Created At', key: 'created_at', width: 20, type: 'datetime' },
      { header: 'Deleted At', key: 'deleted_at', width: 20, type: 'datetime' },
    ],
  },
  {
    name: 'Expense Assets', table: 'expense_assets',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Type', key: 'asset_type', width: 12 },
      { header: 'Details', key: 'details', width: 40, type: 'json' },
      { header: 'Active', key: 'is_active', width: 10 },
      { header: 'Created At', key: 'created_at', width: 20, type: 'datetime' },
      { header: 'Deleted At', key: 'deleted_at', width: 20, type: 'datetime' },
    ],
  },
  {
    name: 'Expense Sub-types', table: 'expense_sub_types',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Sort Order', key: 'sort_order', width: 10 },
      { header: 'Active', key: 'is_active', width: 10 },
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
    name: 'Locations', table: 'locations',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Short Code', key: 'short_code', width: 12 },
      { header: 'Sort Order', key: 'sort_order', width: 12 },
      { header: 'Active', key: 'is_active', width: 10 },
      { header: 'Created At', key: 'created_at', width: 20, type: 'datetime' },
      { header: 'Deleted At', key: 'deleted_at', width: 20, type: 'datetime' },
    ],
  },
  {
    name: 'Suppliers', table: 'suppliers',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Created At', key: 'created_at', width: 20, type: 'datetime' },
      { header: 'Deleted At', key: 'deleted_at', width: 20, type: 'datetime' },
    ],
  },
  {
    name: 'Stock Purchases', table: 'stock_purchases',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Supplier ID', key: 'supplier_id', width: 38 },
      { header: 'Product ID', key: 'product_id', width: 38 },
      { header: 'Quantity', key: 'quantity', width: 10 },
      { header: 'Unit Price', key: 'unit_price_paisa', width: 14, type: 'paisa' },
      { header: 'Total', key: 'total_paisa', width: 14, type: 'paisa' },
      { header: 'Date', key: 'purchase_date', width: 12, type: 'date' },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Created By', key: 'created_by', width: 38 },
      { header: 'Created At', key: 'created_at', width: 20, type: 'datetime' },
      { header: 'Deleted At', key: 'deleted_at', width: 20, type: 'datetime' },
    ],
  },
  {
    name: 'Supplier Payments', table: 'supplier_payments',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Supplier ID', key: 'supplier_id', width: 38 },
      { header: 'Amount', key: 'amount_paisa', width: 14, type: 'paisa' },
      { header: 'Date', key: 'payment_date', width: 12, type: 'date' },
      { header: 'Method', key: 'payment_method', width: 14 },
      { header: 'Reference', key: 'reference', width: 20 },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Created By', key: 'created_by', width: 38 },
      { header: 'Created At', key: 'created_at', width: 20, type: 'datetime' },
      { header: 'Deleted At', key: 'deleted_at', width: 20, type: 'datetime' },
    ],
  },
  {
    name: 'Stock Movements', table: 'stock_movements',
    columns: [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Product ID', key: 'product_id', width: 38 },
      { header: 'Invoice ID', key: 'invoice_id', width: 38 },
      { header: 'Return ID', key: 'return_id', width: 38 },
      { header: 'Purchase ID', key: 'stock_purchase_id', width: 38 },
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
    name: 'Audit Log', table: 'audit_log', scope: 'global',
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

  // ── Reference / structural tables ────────────────────────────────
  // Added so the workbook covers all 20 tables in the schema. These use
  // Karachi-local timestamps and content-sized columns.
  {
    name: 'Businesses', table: 'businesses', scope: 'self',
    karachiDates: true, autoSize: true,
    columns: [
      { header: 'ID', key: 'id' },
      { header: 'Name', key: 'name' },
      { header: 'Type', key: 'type' },
      { header: 'Active', key: 'is_active' },
      { header: 'Created At (PKT)', key: 'created_at', type: 'datetime' },
      { header: 'Updated At (PKT)', key: 'updated_at', type: 'datetime' },
    ],
  },
  {
    name: 'Users', table: 'users', scope: 'via-user-businesses',
    excludeDeleted: true, karachiDates: true, autoSize: true,
    columns: [
      { header: 'ID', key: 'id' },
      { header: 'Email', key: 'email' },
      { header: 'Full Name', key: 'full_name' },
      { header: 'Phone', key: 'phone' },
      { header: 'Role', key: 'role' },
      { header: 'Active', key: 'is_active' },
      { header: 'Last Login At (PKT)', key: 'last_login_at', type: 'datetime' },
      { header: 'Created At (PKT)', key: 'created_at', type: 'datetime' },
      { header: 'Updated At (PKT)', key: 'updated_at', type: 'datetime' },
    ],
  },
  {
    name: 'User Businesses', table: 'user_businesses', scope: 'business',
    karachiDates: true, autoSize: true,
    columns: [
      { header: 'User ID', key: 'user_id' },
      { header: 'Business ID', key: 'business_id' },
      { header: 'Created At (PKT)', key: 'created_at', type: 'datetime' },
    ],
  },
  {
    name: 'Customer Categories', table: 'customer_categories', scope: 'business',
    karachiDates: true, autoSize: true,
    columns: [
      { header: 'ID', key: 'id' },
      { header: 'Business ID', key: 'business_id' },
      { header: 'Name', key: 'name' },
      { header: 'Created At (PKT)', key: 'created_at', type: 'datetime' },
      { header: 'Updated At (PKT)', key: 'updated_at', type: 'datetime' },
    ],
  },
  {
    name: 'App Settings', table: 'app_settings', scope: 'or-global',
    karachiDates: true, autoSize: true,
    columns: [
      { header: 'ID', key: 'id' },
      { header: 'Business ID', key: 'business_id' },
      { header: 'Key', key: 'key' },
      { header: 'Value', key: 'value' },
      { header: 'Updated By', key: 'updated_by' },
      { header: 'Updated At (PKT)', key: 'updated_at', type: 'datetime' },
    ],
  },
  {
    name: 'Backups', table: 'backups', scope: 'business',
    karachiDates: true, autoSize: true,
    columns: [
      { header: 'ID', key: 'id' },
      { header: 'Type', key: 'type' },
      { header: 'Status', key: 'status' },
      { header: 'Storage Path', key: 'storage_path' },
      // BIGINT, but bytes — not money. Deliberately untyped so it is
      // never divided by 100.
      { header: 'File Size (bytes)', key: 'file_size_bytes' },
      { header: 'Triggered By', key: 'triggered_by' },
      { header: 'Started At (PKT)', key: 'started_at', type: 'datetime' },
      { header: 'Completed At (PKT)', key: 'completed_at', type: 'datetime' },
      { header: 'Error', key: 'error_message' },
      { header: 'Created At (PKT)', key: 'created_at', type: 'datetime' },
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
  const metaSheetCountRow = meta.addRow({ key: 'Sheet Count', value: 0 });
  meta.addRow({
    key: 'Money Columns',
    value:
      'Shown in rupees to 2dp. Stored values are integer paisa (1 PKR = 100 paisa).',
  });
  meta.addRow({
    key: 'Timestamps',
    value:
      'Columns marked (PKT) are Asia/Karachi wall-clock. All others are UTC, as stored.',
  });

  // Per table
  for (const spec of SHEETS) {
    const ws = wb.addWorksheet(spec.name);
    ws.columns = spec.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: 'FFEFEFEF' },
    } as ExcelJS.Fill;

    const applyFormats = () => {
      for (let i = 0; i < spec.columns.length; i++) {
        const col = ws.getColumn(i + 1);
        const def = spec.columns[i];
        if (def.type === 'paisa') col.numFmt = MONEY_FMT;
        if (def.type === 'date') col.numFmt = DATE_FMT;
        if (def.type === 'datetime') col.numFmt = DATETIME_FMT;
      }
      ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    };

    // Tables with no business_id column must scope via their parent:
    //   invoice_items → invoice_id ∈ invoices(business_id=...)
    //   return_items  → return_id  ∈ returns(business_id=...)
    //   users         → id ∈ user_businesses(business_id=...)
    //   audit_log     → global, admin sees everything
    const scope: SheetScope = spec.scope ?? 'business';
    let q = adminClient.from(spec.table).select('*').limit(ROW_LIMIT);

    if (scope === 'via-invoices' || scope === 'via-returns' || scope === 'via-user-businesses') {
      const parent =
        scope === 'via-invoices'
          ? { table: 'invoices', select: 'id', fk: 'invoice_id' }
          : scope === 'via-returns'
            ? { table: 'returns', select: 'id', fk: 'return_id' }
            : { table: 'user_businesses', select: 'user_id', fk: 'id' };

      const { data: parentRows } = await adminClient
        .from(parent.table)
        .select(parent.select)
        .eq('business_id', businessId);

      const ids = Array.from(
        new Set(
          ((parentRows ?? []) as unknown as Array<Record<string, unknown>>)
            .map((r) => r[parent.select])
            .filter((v): v is string => typeof v === 'string'),
        ),
      );

      if (ids.length === 0) {
        // No parent rows → leave sheet empty but still formatted
        applyFormats();
        if (spec.autoSize) autoSizeColumns(ws);
        continue;
      }
      q = adminClient.from(spec.table).select('*').in(parent.fk, ids).limit(ROW_LIMIT);
    } else if (scope === 'self') {
      q = q.eq('id', businessId);
    } else if (scope === 'or-global') {
      // Rows for this business, plus any shared/global rows (business_id IS NULL)
      q = q.or(`business_id.eq.${businessId},business_id.is.null`);
    } else if (scope === 'business') {
      q = q.eq('business_id', businessId);
    }
    // scope === 'global' → no filter

    if (spec.excludeDeleted) q = q.is('deleted_at', null);

    const { data, error } = await q;
    if (error) {
      ws.addRow({ [spec.columns[0].key]: `ERROR: ${error.message}` });
      continue;
    }

    // Resolve lookup columns (e.g. customers.location_id → locations.name)
    // in one query per lookup table, keyed by id.
    const lookupMaps = new Map<string, Map<string, unknown>>();
    for (const col of spec.columns) {
      if (!col.lookup || lookupMaps.has(col.lookup.table)) continue;
      const { data: lookupRows } = await adminClient
        .from(col.lookup.table)
        .select(`id, ${col.lookup.column}`)
        .limit(ROW_LIMIT);
      lookupMaps.set(
        col.lookup.table,
        new Map(
          ((lookupRows ?? []) as unknown as Array<Record<string, unknown>>).map((r) => [
            String(r.id),
            r[col.lookup!.column],
          ]),
        ),
      );
    }

    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const cleaned: Record<string, unknown> = {};
      for (const col of spec.columns) {
        const raw = col.lookup
          ? lookupMaps.get(col.lookup.table)?.get(String(row[col.lookup.via] ?? ''))
            ?? col.lookup.fallback
            ?? null
          : row[col.key];
        if (raw === null || raw === undefined) {
          cleaned[col.key] = null;
        } else if (col.type === 'paisa') {
          // Store as a number so Excel formula sums work; format applies the Rs. prefix.
          cleaned[col.key] = Number(raw) / 100;
        } else if (col.type === 'date' || col.type === 'datetime') {
          const asDate = raw as string;
          cleaned[col.key] = spec.karachiDates
            ? toKarachiExcelDate(asDate)
            : new Date(asDate);
        } else if (col.type === 'json') {
          cleaned[col.key] = raw == null ? '' : JSON.stringify(raw);
        } else {
          cleaned[col.key] = raw;
        }
      }
      ws.addRow(cleaned);
    }

    applyFormats();
    if (spec.autoSize) autoSizeColumns(ws);
  }

  // Written now that every sheet exists, so it counts what the workbook
  // actually contains rather than what SHEETS was expected to produce.
  metaSheetCountRow.getCell('value').value = wb.worksheets.length;

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
