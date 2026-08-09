import { describe, it, expect } from 'vitest';
import {
  buildSummary, monthStartDay, last30StartDay, type SummaryInput,
} from '@/lib/backup/summary';
import type {
  CustomerRow, ExpenseRow, InvoiceRow, PaymentRow, ProductRow, SupplierRow,
} from '@/lib/backup/dataset';

const NOW = new Date('2026-08-09T17:22:00Z'); // 09 Aug 2026, 10:22 PM PKT

function invoice(over: Partial<InvoiceRow>): InvoiceRow {
  return {
    id: 'i', invoice_number: 'INV-1', customer_id: 'c1', status: 'issued',
    issue_date: '2026-08-05', due_date: null, subtotal_paisa: 0,
    discount_paisa: 0, total_paisa: 0, paid_paisa: 0, notes: null,
    ...over,
  };
}

function product(over: Partial<ProductRow>): ProductRow {
  return {
    id: 'p', name: 'Oil', sku: null, unit: 'can', brand_id: null,
    sale_price_paisa: 100_00, purchase_price_paisa: 80_00, pack_size: 1,
    pack_name: null, low_stock_threshold: 0, is_active: true,
    ...over,
  };
}

function baseInput(over: Partial<SummaryInput> = {}): SummaryInput {
  return {
    invoices: [],
    customers: [],
    customerStats: new Map(),
    payments: [],
    expenses: [],
    products: [],
    stockByProduct: new Map(),
    suppliers: [],
    supplierStats: new Map(),
    showCost: true,
    ...over,
  };
}

function moneyLine(blocks: ReturnType<typeof buildSummary>, title: string, label: string): number {
  const block = blocks.find((b) => b.title === title);
  const line = block?.lines.find((l) => l.label === label);
  if (!line || line.kind !== 'money') throw new Error(`No money line "${label}" in ${title}`);
  return line.paisa;
}

function countLine(blocks: ReturnType<typeof buildSummary>, title: string, label: string): number {
  const block = blocks.find((b) => b.title === title);
  const line = block?.lines.find((l) => l.label === label);
  if (!line || line.kind !== 'count') throw new Error(`No count line "${label}" in ${title}`);
  return line.count;
}

describe('backup summary periods', () => {
  it('takes the month and the 30-day window from Karachi, not UTC', () => {
    // 31 Jul 2026 19:30 UTC is already 1 Aug in Karachi.
    expect(monthStartDay(new Date('2026-07-31T19:30:00Z'))).toBe('2026-08-01');
    expect(last30StartDay(NOW)).toBe('2026-07-11');
  });
});

describe('buildSummary', () => {
  it('splits sales into all time, this month and the last 30 days', () => {
    const blocks = buildSummary(baseInput({
      invoices: [
        invoice({ id: 'a', issue_date: '2025-01-01', total_paisa: 10_000_00 }),
        invoice({ id: 'b', issue_date: '2026-07-20', total_paisa: 4_000_00 }),
        invoice({ id: 'c', issue_date: '2026-08-05', total_paisa: 6_000_00 }),
      ],
    }), NOW);

    expect(moneyLine(blocks, 'SALES', 'Total Sales (All Time)')).toBe(20_000_00);
    expect(moneyLine(blocks, 'SALES', 'Total Sales (This Month)')).toBe(6_000_00);
    expect(moneyLine(blocks, 'SALES', 'Total Sales (Last 30 Days)')).toBe(10_000_00);
    expect(countLine(blocks, 'SALES', 'Total Invoices')).toBe(3);
    expect(moneyLine(blocks, 'SALES', 'Average Invoice Value')).toBe(6_666_67);
  });

  it('ignores drafts, which post no ledger entry', () => {
    const blocks = buildSummary(baseInput({
      invoices: [
        invoice({ id: 'a', total_paisa: 1_000_00 }),
        invoice({ id: 'b', total_paisa: 9_000_00, status: 'draft' }),
      ],
    }), NOW);
    expect(moneyLine(blocks, 'SALES', 'Total Sales (All Time)')).toBe(1_000_00);
    expect(countLine(blocks, 'SALES', 'Total Invoices')).toBe(1);
  });

  it('counts only positive balances as receivables', () => {
    const customers: CustomerRow[] = ['c1', 'c2', 'c3'].map((id) => ({
      id, name: id, phone: null, address: null, location_id: null,
      opening_balance_paisa: 0, credit_limit_paisa: null,
      is_defaulter: false, is_active: true,
    }));
    const blocks = buildSummary(baseInput({
      customers,
      customerStats: new Map([
        ['c1', { sales: 0, paid: 0, returned: 0, balance: 5_000_00 }],
        ['c2', { sales: 0, paid: 0, returned: 0, balance: -1_000_00 }],
        ['c3', { sales: 0, paid: 0, returned: 0, balance: 0 }],
      ]),
      payments: [
        { id: 'p1', customer_id: 'c1', invoice_id: null, amount_paisa: 3_000_00, method: 'cash', reference: null, payment_date: '2026-08-01', notes: null, deleted_at: null },
        { id: 'p2', customer_id: 'c2', invoice_id: null, amount_paisa: 900_00, method: 'cash', reference: null, payment_date: '2026-08-02', notes: null, deleted_at: '2026-08-03T00:00:00Z' },
      ] satisfies PaymentRow[],
    }), NOW);

    expect(moneyLine(blocks, 'COLLECTIONS', 'Outstanding Receivables')).toBe(5_000_00);
    expect(moneyLine(blocks, 'COLLECTIONS', 'Total Payments Received')).toBe(3_000_00);
    const dues = blocks.find((b) => b.title === 'COLLECTIONS')?.lines
      .find((l) => l.label === 'Customers with Dues');
    expect(dues?.kind === 'text' && dues.text).toBe('1 of 3');
  });

  it('ranks expense categories and scopes the month to Karachi', () => {
    const expenses: ExpenseRow[] = [
      { id: 'e1', type: 'business', category: 'Transport', asset_id: null, asset_name: 'Car LHR-1234', sub_type_name: 'Petrol', description: null, amount_paisa: 4_50_000_00, expense_date: '2026-08-02', include_in_pnl: true, receipt_url: null },
      { id: 'e2', type: 'business', category: 'Rent', asset_id: null, asset_name: null, sub_type_name: null, description: null, amount_paisa: 3_60_000_00, expense_date: '2025-05-02', include_in_pnl: true, receipt_url: null },
    ];
    const blocks = buildSummary(baseInput({ expenses }), NOW);
    expect(moneyLine(blocks, 'EXPENSES', 'Total Expenses (All Time)')).toBe(8_10_000_00);
    expect(moneyLine(blocks, 'EXPENSES', 'Total Expenses (This Month)')).toBe(4_50_000_00);
    expect(moneyLine(blocks, 'EXPENSES', 'Top Category: Transport')).toBe(4_50_000_00);
    expect(moneyLine(blocks, 'EXPENSES', 'Top Category: Rent')).toBe(3_60_000_00);
  });

  it('values stock at sale and cost, and counts low and out of stock', () => {
    const products = [
      product({ id: 'p1', sale_price_paisa: 500_00, purchase_price_paisa: 400_00, low_stock_threshold: 10 }),
      product({ id: 'p2', sale_price_paisa: 200_00, purchase_price_paisa: 150_00, low_stock_threshold: 5 }),
      product({ id: 'p3', sale_price_paisa: 100_00, purchase_price_paisa: 90_00, low_stock_threshold: 0 }),
    ];
    const blocks = buildSummary(baseInput({
      products,
      stockByProduct: new Map([['p1', 20], ['p2', 4], ['p3', 0]]),
    }), NOW);

    expect(moneyLine(blocks, 'STOCK', 'Total Stock Value (Sale)')).toBe(20 * 500_00 + 4 * 200_00);
    expect(moneyLine(blocks, 'STOCK', 'Total Stock Value (Cost)')).toBe(20 * 400_00 + 4 * 150_00);
    expect(countLine(blocks, 'STOCK', 'Low Stock Items')).toBe(1);
    expect(countLine(blocks, 'STOCK', 'Out of Stock Items')).toBe(1);
  });

  it('omits every cost figure when the downloader may not see purchase prices', () => {
    const suppliers: SupplierRow[] = [{ id: 's1', name: 'Shell', phone: null, address: null }];
    const blocks = buildSummary(baseInput({
      showCost: false,
      products: [product({ id: 'p1' })],
      stockByProduct: new Map([['p1', 5]]),
      suppliers,
      supplierStats: new Map([['s1', { purchased: 1_000_00, paid: 400_00, balance: 600_00 }]]),
    }), NOW);

    const labels = blocks.flatMap((b) => b.lines.map((l) => l.label));
    expect(labels).not.toContain('Total Stock Value (Cost)');
    expect(labels).not.toContain('Total Purchased');
    expect(labels).not.toContain('Outstanding to Suppliers');
    expect(labels).toContain('Total Stock Value (Sale)');
    expect(countLine(blocks, 'SUPPLIERS', 'Total Suppliers')).toBe(1);
  });
});
