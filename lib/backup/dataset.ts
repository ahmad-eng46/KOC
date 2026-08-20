import type { BackupSection, ResolvedRange } from '@/lib/backup/options';

/**
 * The shape of everything the workbook prints, plus the pure derivations over
 * it. Kept free of the Supabase client so the sheet builders — and their
 * tests — never drag a service-role connection into the module graph;
 * lib/backup/load-dataset.ts is the half that talks to the database.
 */

export function str(v: unknown): string {
  return v == null ? '' : String(v);
}

export function nstr(v: unknown): string | null {
  const s = v == null ? '' : String(v);
  return s === '' ? null : s;
}

/** BIGINT arrives from PostgREST as a number or a string depending on size. */
export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function nnum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function bool(v: unknown): boolean {
  return v === true || v === 'true';
}

// ─────────────────────────────────────────────
// Row shapes — only the columns the workbook prints or computes with.
// ─────────────────────────────────────────────

export type LocationRow = { id: string; name: string; short_code: string | null };
export type BrandRow = {
  id: string; name: string; brand_type: string;
  contact_person: string | null; phone: string | null;
};
export type CustomerCategoryRow = {
  id: string; name: string; description: string | null; color: string | null;
  sort_order: number; is_active: boolean;
};
export type CustomerRow = {
  id: string; name: string; phone: string | null; address: string | null;
  location_id: string | null; category_id: string | null; opening_balance_paisa: number;
  credit_limit_paisa: number | null; is_defaulter: boolean; is_active: boolean;
};
export type ProductRow = {
  id: string; name: string; sku: string | null; unit: string;
  brand_id: string | null; sale_price_paisa: number; purchase_price_paisa: number;
  pack_size: number; pack_name: string | null; low_stock_threshold: number;
  is_active: boolean;
};
export type InvoiceRow = {
  id: string; invoice_number: string; customer_id: string; status: string;
  issue_date: string; due_date: string | null; subtotal_paisa: number;
  discount_paisa: number; total_paisa: number; paid_paisa: number;
  notes: string | null;
};
export type InvoiceItemRow = {
  id: string; invoice_id: string; product_id: string; quantity: number;
  unit_price_paisa: number; purchase_price_at_sale_paisa: number;
  discount_paisa: number; line_total_paisa: number;
  entered_quantity: number | null; entry_mode: string | null;
};
export type ReturnRow = {
  id: string; return_number: string; invoice_id: string; customer_id: string;
  return_date: string; total_paisa: number; notes: string | null;
};
export type ReturnItemRow = {
  id: string; return_id: string; product_id: string; quantity: number;
  unit_price_paisa: number; line_total_paisa: number;
  original_price_paisa: number | null; return_price_paisa: number | null;
  is_price_overridden: boolean; override_reason: string | null;
};
export type PaymentRow = {
  id: string; customer_id: string; invoice_id: string | null; amount_paisa: number;
  method: string; reference: string | null; payment_date: string;
  notes: string | null; deleted_at: string | null;
};
export type ExpenseRow = {
  id: string; type: string; category: string; asset_id: string | null;
  asset_name: string | null; sub_type_name: string | null; description: string | null;
  amount_paisa: number; expense_date: string; include_in_pnl: boolean;
  receipt_url: string | null;
};
export type ExpenseAssetRow = { id: string; name: string; category: string; asset_type: string | null };
export type SupplierRow = { id: string; name: string; phone: string | null; address: string | null };
export type StockPurchaseRow = {
  id: string; supplier_id: string; product_id: string; quantity: number;
  unit_price_paisa: number; total_paisa: number; purchase_date: string;
  notes: string | null; entered_quantity: number | null; entry_mode: string | null;
};
export type SupplierPaymentRow = {
  id: string; supplier_id: string; amount_paisa: number; payment_date: string;
  payment_method: string | null; reference: string | null;
};
export type StockMovementRow = {
  id: string; product_id: string; invoice_id: string | null; return_id: string | null;
  stock_purchase_id: string | null; type: string; quantity: number;
  note: string | null; created_at: string;
};
export type LedgerRow = {
  id: string; customer_id: string; ref_type: string; ref_id: string;
  entry_date: string; debit_paisa: number; credit_paisa: number;
  description: string | null; created_at: string;
};
export type UserRow = {
  id: string; email: string; full_name: string | null; role: string;
  is_active: boolean; last_login_at: string | null;
};
export type AuditRow = {
  id: string; user_id: string | null; table_name: string; row_id: string;
  action: string; before_jsonb: unknown; after_jsonb: unknown; at: string;
};

/** Sales, collections and dues per customer — the app's own balance formula. */
export type CustomerStats = {
  sales: number;
  paid: number;
  returned: number;
  balance: number;
};

export type SupplierStats = { purchased: number; paid: number; balance: number };

export type BackupDataset = {
  businessId: string;
  businessName: string;
  range: ResolvedRange;
  /** False for staff and viewer: cost columns are omitted, not blanked. */
  showCost: boolean;
  sections: Set<BackupSection>;

  locations: LocationRow[];
  brands: BrandRow[];
  customerCategories: CustomerCategoryRow[];
  customers: CustomerRow[];
  products: ProductRow[];
  invoices: InvoiceRow[];
  invoiceItems: InvoiceItemRow[];
  returns: ReturnRow[];
  returnItems: ReturnItemRow[];
  payments: PaymentRow[];
  expenses: ExpenseRow[];
  expenseAssets: ExpenseAssetRow[];
  suppliers: SupplierRow[];
  stockPurchases: StockPurchaseRow[];
  supplierPayments: SupplierPaymentRow[];
  stockMovements: StockMovementRow[];
  ledger: LedgerRow[];
  users: UserRow[];
  auditLog: AuditRow[];

  /** Name lookups, so no sheet ever prints a UUID in a business column. */
  locationName: Map<string, string>;
  brandName: Map<string, string>;
  customerCategoryName: Map<string, string>;
  customerName: Map<string, string>;
  productById: Map<string, ProductRow>;
  supplierName: Map<string, string>;
  userName: Map<string, string>;
  invoiceNumber: Map<string, string>;
  returnNumber: Map<string, string>;

  /** Units on hand per product, over every movement ever recorded. */
  stockByProduct: Map<string, number>;
  customerStats: Map<string, CustomerStats>;
  supplierStats: Map<string, SupplierStats>;
  itemsByInvoice: Map<string, InvoiceItemRow[]>;
};

/**
 * Whether a `YYYY-MM-DD` column falls in the chosen range.
 *
 * The range narrows what the transaction sheets *list*; it never narrows what
 * is *read*. Balances, stock on hand and the Summary sheet are all-time
 * figures by definition, so a query-level filter would quietly corrupt them —
 * "This Month" would report the month's sales as the customer's whole debt.
 */
export function inRange(day: string, range: ResolvedRange): boolean {
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

/** Mirrors the current_stock view: in and return add, out subtracts. */
export function computeStock(movements: StockMovementRow[]): Map<string, number> {
  const stock = new Map<string, number>();
  for (const m of movements) {
    const delta = m.type === 'out' ? -m.quantity : m.quantity;
    stock.set(m.product_id, (stock.get(m.product_id) ?? 0) + delta);
  }
  return stock;
}

/**
 * The same arithmetic customer_balances_view does — opening balance plus the
 * ledger's debits less its credits — so the workbook and the app never show
 * the owner two different numbers for the same customer.
 */
export function computeCustomerStats(
  customers: Array<Pick<CustomerRow, 'id' | 'opening_balance_paisa'>>,
  ledger: Array<Pick<LedgerRow, 'customer_id' | 'ref_type' | 'debit_paisa' | 'credit_paisa'>>,
): Map<string, CustomerStats> {
  const stats = new Map<string, CustomerStats>();
  for (const c of customers) {
    stats.set(c.id, { sales: 0, paid: 0, returned: 0, balance: c.opening_balance_paisa });
  }
  for (const e of ledger) {
    const s = stats.get(e.customer_id);
    if (!s) continue;
    s.balance += e.debit_paisa - e.credit_paisa;
    if (e.ref_type === 'invoice') s.sales += e.debit_paisa;
    else if (e.ref_type === 'payment') s.paid += e.credit_paisa;
    else if (e.ref_type === 'return') s.returned += e.credit_paisa;
  }
  return stats;
}

/** Positive balance means we still owe the supplier. */
export function computeSupplierStats(
  suppliers: Array<Pick<SupplierRow, 'id'>>,
  purchases: Array<Pick<StockPurchaseRow, 'supplier_id' | 'total_paisa'>>,
  payments: Array<Pick<SupplierPaymentRow, 'supplier_id' | 'amount_paisa'>>,
): Map<string, SupplierStats> {
  const stats = new Map<string, SupplierStats>();
  for (const s of suppliers) stats.set(s.id, { purchased: 0, paid: 0, balance: 0 });
  for (const p of purchases) {
    const s = stats.get(p.supplier_id);
    if (s) s.purchased += p.total_paisa;
  }
  for (const p of payments) {
    const s = stats.get(p.supplier_id);
    if (s) s.paid += p.amount_paisa;
  }
  for (const s of stats.values()) s.balance = s.purchased - s.paid;
  return stats;
}
