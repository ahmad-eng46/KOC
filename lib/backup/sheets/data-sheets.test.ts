import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import type { BackupDataset } from '@/lib/backup/dataset';
import { addCustomersSheet, addInvoicesSheet } from '@/lib/backup/sheets/sales-sheets';
import { addProductsSheet } from '@/lib/backup/sheets/inventory-sheets';

const CUSTOMER_ID = 'aaaaaaaa-1111-2222-3333-444444444444';
const LOCATION_ID = 'bbbbbbbb-1111-2222-3333-444444444444';
const BRAND_ID = 'cccccccc-1111-2222-3333-444444444444';
const PRODUCT_ID = 'dddddddd-1111-2222-3333-444444444444';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function dataset(over: Partial<BackupDataset> = {}): BackupDataset {
  const base: BackupDataset = {
    businessId: 'biz', businessName: 'Khaliq Oil',
    range: { from: null, to: null, label: 'All Time' },
    showCost: true,
    sections: new Set(['customers', 'products', 'invoices']),
    locations: [{ id: LOCATION_ID, name: 'Lahore', short_code: 'LHR' }],
    brands: [{ id: BRAND_ID, name: 'Shell', brand_type: 'multinational', contact_person: null, phone: null }],
    customers: [{
      id: CUSTOMER_ID, name: 'Al-Noor Traders', phone: '0300-1234567', address: null,
      location_id: LOCATION_ID, opening_balance_paisa: 0, credit_limit_paisa: null,
      is_defaulter: false, is_active: true,
    }],
    products: [{
      id: PRODUCT_ID, name: 'Helix 20W-50', sku: 'SH-2050', unit: 'can',
      brand_id: BRAND_ID, sale_price_paisa: 1_500_00, purchase_price_paisa: 1_200_00,
      pack_size: 12, pack_name: 'Box', low_stock_threshold: 5, is_active: true,
    }],
    invoices: [{
      id: 'inv1', invoice_number: 'INV-0001', customer_id: CUSTOMER_ID, status: 'issued',
      issue_date: '2026-08-05', due_date: null, subtotal_paisa: 1_50_000_00,
      discount_paisa: 0, total_paisa: 1_50_000_00, paid_paisa: 50_000_00, notes: null,
    }],
    invoiceItems: [], returns: [], returnItems: [], payments: [], expenses: [],
    expenseAssets: [], suppliers: [], stockPurchases: [], supplierPayments: [],
    stockMovements: [], ledger: [], users: [], auditLog: [],
    locationName: new Map([[LOCATION_ID, 'Lahore']]),
    brandName: new Map([[BRAND_ID, 'Shell']]),
    customerName: new Map([[CUSTOMER_ID, 'Al-Noor Traders']]),
    productById: new Map(),
    supplierName: new Map(),
    userName: new Map(),
    invoiceNumber: new Map([['inv1', 'INV-0001']]),
    returnNumber: new Map(),
    stockByProduct: new Map([[PRODUCT_ID, 3]]),
    customerStats: new Map([[CUSTOMER_ID, { sales: 1_50_000_00, paid: 50_000_00, returned: 0, balance: 1_00_000_00 }]]),
    supplierStats: new Map(),
    itemsByInvoice: new Map([['inv1', []]]),
  };
  base.productById = new Map(base.products.map((p) => [p.id, p]));
  return { ...base, ...over };
}

function headers(ws: ExcelJS.Worksheet): string[] {
  const out: string[] = [];
  ws.getRow(1).eachCell((cell) => out.push(String(cell.value)));
  return out;
}

function allText(ws: ExcelJS.Worksheet): string {
  const parts: string[] = [];
  ws.eachRow((row) => row.eachCell((cell) => parts.push(String(cell.value))));
  return parts.join('|');
}

function sheet(build: (wb: ExcelJS.Workbook, d: BackupDataset) => void, d: BackupDataset): ExcelJS.Worksheet {
  const wb = new ExcelJS.Workbook();
  build(wb, d);
  return wb.worksheets[0];
}

describe('Customers sheet', () => {
  const ws = sheet(addCustomersSheet, dataset());

  it('uses business columns, not database columns', () => {
    expect(headers(ws)).toEqual([
      '#', 'Name', 'Phone', 'Location', 'Total Sales', 'Total Paid', 'Returns', 'Balance', 'Status',
    ]);
  });

  it('prints the location name and never a UUID', () => {
    expect(ws.getCell('D2').value).toBe('Lahore');
    expect(allText(ws)).not.toMatch(UUID);
  });

  it('writes money as rupees a formula can sum, grouped the Pakistani way', () => {
    const balance = ws.getCell('H2');
    expect(balance.value).toBe(1_00_000); // Rs. 1,00,000.00, from 1_00_000_00 paisa
    expect(balance.numFmt).toContain('#\\,##\\,##0.00');
  });

  it('colours a debt red and flags the status', () => {
    expect(ws.getCell('I2').value).toBe('Owes');
    const fill = ws.getCell('H2').fill;
    expect(fill.type === 'pattern' && fill.fgColor?.argb).toBe('FFFCE4E4');
  });

  it('carries a totals row', () => {
    expect(ws.getCell('A3').value).toBe('TOTAL');
    expect(ws.getCell('E3').value).toBe(1_50_000);
  });
});

describe('Products sheet', () => {
  it('spells the pack out and values the stock', () => {
    const ws = sheet(addProductsSheet, dataset());
    expect(headers(ws)).toContain('Cost');
    expect(ws.getCell('C2').value).toBe('Shell');
    expect(ws.getCell('F2').value).toBe('Box of 12 cans');
    expect(ws.getCell('J2').value).toBe(3 * 1_500); // stock x sale price, in rupees
    expect(ws.getCell('K2').value).toBe('Low Stock');
  });

  it('omits the cost column entirely when the downloader is staff', () => {
    const ws = sheet(addProductsSheet, dataset({ showCost: false }));
    expect(headers(ws)).not.toContain('Cost');
    expect(allText(ws)).not.toContain('1200');
  });
});

describe('Invoices sheet', () => {
  it('shows the customer name, a readable date and the outstanding balance', () => {
    const ws = sheet(addInvoicesSheet, dataset());
    expect(ws.getCell('D2').value).toBe('Al-Noor Traders');
    expect(ws.getCell('C2').value).toBeInstanceOf(Date);
    expect(ws.getCell('C2').numFmt).toBe('dd mmm yyyy');
    expect(ws.getCell('J2').value).toBe(1_00_000);
    expect(ws.getCell('K2').value).toBe('Partially Paid');
  });
});
