// Renders every report PDF from synthetic data so the output can be opened and
// checked. Deliberately includes the awkward cases: empty sets, a very long
// product name, negatives, nulls and enough rows to force a page break.
import { renderToFile } from '@react-pdf/renderer';
import {
  SalesReportPDF, PurchaseReportPDF, CustomerReportPDF, BalanceReportPDF,
  PLReportPDF, DefaultersReportPDF, StockReportPDF, CashBookReportPDF,
  LocationReportPDF, AuditReportPDF,
} from '@/components/reports/pdfs';
import type { ReportIdentity } from '@/lib/reports/data';

const OUT = process.argv[2] ?? '.';
const range = { from: '2026-08-01', to: '2026-08-31' };

const identity: ReportIdentity = {
  company: {
    name: 'Khaliq Oil Company',
    address: 'Main Bazaar, Rajana, Toba Tek Singh',
    phone: '0300-1234567',
    ntn: '1234567-8',
  },
  generatedAt: '21 Aug 2026, 09:15 PM',
  generatedBy: 'Talal Naveed',
};

const LONG = 'Double Horse Premium Fully Synthetic Motor Oil 20W-50 API SN Plus 4 Litre Can';

const salesRows = Array.from({ length: 34 }, (_, i) => ({
  invoice_number: `INV-${String(i + 1).padStart(5, '0')}`,
  issue_date: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
  customer_name: i % 7 === 0 ? 'Al-Madina Petrol Pump & General Traders, Gujranwala' : `Customer ${i + 1}`,
  total_paisa: (i + 1) * 125_000,
  paid_paisa: i % 3 === 0 ? 0 : (i + 1) * 100_000,
}));

async function main() {
  await renderToFile(<SalesReportPDF identity={identity} range={range} data={{
    scopeLabel: null, rows: salesRows,
    total_paisa: salesRows.reduce((t, r) => t + r.total_paisa, 0),
    by_day: [{ date: '2026-08-01', total_paisa: 125_000, count: 1 }],
    top_customers: [{ customer_name: 'Ali', total_paisa: 7_200_000, invoice_count: 9 }],
  }} />, `${OUT}/r-sales.pdf`);

  await renderToFile(<PurchaseReportPDF identity={identity} range={range} data={{
    rows: [
      { product_name: LONG, sku: 'SAE50-CC', unit: 'can',
        quantity: 240, purchase_price_paisa: 180_000, total_value_paisa: 43_200_000,
        movement_date: '2026-08-02', note: 'Purchase from Double Horse — 20 boxes' },
      { product_name: 'Air Filter', sku: null, unit: 'unit',
        quantity: 0, purchase_price_paisa: 0, total_value_paisa: 0, movement_date: '2026-08-03', note: null },
    ],
    total_value_paisa: 43_200_000,
    by_product: [{ product_name: LONG, quantity: 240, total_value_paisa: 43_200_000 }],
  }} />, `${OUT}/r-purchase.pdf`);

  await renderToFile(<CustomerReportPDF identity={identity} data={{
    rows: [
      { customer_name: 'Ali', phone: '0300-1234001', invoiced_paisa: 12_00_000, paid_paisa: 7_00_000, balance_paisa: 5_00_000, last_activity: '2026-08-20' },
      { customer_name: 'Hassan (no phone)', phone: null, invoiced_paisa: 0, paid_paisa: 0, balance_paisa: 0, last_activity: null },
      { customer_name: 'Bilal — overpaid', phone: '0300-9', invoiced_paisa: 50_000, paid_paisa: 80_000, balance_paisa: -30_000, last_activity: '2026-07-01' },
    ],
  }} />, `${OUT}/r-customer.pdf`);

  await renderToFile(<BalanceReportPDF identity={identity} data={{
    rows: [
      { customer_name: 'Ali', phone: '0300-1', balance_paisa: 5_00_000, last_activity: '2026-08-20', days_inactive: 1, bucket: '0-30' },
      { customer_name: 'Old Debt', phone: null, balance_paisa: 22_00_000, last_activity: '2026-01-02', days_inactive: 231, bucket: '90+' },
    ],
    total_paisa: 27_00_000,
    by_bucket: { '0-30': 5_00_000, '31-60': 0, '61-90': 0, '90+': 22_00_000 },
  }} />, `${OUT}/r-receivables.pdf`);

  await renderToFile(<PLReportPDF identity={identity} data={{
    range, business_id: 'b', business_name: 'Khaliq Oil',
    sales_paisa: 1_20_00_000, returns_paisa: 2_00_000, net_sales_paisa: 1_18_00_000,
    cogs_paisa: 80_00_000, cogs_returns_paisa: 1_20_000, net_cogs_paisa: 78_80_000,
    gross_profit_paisa: 39_20_000, opex_paisa: 12_00_000, home_exp_paisa: 3_00_000,
    total_exp_paisa: 15_00_000, net_profit_paisa: 24_20_000, include_home_in_pnl: true,
    expenses_by_category: [
      { category: 'Transport', type: 'business', total_paisa: 8_00_000 },
      { category: 'Salary', type: 'business', total_paisa: 4_00_000 },
      { category: 'Food', type: 'home', total_paisa: 3_00_000 },
    ],
  }} />, `${OUT}/r-pl.pdf`);

  // Empty set — must still print header, filters and the empty state.
  await renderToFile(<DefaultersReportPDF identity={identity} data={{
    defaulter_days: 60, rows: [],
  }} />, `${OUT}/r-defaulters-empty.pdf`);

  await renderToFile(<StockReportPDF identity={identity} includeCost data={{
    rows: [
      { product_name: LONG, sku: 'SAE50', unit: 'can', quantity_on_hand: 236, sale_price_paisa: 220_000, purchase_price_paisa: 180_000, value_at_cost_paisa: 42_48_000, is_low: false },
      { product_name: 'Out of stock item', sku: null, unit: 'ltr', quantity_on_hand: 0, sale_price_paisa: 95_000, purchase_price_paisa: null, value_at_cost_paisa: 0, is_low: true },
      { product_name: 'Negative stock', sku: 'NEG', unit: 'pc', quantity_on_hand: -5, sale_price_paisa: 1000, purchase_price_paisa: 500, value_at_cost_paisa: -2500, is_low: true },
    ],
    total_value_paisa: 42_45_500,
  }} />, `${OUT}/r-stock-admin.pdf`);

  // Same report as staff — cost columns must be absent, not blank.
  await renderToFile(<StockReportPDF identity={identity} includeCost={false} data={{
    rows: [{ product_name: 'Air Filter', sku: 'FLT', unit: 'unit', quantity_on_hand: 70, sale_price_paisa: 95_000, purchase_price_paisa: null, value_at_cost_paisa: 0, is_low: false }],
    total_value_paisa: 0,
  }} />, `${OUT}/r-stock-staff.pdf`);

  await renderToFile(<CashBookReportPDF identity={identity} range={range} data={{
    entries: [
      { kind: 'in', date: '2026-08-20', description: 'Payment from Ali (cash)', amount_paisa: 5_00_000 },
      { kind: 'out', date: '2026-08-20', description: 'Petrol — Car LHR-1234', amount_paisa: 80_000 },
    ],
    total_in_paisa: 5_00_000, total_out_paisa: 80_000, closing_paisa: 4_20_000,
  }} />, `${OUT}/r-cashbook.pdf`);

  await renderToFile(<LocationReportPDF identity={identity} range={range} data={{
    rows: [
      { location_id: 'l1', location_name: 'Rajana', customer_count: 26, sales_paisa: 19_20_000, paid_paisa: 15_00_000, outstanding_paisa: 4_20_000, collection_pct: 78.1 },
      { location_id: 'l2', location_name: 'No Location', customer_count: 1, sales_paisa: 0, paid_paisa: 0, outstanding_paisa: 0, collection_pct: 0 },
    ],
    breakdown: new Map(),
    total_sales_paisa: 19_20_000,
    total_paid_paisa: 15_00_000,
    total_outstanding_paisa: 4_20_000,
  }} />, `${OUT}/r-location.pdf`);

  await renderToFile(<AuditReportPDF identity={identity} range={range} data={{
    rows: [
      { at: '2026-08-21T10:00:00Z', user_email: 'owner@khaliqoil.com', table_name: 'invoices', row_id: 'abc-123', action: 'INSERT', before_jsonb: null, after_jsonb: null },
      { at: '2026-08-21T11:00:00Z', user_email: null, table_name: 'payments', row_id: 'def-456', action: 'DELETE', before_jsonb: null, after_jsonb: null },
    ],
  }} />, `${OUT}/r-audit.pdf`);

  console.log('rendered 11 report PDFs');
}
main().catch((e) => { console.error(e); process.exit(1); });
