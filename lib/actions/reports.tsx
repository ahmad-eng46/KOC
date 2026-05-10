'use server';

import { renderToBuffer } from '@react-pdf/renderer';
import ExcelJS from 'exceljs';
import { format, parseISO } from 'date-fns';
import { getSession } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { formatPKR } from '@/lib/money';
import {
  fetchSalesData, fetchPurchaseData, fetchCustomerReportData,
  fetchBalanceData, fetchPLData,
} from '@/lib/reports/data';
import {
  SalesReportPDF, PurchaseReportPDF, CustomerReportPDF,
  BalanceReportPDF, PLReportPDF,
} from '@/components/reports/pdfs';
import type { DateRange } from '@/components/reports/shared';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';

type ExportResult =
  | { ok: true; base64: string; filename: string }
  | { ok: false; error: string };

async function ensureRole(...roles: ('admin' | 'accountant' | 'staff' | 'viewer')[]): Promise<string | null> {
  const session = await getSession();
  if (!session) return 'Not signed in.';
  if (!roles.includes(session.role)) return 'Insufficient permissions.';
  return null;
}

function pdfDate() { return format(new Date(), 'yyyy-MM-dd'); }

async function getBusinessName(): Promise<string> {
  const supabase = await createServerClient();
  const businessId = await getActiveBusinessId();
  const { data } = await supabase.from('businesses').select('name').eq('id', businessId).single();
  return data?.name ?? 'Business';
}

// ───────────────────────────────────────────────
// SALES
// ───────────────────────────────────────────────
export async function exportSalesPdf(range: DateRange): Promise<ExportResult> {
  const err = await ensureRole('admin', 'accountant', 'staff', 'viewer');
  if (err) return { ok: false, error: err };
  try {
    const [data, businessName] = await Promise.all([fetchSalesData(range), getBusinessName()]);
    const buf = await renderToBuffer(<SalesReportPDF data={data} range={range} businessName={businessName} />);
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `sales-${range.from}-to-${range.to}.pdf` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function exportSalesExcel(range: DateRange): Promise<ExportResult> {
  const err = await ensureRole('admin', 'accountant', 'staff', 'viewer');
  if (err) return { ok: false, error: err };
  try {
    const data = await fetchSalesData(range);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Invoices');
    ws.addRow(['Date', 'Number', 'Customer', 'Total', 'Paid']);
    ws.getRow(1).font = { bold: true };
    for (const r of data.rows) {
      ws.addRow([
        format(parseISO(r.issue_date), 'yyyy-MM-dd'),
        r.invoice_number, r.customer_name,
        r.total_paisa / 100, r.paid_paisa / 100,
      ]);
    }
    ws.columns.forEach((c) => { c.width = 18; });

    const tc = wb.addWorksheet('Top Customers');
    tc.addRow(['Customer', 'Invoices', 'Total']);
    tc.getRow(1).font = { bold: true };
    for (const r of data.top_customers) tc.addRow([r.customer_name, r.invoice_count, r.total_paisa / 100]);

    const buf = await wb.xlsx.writeBuffer();
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `sales-${range.from}-to-${range.to}.xlsx` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ───────────────────────────────────────────────
// PURCHASE
// ───────────────────────────────────────────────
export async function exportPurchasePdf(range: DateRange): Promise<ExportResult> {
  const err = await ensureRole('admin', 'accountant');
  if (err) return { ok: false, error: err };
  try {
    const [data, businessName] = await Promise.all([fetchPurchaseData(range), getBusinessName()]);
    const buf = await renderToBuffer(<PurchaseReportPDF data={data} range={range} businessName={businessName} />);
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `purchase-${range.from}-to-${range.to}.pdf` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function exportPurchaseExcel(range: DateRange): Promise<ExportResult> {
  const err = await ensureRole('admin', 'accountant');
  if (err) return { ok: false, error: err };
  try {
    const data = await fetchPurchaseData(range);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Movements');
    ws.addRow(['Date', 'Product', 'SKU', 'Unit', 'Quantity', 'Rate', 'Value', 'Note']);
    ws.getRow(1).font = { bold: true };
    for (const r of data.rows) {
      ws.addRow([r.movement_date, r.product_name, r.sku ?? '', r.unit, r.quantity, r.purchase_price_paisa / 100, r.total_value_paisa / 100, r.note ?? '']);
    }

    const bp = wb.addWorksheet('By Product');
    bp.addRow(['Product', 'Quantity', 'Value']);
    bp.getRow(1).font = { bold: true };
    for (const r of data.by_product) bp.addRow([r.product_name, r.quantity, r.total_value_paisa / 100]);

    const buf = await wb.xlsx.writeBuffer();
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `purchase-${range.from}-to-${range.to}.xlsx` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ───────────────────────────────────────────────
// CUSTOMER
// ───────────────────────────────────────────────
export async function exportCustomerPdf(): Promise<ExportResult> {
  const err = await ensureRole('admin', 'accountant', 'staff', 'viewer');
  if (err) return { ok: false, error: err };
  try {
    const [data, businessName] = await Promise.all([fetchCustomerReportData(), getBusinessName()]);
    const buf = await renderToBuffer(<CustomerReportPDF data={data} businessName={businessName} />);
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `customers-${pdfDate()}.pdf` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function exportCustomerExcel(): Promise<ExportResult> {
  const err = await ensureRole('admin', 'accountant', 'staff', 'viewer');
  if (err) return { ok: false, error: err };
  try {
    const data = await fetchCustomerReportData();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Customers');
    ws.addRow(['Customer', 'Phone', 'Invoiced', 'Paid', 'Balance', 'Last Activity']);
    ws.getRow(1).font = { bold: true };
    for (const r of data.rows) {
      ws.addRow([r.customer_name, r.phone ?? '', r.invoiced_paisa / 100, r.paid_paisa / 100, r.balance_paisa / 100, r.last_activity ?? '']);
    }
    const buf = await wb.xlsx.writeBuffer();
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `customers-${pdfDate()}.xlsx` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ───────────────────────────────────────────────
// BALANCE / RECEIVABLES
// ───────────────────────────────────────────────
export async function exportBalancePdf(): Promise<ExportResult> {
  const err = await ensureRole('admin', 'accountant', 'staff', 'viewer');
  if (err) return { ok: false, error: err };
  try {
    const [data, businessName] = await Promise.all([fetchBalanceData(), getBusinessName()]);
    const buf = await renderToBuffer(<BalanceReportPDF data={data} businessName={businessName} />);
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `receivables-${pdfDate()}.pdf` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function exportBalanceExcel(): Promise<ExportResult> {
  const err = await ensureRole('admin', 'accountant', 'staff', 'viewer');
  if (err) return { ok: false, error: err };
  try {
    const data = await fetchBalanceData();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Receivables');
    ws.addRow(['Customer', 'Phone', 'Last Activity', 'Days Inactive', 'Bucket', 'Balance']);
    ws.getRow(1).font = { bold: true };
    for (const r of data.rows) {
      ws.addRow([r.customer_name, r.phone ?? '', r.last_activity ?? '', r.days_inactive, r.bucket, r.balance_paisa / 100]);
    }
    const buf = await wb.xlsx.writeBuffer();
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `receivables-${pdfDate()}.xlsx` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ───────────────────────────────────────────────
// P&L
// ───────────────────────────────────────────────
export async function exportPLPdf(range: DateRange): Promise<ExportResult> {
  const err = await ensureRole('admin', 'accountant');
  if (err) return { ok: false, error: err };
  try {
    const data = await fetchPLData(range);
    const buf = await renderToBuffer(<PLReportPDF data={data} />);
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `pl-${range.from}-to-${range.to}.pdf` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function exportPLExcel(range: DateRange): Promise<ExportResult> {
  const err = await ensureRole('admin', 'accountant');
  if (err) return { ok: false, error: err };
  try {
    const d = await fetchPLData(range);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('P&L');
    ws.addRow(['Profit & Loss', d.business_name]);
    ws.addRow(['Period', `${range.from} to ${range.to}`]);
    ws.addRow([]);
    ws.addRow(['Sales', d.sales_paisa / 100]);
    ws.addRow(['Less: Returns', -d.returns_paisa / 100]);
    ws.addRow(['Net Sales', d.net_sales_paisa / 100]);
    ws.addRow([]);
    ws.addRow(['COGS', d.cogs_paisa / 100]);
    ws.addRow(['Less: COGS reversed by returns', -d.cogs_returns_paisa / 100]);
    ws.addRow(['Net COGS', d.net_cogs_paisa / 100]);
    ws.addRow([]);
    ws.addRow(['Gross Profit', d.gross_profit_paisa / 100]);
    ws.addRow([]);
    ws.addRow(['Operating Expenses', d.opex_paisa / 100]);
    ws.addRow([`Home Expenses (${d.include_home_in_pnl ? 'included' : 'excluded'})`, (d.include_home_in_pnl ? d.home_exp_paisa : 0) / 100]);
    ws.addRow(['Total Expenses', d.total_exp_paisa / 100]);
    ws.addRow([]);
    ws.addRow(['Net Profit', d.net_profit_paisa / 100]);
    ws.getRow(1).font = { bold: true, size: 14 };
    ws.getColumn(1).width = 36;
    ws.getColumn(2).width = 20;

    const cat = wb.addWorksheet('Categories');
    cat.addRow(['Category', 'Type', 'Total']);
    cat.getRow(1).font = { bold: true };
    for (const c of d.expenses_by_category) cat.addRow([c.category, c.type, c.total_paisa / 100]);

    const buf = await wb.xlsx.writeBuffer();
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `pl-${range.from}-to-${range.to}.xlsx` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ───────────────────────────────────────────────
// DEFAULTERS
// ───────────────────────────────────────────────
import { fetchDefaultersData, fetchStockData, fetchCashBookData, fetchAuditData, type AuditFilters } from '@/lib/reports/data';
import { DefaultersReportPDF, StockReportPDF, CashBookReportPDF, AuditReportPDF } from '@/components/reports/pdfs';

export async function exportDefaultersPdf(): Promise<ExportResult> {
  const err = await ensureRole('admin', 'accountant', 'staff', 'viewer');
  if (err) return { ok: false, error: err };
  try {
    const [data, businessName] = await Promise.all([fetchDefaultersData(), getBusinessName()]);
    const buf = await renderToBuffer(<DefaultersReportPDF data={data} businessName={businessName} />);
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `defaulters-${pdfDate()}.pdf` };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function exportDefaultersExcel(): Promise<ExportResult> {
  const err = await ensureRole('admin', 'accountant', 'staff', 'viewer');
  if (err) return { ok: false, error: err };
  try {
    const data = await fetchDefaultersData();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Defaulters');
    ws.addRow(['Customer', 'Phone', 'Last Activity', 'Days Inactive', 'Balance']);
    ws.getRow(1).font = { bold: true };
    for (const r of data.rows) ws.addRow([r.customer_name, r.phone ?? '', r.last_activity ?? '', r.days_inactive, r.balance_paisa / 100]);
    const buf = await wb.xlsx.writeBuffer();
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `defaulters-${pdfDate()}.xlsx` };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// ───────────────────────────────────────────────
// STOCK
// ───────────────────────────────────────────────
export async function exportStockPdf(): Promise<ExportResult> {
  const err = await ensureRole('admin', 'accountant', 'staff', 'viewer');
  if (err) return { ok: false, error: err };
  try {
    const session = await getSession();
    const includeCost = session?.role === 'admin' || session?.role === 'accountant';
    const [data, businessName] = await Promise.all([fetchStockData(), getBusinessName()]);
    const buf = await renderToBuffer(<StockReportPDF data={data} businessName={businessName} includeCost={includeCost} />);
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `stock-${pdfDate()}.pdf` };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function exportStockExcel(): Promise<ExportResult> {
  const err = await ensureRole('admin', 'accountant', 'staff', 'viewer');
  if (err) return { ok: false, error: err };
  try {
    const session = await getSession();
    const includeCost = session?.role === 'admin' || session?.role === 'accountant';
    const data = await fetchStockData();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Stock');
    const headers = ['Product', 'SKU', 'Unit', 'On Hand', 'Sale Price'];
    if (includeCost) headers.push('Cost', 'Value at Cost');
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true };
    for (const r of data.rows) {
      const row: (string | number)[] = [r.product_name, r.sku ?? '', r.unit, r.quantity_on_hand, r.sale_price_paisa / 100];
      if (includeCost) row.push(r.purchase_price_paisa != null ? r.purchase_price_paisa / 100 : '', r.value_at_cost_paisa / 100);
      ws.addRow(row);
    }
    const buf = await wb.xlsx.writeBuffer();
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `stock-${pdfDate()}.xlsx` };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// ───────────────────────────────────────────────
// CASH BOOK
// ───────────────────────────────────────────────
export async function exportCashBookPdf(range: DateRange): Promise<ExportResult> {
  const err = await ensureRole('admin', 'accountant');
  if (err) return { ok: false, error: err };
  try {
    const [data, businessName] = await Promise.all([fetchCashBookData(range), getBusinessName()]);
    const buf = await renderToBuffer(<CashBookReportPDF data={data} range={range} businessName={businessName} />);
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `cashbook-${range.from}-to-${range.to}.pdf` };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function exportCashBookExcel(range: DateRange): Promise<ExportResult> {
  const err = await ensureRole('admin', 'accountant');
  if (err) return { ok: false, error: err };
  try {
    const data = await fetchCashBookData(range);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Cash Book');
    ws.addRow(['Date', 'Description', 'In', 'Out']);
    ws.getRow(1).font = { bold: true };
    for (const e of data.entries) ws.addRow([e.date, e.description, e.kind === 'in' ? e.amount_paisa / 100 : '', e.kind === 'out' ? e.amount_paisa / 100 : '']);
    ws.addRow([]);
    ws.addRow(['Closing Balance', '', '', data.closing_paisa / 100]).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `cashbook-${range.from}-to-${range.to}.xlsx` };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// ───────────────────────────────────────────────
// AUDIT (admin)
// ───────────────────────────────────────────────
export async function exportAuditPdf(filters: AuditFilters): Promise<ExportResult> {
  const err = await ensureRole('admin');
  if (err) return { ok: false, error: err };
  try {
    const data = await fetchAuditData(filters);
    const buf = await renderToBuffer(<AuditReportPDF data={data} range={{ from: filters.from, to: filters.to }} />);
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `audit-${filters.from}-to-${filters.to}.pdf` };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function exportAuditExcel(filters: AuditFilters): Promise<ExportResult> {
  const err = await ensureRole('admin');
  if (err) return { ok: false, error: err };
  try {
    const data = await fetchAuditData(filters);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Audit');
    ws.addRow(['Time', 'User', 'Table', 'Action', 'Row ID', 'Before', 'After']);
    ws.getRow(1).font = { bold: true };
    for (const r of data.rows) {
      ws.addRow([
        r.at, r.user_email ?? 'system', r.table_name, r.action, r.row_id,
        r.before_jsonb ? JSON.stringify(r.before_jsonb) : '',
        r.after_jsonb ? JSON.stringify(r.after_jsonb) : '',
      ]);
    }
    const buf = await wb.xlsx.writeBuffer();
    return { ok: true, base64: Buffer.from(buf).toString('base64'), filename: `audit-${filters.from}-to-${filters.to}.xlsx` };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
