import type ExcelJS from 'exceljs';
import type {
  BackupDataset, CustomerRow, InvoiceItemRow, InvoiceRow, PaymentRow,
  ReturnItemRow,
} from '@/lib/backup/dataset';
import { inRange } from '@/lib/backup/dataset';
import { addSheet, type SheetColumn } from '@/lib/backup/sheet-writer';
import { TAB, paintBalance, paintStatus } from '@/lib/backup/xlsx-style';
import {
  DASH, asEntered, customerStatus, invoiceStatus, itemCount, titleCase,
} from '@/lib/backup/sheets/labels';

/** The sale side of the business: who owes what, what was sold, what came back. */

export function addCustomersSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  // Biggest debtors first: the list exists to be worked down.
  const rows = [...d.customers].sort(
    (a, b) => (d.customerStats.get(b.id)?.balance ?? 0) - (d.customerStats.get(a.id)?.balance ?? 0),
  );
  const stat = (c: CustomerRow) =>
    d.customerStats.get(c.id) ?? { sales: 0, paid: 0, returned: 0, balance: 0 };

  addSheet(wb, {
    name: 'Customers',
    tab: TAB.data,
    rows,
    totals: true,
    emptyNote: 'No customers yet.',
    columns: [
      { header: '#', kind: 'int', value: (_c, i) => i + 1, width: 6 },
      { header: 'Name', value: (c) => c.name },
      { header: 'Phone', value: (c) => c.phone ?? DASH },
      { header: 'Location', value: (c) => (c.location_id ? d.locationName.get(c.location_id) ?? DASH : DASH) },
      { header: 'Total Sales', kind: 'money', total: true, value: (c) => stat(c).sales },
      { header: 'Total Paid', kind: 'money', total: true, value: (c) => stat(c).paid },
      { header: 'Returns', kind: 'money', total: true, value: (c) => stat(c).returned },
      {
        header: 'Balance',
        kind: 'money',
        total: true,
        value: (c) => stat(c).balance,
        paint: (cell, c) => paintBalance(cell, stat(c).balance),
      },
      {
        header: 'Status',
        value: (c) => customerStatus(stat(c).balance, c.is_defaulter).text,
        paint: (cell, c) => paintStatus(cell, customerStatus(stat(c).balance, c.is_defaulter).tone),
      },
    ],
  });
}

export function addInvoicesSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  const rows = d.invoices
    .filter((i) => inRange(i.issue_date, d.range))
    .sort((a, b) => b.issue_date.localeCompare(a.issue_date));

  const balance = (i: InvoiceRow) => i.total_paisa - i.paid_paisa;

  addSheet(wb, {
    name: 'Invoices',
    tab: TAB.data,
    rows,
    totals: true,
    emptyNote: 'No invoices in the selected period.',
    columns: [
      { header: '#', kind: 'int', value: (_i, idx) => idx + 1, width: 6 },
      { header: 'Invoice #', value: (i) => i.invoice_number },
      { header: 'Date (PKT)', kind: 'date', value: (i) => i.issue_date },
      { header: 'Customer', value: (i) => d.customerName.get(i.customer_id) ?? DASH },
      { header: 'Items', value: (i) => itemCount(d.itemsByInvoice.get(i.id)?.length ?? 0) },
      { header: 'Subtotal', kind: 'money', total: true, value: (i) => i.subtotal_paisa },
      { header: 'Discount', kind: 'money', total: true, value: (i) => i.discount_paisa },
      { header: 'Total', kind: 'money', total: true, value: (i) => i.total_paisa },
      { header: 'Paid', kind: 'money', total: true, value: (i) => i.paid_paisa },
      {
        header: 'Balance',
        kind: 'money',
        total: true,
        value: balance,
        paint: (cell, i) => paintBalance(cell, balance(i)),
      },
      {
        header: 'Status',
        value: (i) => invoiceStatus(i.status, balance(i), i.paid_paisa).text,
        paint: (cell, i) => paintStatus(cell, invoiceStatus(i.status, balance(i), i.paid_paisa).tone),
      },
    ],
  });
}

type ItemLine = { item: InvoiceItemRow; invoice: InvoiceRow };

export function addInvoiceItemsSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  const byId = new Map(d.invoices.map((i) => [i.id, i]));
  const rows: ItemLine[] = d.invoiceItems
    .map((item) => ({ item, invoice: byId.get(item.invoice_id) }))
    .filter((l): l is ItemLine => !!l.invoice && inRange(l.invoice.issue_date, d.range))
    .sort((a, b) =>
      b.invoice.issue_date.localeCompare(a.invoice.issue_date)
      || a.invoice.invoice_number.localeCompare(b.invoice.invoice_number));

  const product = (l: ItemLine) => d.productById.get(l.item.product_id);

  addSheet(wb, {
    name: 'Invoice Items',
    tab: TAB.data,
    rows,
    totals: true,
    emptyNote: 'No invoice lines in the selected period.',
    columns: [
      { header: 'Invoice #', value: (l) => l.invoice.invoice_number },
      { header: 'Date (PKT)', kind: 'date', value: (l) => l.invoice.issue_date },
      { header: 'Customer', value: (l) => d.customerName.get(l.invoice.customer_id) ?? DASH },
      { header: 'Product', value: (l) => product(l)?.name ?? DASH },
      {
        header: 'Brand',
        value: (l) => {
          const brandId = product(l)?.brand_id;
          return brandId ? d.brandName.get(brandId) ?? DASH : DASH;
        },
      },
      { header: 'Qty', kind: 'qty', total: true, value: (l) => l.item.quantity },
      { header: 'Unit', value: (l) => product(l)?.unit ?? DASH },
      {
        header: 'As Entered',
        value: (l) => asEntered(l.item.entered_quantity, l.item.entry_mode, product(l)?.pack_name ?? null),
      },
      { header: 'Rate', kind: 'money', value: (l) => l.item.unit_price_paisa },
      { header: 'Discount', kind: 'money', total: true, value: (l) => l.item.discount_paisa },
      { header: 'Amount', kind: 'money', total: true, value: (l) => l.item.line_total_paisa },
    ],
  });
}

const PAYMENT_METHOD: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  online: 'Online',
};

export function addPaymentsSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  const rows = d.payments
    .filter((p) => inRange(p.payment_date, d.range))
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date));

  addSheet(wb, {
    name: 'Payments',
    tab: TAB.data,
    rows,
    totals: true,
    emptyNote: 'No payments in the selected period.',
    columns: [
      { header: '#', kind: 'int', value: (_p, i) => i + 1, width: 6 },
      { header: 'Date (PKT)', kind: 'date', value: (p) => p.payment_date },
      { header: 'Customer', value: (p) => d.customerName.get(p.customer_id) ?? DASH },
      { header: 'Amount', kind: 'money', total: true, value: (p) => p.amount_paisa },
      { header: 'Method', value: (p) => PAYMENT_METHOD[p.method] ?? titleCase(p.method) },
      { header: 'Reference', value: (p) => p.reference ?? DASH },
      {
        header: 'Invoice #',
        value: (p) => (p.invoice_id ? d.invoiceNumber.get(p.invoice_id) ?? DASH : DASH),
      },
      // Voided payments are listed, not hidden: the ledger still counts them,
      // so the customer's Total Paid would be unexplainable without this row.
      {
        header: 'Status',
        value: (p: PaymentRow) => (p.deleted_at ? 'Voided' : 'Recorded'),
        paint: (cell, p) => paintStatus(cell, p.deleted_at ? 'bad' : 'good'),
      },
    ],
  });
}

type ReturnLine = { item: ReturnItemRow; returnNumber: string; date: string; customerId: string; invoiceId: string };

export function addReturnsSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  const byId = new Map(d.returns.map((r) => [r.id, r]));
  const rows: ReturnLine[] = d.returnItems
    .flatMap((item) => {
      const ret = byId.get(item.return_id);
      if (!ret || !inRange(ret.return_date, d.range)) return [];
      return [{
        item,
        returnNumber: ret.return_number,
        date: ret.return_date,
        customerId: ret.customer_id,
        invoiceId: ret.invoice_id,
      }];
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.returnNumber.localeCompare(b.returnNumber));

  addSheet(wb, {
    name: 'Returns',
    tab: TAB.data,
    rows,
    totals: true,
    emptyNote: 'No returns in the selected period.',
    columns: [
      { header: '#', kind: 'int', value: (_r, i) => i + 1, width: 6 },
      { header: 'Return #', value: (r) => r.returnNumber },
      { header: 'Date (PKT)', kind: 'date', value: (r) => r.date },
      { header: 'Customer', value: (r) => d.customerName.get(r.customerId) ?? DASH },
      { header: 'Invoice #', value: (r) => d.invoiceNumber.get(r.invoiceId) ?? DASH },
      { header: 'Product', value: (r) => d.productById.get(r.item.product_id)?.name ?? DASH },
      { header: 'Qty', kind: 'qty', total: true, value: (r) => r.item.quantity },
      {
        header: 'Original Price',
        kind: 'money',
        value: (r) => r.item.original_price_paisa ?? r.item.unit_price_paisa,
      },
      {
        header: 'Return Price',
        kind: 'money',
        value: (r) => r.item.return_price_paisa ?? r.item.unit_price_paisa,
      },
      { header: 'Amount', kind: 'money', total: true, value: (r) => r.item.line_total_paisa },
      {
        header: 'Overridden?',
        value: (r) => (r.item.is_price_overridden ? 'Yes' : 'No'),
        paint: (cell, r) => paintStatus(cell, r.item.is_price_overridden ? 'warn' : 'none'),
      },
      { header: 'Reason', value: (r) => r.item.override_reason ?? DASH, width: 34 },
    ],
  });
}

type LedgerLine = {
  customerName: string;
  date: string;
  type: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
};

const LEDGER_TYPE: Record<string, string> = {
  invoice: 'Invoice',
  payment: 'Payment',
  return: 'Return',
  adjustment: 'Adjustment',
  opening: 'Opening Balance',
};

/**
 * Every customer's ledger, one after another, with the running balance
 * recomputed here rather than read from ledger_entries.balance_paisa — that
 * column is a snapshot taken at insert time, and the app has never displayed
 * it either.
 */
export function addLedgerSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  const byCustomer = new Map<string, typeof d.ledger>();
  for (const entry of d.ledger) {
    const list = byCustomer.get(entry.customer_id);
    if (list) list.push(entry);
    else byCustomer.set(entry.customer_id, [entry]);
  }

  const rows: LedgerLine[] = [];
  const customers = [...d.customers].sort((a, b) => a.name.localeCompare(b.name));

  for (const customer of customers) {
    const entries = (byCustomer.get(customer.id) ?? [])
      .slice()
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at));
    if (entries.length === 0 && customer.opening_balance_paisa === 0) continue;

    let balance = customer.opening_balance_paisa;
    const opening: LedgerLine = {
      customerName: customer.name,
      date: entries[0]?.entry_date ?? '',
      type: LEDGER_TYPE.opening,
      reference: DASH,
      debit: customer.opening_balance_paisa,
      credit: 0,
      balance,
    };

    const lines: LedgerLine[] = [opening];
    for (const e of entries) {
      balance += e.debit_paisa - e.credit_paisa;
      lines.push({
        customerName: customer.name,
        date: e.entry_date,
        type: LEDGER_TYPE[e.ref_type] ?? titleCase(e.ref_type),
        reference: referenceFor(d, e.ref_type, e.ref_id) ?? e.description ?? DASH,
        debit: e.debit_paisa,
        credit: e.credit_paisa,
        balance,
      });
    }

    // The range narrows what is printed; the running balance is still the
    // customer's true one, carried through the rows that were skipped.
    rows.push(...lines.filter((l) => !l.date || inRange(l.date, d.range)));
  }

  addSheet(wb, {
    name: 'Ledger',
    tab: TAB.reference,
    rows,
    emptyNote: 'No ledger activity in the selected period.',
    columns: [
      { header: 'Date (PKT)', kind: 'date', value: (l) => l.date || null },
      { header: 'Customer', value: (l) => l.customerName },
      { header: 'Type', value: (l) => l.type },
      { header: 'Reference', value: (l) => l.reference, width: 28 },
      { header: 'Debit', kind: 'money', value: (l) => l.debit },
      { header: 'Credit', kind: 'money', value: (l) => l.credit },
      {
        header: 'Balance',
        kind: 'money',
        value: (l) => l.balance,
        paint: (cell, l) => paintBalance(cell, l.balance),
      },
    ] as Array<SheetColumn<LedgerLine>>,
  });
}

function referenceFor(d: BackupDataset, refType: string, refId: string): string | null {
  if (refType === 'invoice') return d.invoiceNumber.get(refId) ?? null;
  if (refType === 'return') return d.returnNumber.get(refId) ?? null;
  return null;
}
