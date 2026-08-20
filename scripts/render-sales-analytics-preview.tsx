// Renders the analytics PDF + workbook from a synthetic dataset, then re-reads
// the workbook, to prove both actually build and open.
import { renderToFile } from '@react-pdf/renderer';
import ExcelJS from 'exceljs';
import { SalesAnalyticsPDF } from '@/components/reports/sales-analytics-pdf';
import type { SalesAnalyticsData } from '@/lib/reports/sales-analytics-data';
import type { ProductPeriodRow } from '@/lib/sales-analytics';
import { deadStock } from '@/lib/sales-analytics';

const p = (o: Partial<ProductPeriodRow>): ProductPeriodRow => ({
  product_id: 'p', product_name: 'Product', product_sku: 'SKU', product_unit: 'can',
  pack_size: 12, pack_name: 'Box', is_active: true,
  sale_price_paisa: 220000, purchase_price_paisa: 150000,
  brand_id: 'b1', brand_name: 'Double Horse', brand_type: 'multinational',
  stock_on_hand: 100,
  qty_7d: 12, sales_7d_paisa: 1800000, invoices_7d: 3,
  qty_15d: 25, sales_15d_paisa: 4000000, invoices_15d: 6,
  qty_30d: 58, sales_30d_paisa: 9280000, invoices_30d: 12,
  qty_prev_30d: 40, sales_prev_30d_paisa: 6400000,
  qty_90d: 165, sales_90d_paisa: 26400000, invoices_90d: 30,
  qty_180d: 300, sales_180d_paisa: 48000000,
  qty_365d: 420, sales_365d_paisa: 67200000,
  qty_all: 420, sales_all_paisa: 67200000, invoices_all: 60,
  profit_all_paisa: 12000000, profit_30d_paisa: 1800000,
  last_sale_date: '2026-08-17', days_since_last_sale: 3, avg_daily_qty_30d: 1.93,
  ...o,
});

const products = [
  p({ product_id: 'a', product_name: 'DH Motor Oil 20W-50' }),
  p({ product_id: 'b', product_name: 'Shell Helix HX3', brand_id: 'b2', brand_name: 'Shell', sales_30d_paisa: 5760000, sales_prev_30d_paisa: 9000000 }),
  p({ product_id: 'c', product_name: 'Air Filter (Universal)', brand_id: null, brand_name: null, qty_all: 0, sales_all_paisa: 0, sales_30d_paisa: 0, sales_prev_30d_paisa: 0, last_sale_date: null, days_since_last_sale: null, stock_on_hand: 19, sale_price_paisa: 4500000 }),
  p({ product_id: 'd', product_name: 'DH Coolant 1L', days_since_last_sale: 45, stock_on_hand: 138, sale_price_paisa: 65000 }),
];

const data: SalesAnalyticsData = {
  range: { from: '2026-08-01', to: '2026-08-20' },
  brandName: null,
  current: { salesPaisa: 35000000, quantity: 1240, invoiceCount: 47, lineCount: 120, averageInvoicePaisa: 744680, profitPaisa: 6200000 },
  previous: { salesPaisa: 31250000, quantity: 1278, invoiceCount: 43, lineCount: 110, averageInvoicePaisa: 726744, profitPaisa: 5900000 },
  brands: [
    { id: 'b1', name: 'Double Horse', salesPaisa: 32000000, quantity: 180, invoiceCount: 30, productCount: 12, profitPaisa: 5000000, sharePercent: 62.5 },
    { id: 'b2', name: 'Shell', salesPaisa: 18000000, quantity: 95, invoiceCount: 20, productCount: 8, profitPaisa: 2000000, sharePercent: 35.2 },
    { id: '', name: 'Unbranded', salesPaisa: 1200000, quantity: 15, invoiceCount: 5, productCount: 18, profitPaisa: 200000, sharePercent: 2.3 },
  ],
  customers: [
    { id: 'c1', name: 'Ali (Rajana)', salesPaisa: 7200000, quantity: 45, invoiceCount: 9, productCount: 4, profitPaisa: 900000, sharePercent: 20 },
    { id: 'c2', name: 'Hassan (Toba)', salesPaisa: 4800000, quantity: 30, invoiceCount: 6, productCount: 3, profitPaisa: 600000, sharePercent: 14 },
  ],
  locations: [{ id: 'l1', name: 'Rajana', salesPaisa: 19200000, quantity: 120, invoiceCount: 25, productCount: 10, profitPaisa: 2400000, sharePercent: 55 }],
  daily: [
    { date: '2026-08-18', quantity: 12, amountPaisa: 1800000 },
    { date: '2026-08-19', quantity: 8, amountPaisa: 1440000 },
    { date: '2026-08-20', quantity: 20, amountPaisa: 3000000 },
  ],
  products,
  dead: deadStock(products, 30),
  deadStockDays: 30,
  costVisible: true,
};

const OUT = process.argv[2] ?? '.';

async function main() {
  await renderToFile(
    SalesAnalyticsPDF({ data, businessName: 'Khaliq Oil Company', generatedAt: '20 Aug 2026 21:00' }),
    `${OUT}/sales-analytics.pdf`,
  );
  console.log('PDF written');

  const { buildSalesAnalyticsWorkbook } = await import('@/lib/reports/sales-analytics-excel');
  const buf = await buildSalesAnalyticsWorkbook(data, 'Khaliq Oil Company');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  console.log('Sheets:', wb.worksheets.map((w) => `${w.name}(${w.rowCount}r)`).join(', '));

  // A reloaded workbook has no column keys, so cells are read by index here.
  const ws = wb.getWorksheet('Product Sales')!;
  console.log('Product Sales header:', (ws.getRow(1).values as unknown[]).slice(1).join(' | '));
  for (const r of [2, 3, 4]) {
    const row = ws.getRow(r);
    const s30 = row.getCell(7);
    console.log(
      `  ${String(row.getCell(1).value).padEnd(24)} sales30=${s30.value} fmt=${s30.numFmt}`,
      `colour=${JSON.stringify((s30.font ?? {}).color ?? null)}`,
      `name-colour=${JSON.stringify((row.getCell(1).font ?? {}).color ?? null)}`,
    );
  }

  const summary = wb.getWorksheet('Summary')!;
  console.log('Summary total-sales row:', (summary.getRow(6).values as unknown[]).slice(1).join(' | '));

  const dead = wb.getWorksheet('Dead Stock')!;
  console.log('Dead stock:', dead.rowCount, 'rows | note:', dead.getRow(2).getCell(1).value);
  for (const r of [3, 4]) {
    const row = dead.getRow(r);
    console.log(`  ${String(row.getCell(1).value).padEnd(24)} value=${row.getCell(4).value} last=${row.getCell(6).value}`);
  }

  const anyPaisa = ws.getRow(2).getCell(5).value;
  if (typeof anyPaisa === 'number' && !Number.isInteger(anyPaisa * 100)) {
    throw new Error('money cell is not clean rupees');
  }
  console.log('OK: money written as rupees, not paisa');
}
main().catch((e) => { console.error(e); process.exit(1); });
