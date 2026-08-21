// Builds the whole workbook from a synthetic dataset and reads it back, so the
// new sales sheets are checked as a real file rather than in the abstract.
import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';
import type { BackupDataset } from '@/lib/backup/dataset';
import { INFO_SHEET_NAME, writeInfoSheet, setInfoSheetCount } from '@/lib/backup/info-sheet';
import {
  addSalesSummarySheet, addSalesByProductSheet, addSalesByBrandSheet,
  addSalesByCustomerSheet, addSalesByDaySheet, addSalesByWeekSheet,
  addSalesByMonthSheet, addStockReportSheet, addDeadStockSheet,
} from '@/lib/backup/sheets/sales-period-sheets';

const NOW = new Date('2026-08-21T12:00:00Z');
const OUT = process.argv[2] ?? '.';

const d = {
  businessId: 'biz', businessName: 'Khaliq Oil',
  range: { from: null, to: null, label: 'All Time' },
  showCost: true,
  sections: new Set(['summary', 'products', 'invoices']),
  brandName: new Map([['b1', 'Double Horse'], ['b2', 'Shell']]),
  locationName: new Map([['l1', 'Rajana']]),
  customerCategoryName: new Map([['cat1', 'Retailer']]),
  customerStats: new Map([['c1', { sales: 0, paid: 0, returned: 0, balance: 6500000 }]]),
  brands: [
    { id: 'b1', name: 'Double Horse', brand_type: 'multinational', contact_person: null, phone: null },
    { id: 'b2', name: 'Shell', brand_type: 'local_dealer', contact_person: null, phone: null },
  ],
  products: [
    { id: 'p1', name: 'DH Motor Oil 20W-50', sku: 'SAE50', unit: 'can', brand_id: 'b1',
      sale_price_paisa: 220000, purchase_price_paisa: 180000, pack_size: 12, pack_name: 'Box',
      low_stock_threshold: 10, is_active: true },
    { id: 'p2', name: 'Shell Helix HX3', sku: 'HX3', unit: 'ltr', brand_id: 'b2',
      sale_price_paisa: 180000, purchase_price_paisa: 150000, pack_size: 1, pack_name: null,
      low_stock_threshold: 5, is_active: true },
    { id: 'p3', name: 'DH Coolant 1L', sku: 'CL-1', unit: 'ltr', brand_id: 'b1',
      sale_price_paisa: 65000, purchase_price_paisa: 40000, pack_size: 1, pack_name: null,
      low_stock_threshold: 5, is_active: true },
    { id: 'p4', name: 'Air Filter', sku: 'FLT', unit: 'unit', brand_id: null,
      sale_price_paisa: 95000, purchase_price_paisa: 80000, pack_size: 1, pack_name: null,
      low_stock_threshold: 5, is_active: true },
  ],
  customers: [
    { id: 'c1', name: 'Ali', phone: null, address: null, location_id: 'l1', category_id: 'cat1',
      opening_balance_paisa: 0, credit_limit_paisa: null, is_defaulter: false, is_active: true },
  ],
  invoices: [
    { id: 'i1', invoice_number: 'INV-1', customer_id: 'c1', status: 'issued', issue_date: '2026-08-21',
      due_date: null, subtotal_paisa: 1000000, discount_paisa: 100000, total_paisa: 900000, paid_paisa: 900000, notes: null },
    { id: 'i2', invoice_number: 'INV-2', customer_id: 'c1', status: 'partially_paid', issue_date: '2026-08-18',
      due_date: null, subtotal_paisa: 360000, discount_paisa: 0, total_paisa: 360000, paid_paisa: 200000, notes: null },
    { id: 'i3', invoice_number: 'INV-3', customer_id: 'c1', status: 'paid', issue_date: '2026-06-10',
      due_date: null, subtotal_paisa: 440000, discount_paisa: 0, total_paisa: 440000, paid_paisa: 440000, notes: null },
    { id: 'i4', invoice_number: 'INV-4', customer_id: 'c1', status: 'draft', issue_date: '2026-08-21',
      due_date: null, subtotal_paisa: 999999, discount_paisa: 0, total_paisa: 999999, paid_paisa: 0, notes: null },
  ],
  invoiceItems: [
    { id: 'a', invoice_id: 'i1', product_id: 'p1', quantity: 4, unit_price_paisa: 200000,
      purchase_price_at_sale_paisa: 180000, discount_paisa: 0, line_total_paisa: 800000, entered_quantity: null, entry_mode: null },
    { id: 'b', invoice_id: 'i1', product_id: 'p2', quantity: 2, unit_price_paisa: 100000,
      purchase_price_at_sale_paisa: 150000, discount_paisa: 0, line_total_paisa: 200000, entered_quantity: null, entry_mode: null },
    { id: 'c', invoice_id: 'i2', product_id: 'p2', quantity: 2, unit_price_paisa: 180000,
      purchase_price_at_sale_paisa: 150000, discount_paisa: 0, line_total_paisa: 360000, entered_quantity: null, entry_mode: null },
    { id: 'e', invoice_id: 'i3', product_id: 'p1', quantity: 2, unit_price_paisa: 220000,
      purchase_price_at_sale_paisa: 180000, discount_paisa: 0, line_total_paisa: 440000, entered_quantity: null, entry_mode: null },
    { id: 'f', invoice_id: 'i4', product_id: 'p1', quantity: 9, unit_price_paisa: 111111,
      purchase_price_at_sale_paisa: 180000, discount_paisa: 0, line_total_paisa: 999999, entered_quantity: null, entry_mode: null },
  ],
  returnItems: [{ invoice_item_id: 'a', quantity: 1, return_price_paisa: 200000 }],
  stockMovements: [
    { id: 'm1', product_id: 'p1', invoice_id: null, return_id: null, stock_purchase_id: 'sp', type: 'in', quantity: 240, note: null, created_at: '2026-08-01' },
    { id: 'm2', product_id: 'p1', invoice_id: 'i1', return_id: null, stock_purchase_id: null, type: 'out', quantity: 4, note: null, created_at: '2026-08-21' },
    { id: 'm3', product_id: 'p3', invoice_id: null, return_id: null, stock_purchase_id: 'sp', type: 'in', quantity: 138, note: null, created_at: '2026-05-01' },
    { id: 'm4', product_id: 'p2', invoice_id: null, return_id: null, stock_purchase_id: 'sp', type: 'in', quantity: 3, note: null, created_at: '2026-08-01' },
  ],
  returns: [], payments: [], expenses: [], expenseAssets: [], suppliers: [],
  stockPurchases: [], supplierPayments: [], ledger: [], users: [], auditLog: [],
  locations: [], customerCategories: [],
  productById: new Map(), supplierName: new Map(), customerName: new Map(),
  itemsByInvoice: new Map(),
} as unknown as BackupDataset;

async function main() {
  const wb = new ExcelJS.Workbook();
  const info = wb.addWorksheet(INFO_SHEET_NAME);
  writeInfoSheet(info, {
    businessName: 'Khaliq Oil', businessId: 'biz', generatedAt: NOW,
    period: 'All Time', generatedBy: 'Talal Naveed',
  });

  addSalesSummarySheet(wb, d, NOW);
  addSalesByProductSheet(wb, d, NOW);
  addSalesByBrandSheet(wb, d, NOW);
  addSalesByCustomerSheet(wb, d, NOW);
  addSalesByDaySheet(wb, d, NOW);
  addSalesByWeekSheet(wb, d);
  addSalesByMonthSheet(wb, d);
  addStockReportSheet(wb, d);
  addDeadStockSheet(wb, d, NOW);
  setInfoSheetCount(info, wb.worksheets.length);

  const buf = await wb.xlsx.writeBuffer();
  writeFileSync(`${OUT}/backup-preview.xlsx`, Buffer.from(buf));

  const re = new ExcelJS.Workbook();
  await re.xlsx.readFile(`${OUT}/backup-preview.xlsx`);
  console.log('Sheets:', re.worksheets.map((w) => w.name).join(' | '));
  console.log('Info B5 =', re.getWorksheet(INFO_SHEET_NAME)!.getCell('B5').value,
              '| C5 =', re.getWorksheet(INFO_SHEET_NAME)!.getCell('C5').value);

  const stock = re.getWorksheet('Stock Report')!;
  console.log('\nStock Report money format:', stock.getRow(2).getCell(8).numFmt);
  console.log('Header fill:', JSON.stringify((stock.getRow(1).getCell(1).fill as { fgColor?: { argb?: string } })?.fgColor));
  console.log('Frozen:', JSON.stringify(stock.views?.[0]?.state), '| autoFilter:', !!stock.autoFilter);

  // Iron rule #3: staff must not merely see blanks — the columns must be absent.
  const staffWb = new ExcelJS.Workbook();
  addStockReportSheet(staffWb, { ...d, showCost: false } as BackupDataset);
  const staffHeaders: string[] = [];
  staffWb.getWorksheet('Stock Report')!.getRow(1).eachCell((c) => staffHeaders.push(String(c.value)));
  console.log('Staff Stock Report headers:', staffHeaders.join(' | '));
  if (staffHeaders.some((h) => h.toLowerCase().includes('cost'))) throw new Error('cost leaked to staff');
  console.log('OK: no cost column for staff');

  for (const name of ['Sales Summary', 'Sales by Product', 'Sales by Brand', 'Stock Report', 'Dead Stock', 'Sales by Week']) {
    const ws = re.getWorksheet(name)!;
    console.log(`\n── ${name} (${ws.rowCount} rows)`);
    ws.eachRow((row, i) => {
      if (i > 8) return;
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (c) => cells.push(String(c.value ?? '')));
      console.log('   ', cells.join(' | '));
    });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
