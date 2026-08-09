import type ExcelJS from 'exceljs';
import type { BackupDataset, SupplierRow } from '@/lib/backup/dataset';
import { inRange } from '@/lib/backup/dataset';
import { addSheet } from '@/lib/backup/sheet-writer';
import { TAB, paintBalance } from '@/lib/backup/xlsx-style';
import { DASH, asEntered, titleCase } from '@/lib/backup/sheets/labels';

/**
 * The buy side. Every amount here is purchase data, so the money columns —
 * and the two sheets that are nothing but money columns — exist only for
 * admin and accountant (iron rule #3).
 */

export function addSuppliersSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  const stat = (s: SupplierRow) => d.supplierStats.get(s.id) ?? { purchased: 0, paid: 0, balance: 0 };
  const rows = [...d.suppliers].sort((a, b) => stat(b).balance - stat(a).balance);

  addSheet(wb, {
    name: 'Suppliers',
    tab: TAB.data,
    rows,
    totals: d.showCost,
    emptyNote: 'No suppliers yet.',
    columns: [
      { header: '#', kind: 'int', value: (_s, i) => i + 1, width: 6 },
      { header: 'Name', value: (s) => s.name },
      { header: 'Phone', value: (s) => s.phone ?? DASH },
      { header: 'Address', value: (s) => s.address ?? DASH, width: 34 },
      d.showCost
        ? { header: 'Total Purchased', kind: 'money' as const, total: true, value: (s: SupplierRow) => stat(s).purchased }
        : null,
      d.showCost
        ? { header: 'Total Paid', kind: 'money' as const, total: true, value: (s: SupplierRow) => stat(s).paid }
        : null,
      d.showCost
        ? {
          header: 'Balance',
          kind: 'money' as const,
          total: true,
          value: (s: SupplierRow) => stat(s).balance,
          paint: (cell: ExcelJS.Cell, s: SupplierRow) => paintBalance(cell, stat(s).balance),
        }
        : null,
    ],
  });
}

export function addStockPurchasesSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  if (!d.showCost) return;

  const rows = d.stockPurchases
    .filter((p) => inRange(p.purchase_date, d.range))
    .sort((a, b) => b.purchase_date.localeCompare(a.purchase_date));

  addSheet(wb, {
    name: 'Stock Purchases',
    tab: TAB.data,
    rows,
    totals: true,
    emptyNote: 'No purchases in the selected period.',
    columns: [
      { header: '#', kind: 'int', value: (_p, i) => i + 1, width: 6 },
      { header: 'Date (PKT)', kind: 'date', value: (p) => p.purchase_date },
      { header: 'Supplier', value: (p) => d.supplierName.get(p.supplier_id) ?? DASH },
      { header: 'Product', value: (p) => d.productById.get(p.product_id)?.name ?? DASH },
      { header: 'Qty', kind: 'qty', total: true, value: (p) => p.quantity },
      { header: 'Unit', value: (p) => d.productById.get(p.product_id)?.unit ?? DASH },
      {
        header: 'As Entered',
        value: (p) => asEntered(p.entered_quantity, p.entry_mode, d.productById.get(p.product_id)?.pack_name ?? null),
      },
      { header: 'Unit Price', kind: 'money', value: (p) => p.unit_price_paisa },
      { header: 'Total', kind: 'money', total: true, value: (p) => p.total_paisa },
      { header: 'Notes', value: (p) => p.notes ?? DASH, width: 34 },
    ],
  });
}

export function addSupplierPaymentsSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  if (!d.showCost) return;

  const rows = d.supplierPayments
    .filter((p) => inRange(p.payment_date, d.range))
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date));

  addSheet(wb, {
    name: 'Supplier Payments',
    tab: TAB.data,
    rows,
    totals: true,
    emptyNote: 'No supplier payments in the selected period.',
    columns: [
      { header: '#', kind: 'int', value: (_p, i) => i + 1, width: 6 },
      { header: 'Date (PKT)', kind: 'date', value: (p) => p.payment_date },
      { header: 'Supplier', value: (p) => d.supplierName.get(p.supplier_id) ?? DASH },
      { header: 'Amount', kind: 'money', total: true, value: (p) => p.amount_paisa },
      { header: 'Method', value: (p) => (p.payment_method ? titleCase(p.payment_method) : DASH) },
      { header: 'Reference', value: (p) => p.reference ?? DASH },
    ],
  });
}
