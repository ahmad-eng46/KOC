import type ExcelJS from 'exceljs';
import type { BackupDataset, ProductRow, StockMovementRow } from '@/lib/backup/dataset';
import { inRange } from '@/lib/backup/dataset';
import { addSheet } from '@/lib/backup/sheet-writer';
import { TAB, paintStatus } from '@/lib/backup/xlsx-style';
import { DASH, movementType, packLabel, stockStatus } from '@/lib/backup/sheets/labels';
import { formatKarachi } from '@/lib/date';

/** What is on the shelf, what it is worth, and how it got there. */

export function addProductsSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  const rows = [...d.products].sort((a, b) => a.name.localeCompare(b.name));
  const onHand = (p: ProductRow) => d.stockByProduct.get(p.id) ?? 0;
  const status = (p: ProductRow) => stockStatus(onHand(p), p.low_stock_threshold, p.is_active);

  addSheet(wb, {
    name: 'Products',
    tab: TAB.data,
    rows,
    totals: true,
    emptyNote: 'No products yet.',
    columns: [
      { header: '#', kind: 'int', value: (_p, i) => i + 1, width: 6 },
      { header: 'Name', value: (p) => p.name },
      { header: 'Brand', value: (p) => (p.brand_id ? d.brandName.get(p.brand_id) ?? DASH : DASH) },
      { header: 'SKU', value: (p) => p.sku ?? DASH },
      { header: 'Unit', value: (p) => p.unit },
      { header: 'Pack', value: (p) => packLabel(p) },
      { header: 'Sale Price', kind: 'money', value: (p) => p.sale_price_paisa },
      // Iron rule #3: for staff and viewer the column is not written at all.
      d.showCost
        ? { header: 'Cost', kind: 'money' as const, value: (p: ProductRow) => p.purchase_price_paisa }
        : null,
      {
        header: 'Stock',
        kind: 'qty',
        total: true,
        value: (p) => onHand(p),
        paint: (cell, p) => paintStatus(cell, toneForStock(status(p).text)),
      },
      {
        header: 'Stock Value',
        kind: 'money',
        total: true,
        value: (p) => Math.round(Math.max(onHand(p), 0) * p.sale_price_paisa),
      },
      {
        header: 'Status',
        value: (p) => status(p).text,
        paint: (cell, p) => paintStatus(cell, status(p).tone),
      },
    ],
  });
}

function toneForStock(text: string): 'bad' | 'warn' | 'none' {
  if (text === 'Out of Stock') return 'bad';
  if (text === 'Low Stock') return 'warn';
  return 'none';
}

export function addStockMovementsSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  const rows = d.stockMovements
    .filter((m) => inRange(formatKarachi(m.created_at, 'yyyy-MM-dd'), d.range))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  addSheet(wb, {
    name: 'Stock Movements',
    tab: TAB.reference,
    rows,
    totals: true,
    emptyNote: 'No stock movements in the selected period.',
    columns: [
      { header: '#', kind: 'int', value: (_m, i) => i + 1, width: 6 },
      { header: 'Date (PKT)', kind: 'datetime', value: (m) => m.created_at },
      { header: 'Product', value: (m) => d.productById.get(m.product_id)?.name ?? DASH },
      { header: 'Type', value: (m) => movementType(m.type) },
      {
        header: 'Qty',
        kind: 'qty',
        total: true,
        // Signed, so the column sums to the stock on hand.
        value: (m) => (m.type === 'out' ? -m.quantity : m.quantity),
      },
      { header: 'Reference', value: (m) => reference(d, m) },
      { header: 'Note', value: (m) => m.note ?? DASH, width: 34 },
    ],
  });
}

function reference(d: BackupDataset, m: StockMovementRow): string {
  if (m.invoice_id) return d.invoiceNumber.get(m.invoice_id) ?? DASH;
  if (m.return_id) return d.returnNumber.get(m.return_id) ?? DASH;
  if (m.stock_purchase_id) return 'Purchase';
  return DASH;
}
