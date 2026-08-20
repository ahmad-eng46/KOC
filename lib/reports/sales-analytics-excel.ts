// Workbook builder for the sales analytics export. A plain module, not a
// server action, so it can be rendered and re-opened in a test without Next.

import ExcelJS from 'exceljs';
import { format, parseISO } from 'date-fns';
import { percentChange } from '@/lib/sales-analytics';
import type { SalesAnalyticsData } from '@/lib/reports/sales-analytics-data';

/** Rupees as a number so the column still sums; paisa never reaches a cell. */
const MONEY_FORMAT = '#,##0.00';
const rupees = (paisa: number) => paisa / 100;

export async function buildSalesAnalyticsWorkbook(
  data: SalesAnalyticsData,
  businessName: string,
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = businessName;
  wb.created = new Date();

  buildSummary(wb, data, businessName);
  buildBrands(wb, data);
  buildProducts(wb, data);
  buildDaily(wb, data);
  buildDeadStock(wb, data);

  return wb.xlsx.writeBuffer();
}

// ───────────────────────────────────────────────
function header(ws: ExcelJS.Worksheet, row: number) {
  const r = ws.getRow(row);
  r.font = { bold: true };
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
  r.commit();
}

/** Green for growth, red for decline — the only conditional colouring used. */
function tintByChange(cell: ExcelJS.Cell, change: number | null) {
  if (change === null) return;
  if (change > 0) cell.font = { color: { argb: 'FF15803D' } };
  else if (change < 0) cell.font = { color: { argb: 'FFB91C1C' } };
}

function buildSummary(wb: ExcelJS.Workbook, data: SalesAnalyticsData, name: string) {
  const ws = wb.addWorksheet('Summary', { properties: { tabColor: { argb: 'FF2563EB' } } });
  ws.columns = [
    { header: 'Metric', key: 'metric', width: 28 },
    { header: 'This period', key: 'current', width: 18 },
    { header: 'Previous period', key: 'previous', width: 18 },
    { header: 'Change', key: 'change', width: 14 },
  ];
  header(ws, 1);

  ws.addRow({ metric: 'Business', current: name });
  ws.addRow({ metric: 'Brand', current: data.brandName ?? 'All brands' });
  ws.addRow({ metric: 'Range', current: `${data.range.from} to ${data.range.to}` });
  ws.addRow({});

  const metrics: Array<[string, number, number, boolean]> = [
    ['Total sales', data.current.salesPaisa, data.previous.salesPaisa, true],
    ['Invoices', data.current.invoiceCount, data.previous.invoiceCount, false],
    ['Quantity sold', data.current.quantity, data.previous.quantity, false],
    ['Average invoice', data.current.averageInvoicePaisa, data.previous.averageInvoicePaisa, true],
  ];
  if (data.costVisible && data.current.profitPaisa !== null) {
    metrics.push(['Profit', data.current.profitPaisa, data.previous.profitPaisa ?? 0, true]);
  }

  for (const [label, now, before, isMoney] of metrics) {
    const row = ws.addRow({
      metric: label,
      current: isMoney ? rupees(now) : now,
      previous: isMoney ? rupees(before) : before,
      change: percentChange(now, before) === null ? '—' : percentChange(now, before)! / 100,
    });
    if (isMoney) {
      row.getCell('current').numFmt = MONEY_FORMAT;
      row.getCell('previous').numFmt = MONEY_FORMAT;
    }
    const changeCell = row.getCell('change');
    if (typeof changeCell.value === 'number') changeCell.numFmt = '0.0%';
    tintByChange(changeCell, percentChange(now, before));
  }
}

function buildBrands(wb: ExcelJS.Workbook, data: SalesAnalyticsData) {
  const ws = wb.addWorksheet('Brand Performance');
  ws.columns = [
    { header: 'Brand', key: 'brand', width: 26 },
    { header: 'Products', key: 'products', width: 10 },
    { header: 'Invoices', key: 'invoices', width: 10 },
    { header: 'Quantity', key: 'qty', width: 12 },
    { header: 'Sales (Rs.)', key: 'sales', width: 16 },
    { header: 'Share', key: 'share', width: 10 },
  ];
  header(ws, 1);

  for (const b of data.brands) {
    const row = ws.addRow({
      brand: b.name, products: b.productCount, invoices: b.invoiceCount,
      qty: b.quantity, sales: rupees(b.salesPaisa), share: b.sharePercent / 100,
    });
    row.getCell('sales').numFmt = MONEY_FORMAT;
    row.getCell('share').numFmt = '0.0%';
  }
}

function buildProducts(wb: ExcelJS.Workbook, data: SalesAnalyticsData) {
  const ws = wb.addWorksheet('Product Sales');
  const columns: Partial<ExcelJS.Column>[] = [
    { header: 'Product', key: 'product', width: 30 },
    { header: 'SKU', key: 'sku', width: 14 },
    { header: 'Brand', key: 'brand', width: 20 },
    { header: 'Qty 7d', key: 'q7', width: 10 },
    { header: 'Sales 7d', key: 's7', width: 14 },
    { header: 'Qty 30d', key: 'q30', width: 10 },
    { header: 'Sales 30d', key: 's30', width: 14 },
    { header: 'Sales prev 30d', key: 'sp30', width: 15 },
    { header: 'Qty 90d', key: 'q90', width: 10 },
    { header: 'Sales 90d', key: 's90', width: 14 },
    { header: 'Qty all', key: 'qa', width: 10 },
    { header: 'Sales all', key: 'sa', width: 16 },
    { header: 'Stock', key: 'stock', width: 10 },
    { header: 'Last sale', key: 'last', width: 14 },
  ];
  if (data.costVisible) columns.push({ header: 'Profit all (Rs.)', key: 'profit', width: 16 });
  ws.columns = columns;
  header(ws, 1);

  for (const p of data.products) {
    const row = ws.addRow({
      product: p.product_name,
      sku: p.product_sku ?? '',
      brand: p.brand_name ?? 'Unbranded',
      q7: p.qty_7d, s7: rupees(p.sales_7d_paisa),
      q30: p.qty_30d, s30: rupees(p.sales_30d_paisa), sp30: rupees(p.sales_prev_30d_paisa),
      q90: p.qty_90d, s90: rupees(p.sales_90d_paisa),
      qa: p.qty_all, sa: rupees(p.sales_all_paisa),
      stock: p.stock_on_hand,
      last: p.last_sale_date ? format(parseISO(p.last_sale_date), 'dd MMM yyyy') : 'Never',
      ...(data.costVisible && p.profit_all_paisa !== null ? { profit: rupees(p.profit_all_paisa) } : {}),
    });
    for (const key of ['s7', 's30', 'sp30', 's90', 'sa', 'profit']) {
      const cell = row.getCell(key);
      if (typeof cell.value === 'number') cell.numFmt = MONEY_FORMAT;
    }
    // The 30-day column carries the verdict: is this product rising or falling?
    tintByChange(row.getCell('s30'), percentChange(p.sales_30d_paisa, p.sales_prev_30d_paisa));
    if (p.qty_all === 0) row.getCell('product').font = { color: { argb: 'FFB91C1C' } };
  }
}

function buildDaily(wb: ExcelJS.Workbook, data: SalesAnalyticsData) {
  const ws = wb.addWorksheet('Daily Sales');
  ws.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Quantity', key: 'qty', width: 12 },
    { header: 'Sales (Rs.)', key: 'sales', width: 16 },
  ];
  header(ws, 1);

  for (const p of data.daily) {
    const row = ws.addRow({
      date: format(parseISO(p.date), 'dd MMM yyyy'),
      qty: p.quantity,
      sales: rupees(p.amountPaisa),
    });
    row.getCell('sales').numFmt = MONEY_FORMAT;
  }
}

function buildDeadStock(wb: ExcelJS.Workbook, data: SalesAnalyticsData) {
  const ws = wb.addWorksheet('Dead Stock');
  const columns: Partial<ExcelJS.Column>[] = [
    { header: 'Product', key: 'product', width: 30 },
    { header: 'Brand', key: 'brand', width: 20 },
    { header: 'Stock', key: 'stock', width: 10 },
    { header: 'Stock value (Rs.)', key: 'value', width: 18 },
  ];
  if (data.costVisible) columns.push({ header: 'Cost value (Rs.)', key: 'cost', width: 18 });
  columns.push({ header: 'Last sale', key: 'last', width: 16 });
  ws.columns = columns;
  header(ws, 1);

  ws.addRow({ product: `No sales in the last ${data.deadStockDays} days` }).font = { italic: true };

  for (const r of data.dead) {
    const row = ws.addRow({
      product: r.product_name,
      brand: r.brand_name ?? 'Unbranded',
      stock: r.stock_on_hand,
      value: rupees(r.stockValuePaisa),
      ...(data.costVisible && r.stockCostValuePaisa !== null ? { cost: rupees(r.stockCostValuePaisa) } : {}),
      last: r.neverSold ? 'Never sold' : `${r.days_since_last_sale} days ago`,
    });
    row.getCell('value').numFmt = MONEY_FORMAT;
    const costCell = row.getCell('cost');
    if (typeof costCell.value === 'number') costCell.numFmt = MONEY_FORMAT;
    if (r.neverSold) row.getCell('last').font = { color: { argb: 'FFB91C1C' } };
  }
}
