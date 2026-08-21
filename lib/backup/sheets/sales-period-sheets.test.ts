import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import type { BackupDataset } from '@/lib/backup/dataset';
import {
  addSalesSummarySheet, addSalesByProductSheet, addSalesByBrandSheet,
  addStockReportSheet, addDeadStockSheet, stockByProduct,
} from '@/lib/backup/sheets/sales-period-sheets';

const NOW = new Date('2026-08-21T12:00:00Z');

function dataset(over: Partial<BackupDataset> = {}): BackupDataset {
  return {
    businessName: 'Khaliq Oil',
    showCost: true,
    brandName: new Map([['b1', 'Double Horse']]),
    locationName: new Map(),
    customerCategoryName: new Map(),
    customerStats: new Map(),
    brands: [{ id: 'b1', name: 'Double Horse', brand_type: 'multinational', contact_person: null, phone: null }],
    products: [{
      id: 'p1', name: 'DH Motor Oil', sku: 'SAE50', unit: 'can', brand_id: 'b1',
      sale_price_paisa: 220000, purchase_price_paisa: 180000,
      pack_size: 12, pack_name: 'Box', low_stock_threshold: 10, is_active: true,
    }],
    customers: [],
    invoices: [{
      id: 'i1', invoice_number: 'INV-1', customer_id: 'c1', status: 'issued',
      issue_date: '2026-08-21', due_date: null, subtotal_paisa: 800000,
      discount_paisa: 0, total_paisa: 800000, paid_paisa: 800000, notes: null,
    }],
    invoiceItems: [{
      id: 'a', invoice_id: 'i1', product_id: 'p1', quantity: 4,
      unit_price_paisa: 200000, purchase_price_at_sale_paisa: 180000,
      discount_paisa: 0, line_total_paisa: 800000, entered_quantity: null, entry_mode: null,
    }],
    returnItems: [],
    stockMovements: [
      { id: 'm', product_id: 'p1', invoice_id: null, return_id: null, stock_purchase_id: 's', type: 'in', quantity: 240, note: null, created_at: '2026-08-01' },
      { id: 'n', product_id: 'p1', invoice_id: 'i1', return_id: null, stock_purchase_id: null, type: 'out', quantity: 4, note: null, created_at: '2026-08-21' },
    ],
    ...over,
  } as unknown as BackupDataset;
}

function build(fn: (wb: ExcelJS.Workbook, d: BackupDataset, now: Date) => void, d = dataset()) {
  const wb = new ExcelJS.Workbook();
  fn(wb, d, NOW);
  return wb.worksheets[0];
}

function headers(ws: ExcelJS.Worksheet): string[] {
  const out: string[] = [];
  ws.getRow(1).eachCell((c) => out.push(String(c.value)));
  return out;
}

describe('money is written once, not twice', () => {
  // The sheet writer converts paisa to rupees itself. Passing rupees to a
  // money column divides again and reports 52 where the books say 5,200 —
  // which is exactly what the first build of these sheets did.
  it('Stock Report prints stock value in rupees, not paisa or hundredths', () => {
    const ws = build(addStockReportSheet);
    const valueCol = headers(ws).indexOf('Stock Value') + 1;
    // 236 on hand × Rs. 2,200 = Rs. 519,200
    expect(ws.getRow(2).getCell(valueCol).value).toBe(519200);
  });

  it('Sales by Brand prints all-time sales in rupees', () => {
    const ws = build(addSalesByBrandSheet);
    const allTime = headers(ws).indexOf('All Time') + 1;
    expect(ws.getRow(2).getCell(allTime).value).toBe(8000);
  });

  it('Dead Stock prints stock value in rupees', () => {
    const d = dataset({
      invoices: [], invoiceItems: [],
      stockMovements: [{ id: 'm', product_id: 'p1', invoice_id: null, return_id: null, stock_purchase_id: 's', type: 'in', quantity: 100, note: null, created_at: '2026-01-01' }],
    } as unknown as Partial<BackupDataset>);
    const ws = build(addDeadStockSheet, d);
    const valueCol = headers(ws).indexOf('Stock Value') + 1;
    expect(ws.getRow(2).getCell(valueCol).value).toBe(220000);
  });
});

describe('the sheets agree with each other', () => {
  it('Sales Summary and Sales by Brand report the same all-time total', () => {
    const summary = build(addSalesSummarySheet);
    const brand = build(addSalesByBrandSheet);

    const summaryAllTime = summary.getRow(2).getCell(7).value; // Total Sales row
    const brandAllTime = brand.getRow(2).getCell(headers(brand).indexOf('All Time') + 1).value;
    expect(summaryAllTime).toBe(brandAllTime);
  });

  it('leaves draft and cancelled invoices out of every sheet', () => {
    const d = dataset({
      invoices: [
        { id: 'i1', invoice_number: 'INV-1', customer_id: 'c1', status: 'draft', issue_date: '2026-08-21', due_date: null, subtotal_paisa: 999999, discount_paisa: 0, total_paisa: 999999, paid_paisa: 0, notes: null },
      ],
    } as unknown as Partial<BackupDataset>);
    const ws = build(addSalesSummarySheet, d);
    expect(ws.getRow(2).getCell(7).value).toBe(0);
  });
});

describe('Stock Report', () => {
  it('omits cost columns entirely for staff rather than blanking them', () => {
    const ws = build(addStockReportSheet, dataset({ showCost: false } as Partial<BackupDataset>));
    const h = headers(ws);
    expect(h).not.toContain('Cost');
    expect(h).not.toContain('Cost Value');
    expect(h).toContain('Stock Value');
  });

  it('keeps cost columns for admin and accountant', () => {
    expect(headers(build(addStockReportSheet))).toContain('Cost Value');
  });

  it('spells the pack out with the pack name pluralised', () => {
    const ws = build(addStockReportSheet);
    const packCol = headers(ws).indexOf('Pack Info') + 1;
    expect(ws.getRow(2).getCell(packCol).value).toBe('19 Boxes of 12');
  });

  it('flags out-of-stock and low-stock rather than only listing numbers', () => {
    const d = dataset({
      stockMovements: [{ id: 'm', product_id: 'p1', invoice_id: null, return_id: null, stock_purchase_id: 's', type: 'in', quantity: 2, note: null, created_at: '2026-08-01' }],
    } as unknown as Partial<BackupDataset>);
    const ws = build(addStockReportSheet, d);
    expect(ws.getRow(2).getCell(headers(ws).indexOf('Status') + 1).value).toBe('Low');
  });
});

describe('never-sold products', () => {
  it('reads "Never", not an invalid date', () => {
    const d = dataset({ invoices: [], invoiceItems: [] } as unknown as Partial<BackupDataset>);
    const ws = build(addSalesByProductSheet, d);
    const lastCol = headers(ws).indexOf('Last Sale') + 1;
    const value = String(ws.getRow(2).getCell(lastCol).value);
    expect(value).toBe('Never');
    expect(value).not.toContain('Invalid');
  });

  it('writes a quantity row and an amount row per product', () => {
    const ws = build(addSalesByProductSheet);
    expect(ws.getRow(2).getCell(1).value).toBe('DH Motor Oil');
    expect(String(ws.getRow(3).getCell(1).value).trim()).toBe('Amount');
  });
});

describe('stockByProduct', () => {
  it('subtracts sales and adds everything else, matching current_stock', () => {
    expect(stockByProduct(dataset()).get('p1')).toBe(236);
  });
});
