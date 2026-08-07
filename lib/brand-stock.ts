import type { Money } from '@/lib/money';

/**
 * Pure stock-report shaping shared by the PDF, the Excel export and their
 * tests. Status semantics match the app everywhere else (StockList,
 * brand_summary_view): out = on-hand <= 0, low = 0 < on-hand <= threshold.
 */

export type StockStatus = 'stocked' | 'low' | 'out_of_stock';

export type BrandStockProduct = {
  name: string;
  stock: number;
  unit: string;
  sale_price_paisa: Money;
  /** Present only when the caller's role may see cost (admin/accountant). */
  purchase_price_paisa?: Money;
  status: StockStatus;
};

export type BrandStockSummary = {
  total_products: number;
  total_stock: number;
  low_stock_count: number;
  out_of_stock_count: number;
};

export type ReorderItem = {
  name: string;
  current_stock: number;
  status: Exclude<StockStatus, 'stocked'>;
};

export const STATUS_LABELS: Record<StockStatus, string> = {
  stocked: 'Stocked',
  low: 'Low',
  out_of_stock: 'Out of Stock',
};

export function stockStatus(onHand: number, threshold: number | null): StockStatus {
  if (onHand <= 0) return 'out_of_stock';
  if (threshold != null && threshold > 0 && onHand <= threshold) return 'low';
  return 'stocked';
}

const STATUS_RANK: Record<StockStatus, number> = { out_of_stock: 0, low: 1, stocked: 2 };

/** The supplier-facing order: out of stock first, then low, then A–Z. */
export function sortForReport<T extends { name: string; status: StockStatus }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.name.localeCompare(b.name),
  );
}

export function summarize(products: BrandStockProduct[]): BrandStockSummary {
  return {
    total_products: products.length,
    // Negative on-hand (data errors) must not shrink the total a rep reads.
    total_stock: products.reduce((s, p) => s + Math.max(p.stock, 0), 0),
    low_stock_count: products.filter((p) => p.status === 'low').length,
    out_of_stock_count: products.filter((p) => p.status === 'out_of_stock').length,
  };
}

/** The section the rep reads first: everything that needs reordering. */
export function reorderItems(products: BrandStockProduct[]): ReorderItem[] {
  return sortForReport(products)
    .filter((p): p is BrandStockProduct & { status: ReorderItem['status'] } =>
      p.status !== 'stocked',
    )
    .map((p) => ({ name: p.name, current_stock: Math.max(p.stock, 0), status: p.status }));
}
