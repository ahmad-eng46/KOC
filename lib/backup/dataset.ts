import { adminClient } from '@/lib/supabase/admin';
import type { BackupSection, ResolvedRange } from '@/lib/backup/options';

/**
 * Everything the workbook needs, read once and shaped for the sheet builders.
 *
 * Reads go through the service-role client, so the `*_for_role` views are
 * unusable here — `user_role()` and `user_has_business()` both resolve against
 * `auth.uid()`, which is NULL for the service role, and the views would hand
 * back empty sets and NULL prices. Base tables are read directly and the
 * business filter is applied explicitly on every query; the purchase-price
 * gate (iron rule #3) is applied from the caller's session role, in
 * `visibleCost()`.
 *
 * Rows are paged rather than fetched with a big `.limit()`: PostgREST caps a
 * single response at `db.max_rows` (1000 on Supabase), so a limit of 50,000
 * silently returned the first 1,000 rows and called it a backup.
 */

const PAGE = 1000;
/** Runaway guard, per table. Reaching it is reported on the Info sheet. */
const MAX_ROWS = 250_000;
/** `in (...)` becomes a query string; long id lists must be chunked. */
const IN_CHUNK = 200;

type Raw = Record<string, unknown>;

type Filter =
  | { op: 'eq'; col: string; value: string }
  | { op: 'isNull'; col: string }
  | { op: 'gte'; col: string; value: string }
  | { op: 'lte'; col: string; value: string };

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

function applyFilters<T extends { eq: unknown }>(builder: T, filters: Filter[]): T {
  type Q = {
    eq: (c: string, v: string) => Q;
    is: (c: string, v: null) => Q;
    gte: (c: string, v: string) => Q;
    lte: (c: string, v: string) => Q;
  };
  let q = builder as unknown as Q;
  for (const f of filters) {
    if (f.op === 'eq') q = q.eq(f.col, f.value);
    else if (f.op === 'isNull') q = q.is(f.col, null);
    else if (f.op === 'gte') q = q.gte(f.col, f.value);
    else q = q.lte(f.col, f.value);
  }
  return q as unknown as T;
}

async function fetchPaged(
  table: string,
  columns: string,
  filters: Filter[],
  orderBy = 'id',
): Promise<Raw[]> {
  const out: Raw[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const base = adminClient.from(table).select(columns);
    const { data, error } = await applyFilters(base, filters)
      .order(orderBy, { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Reading ${table}: ${error.message}`);
    const rows = (data ?? []) as unknown as Raw[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Child rows of a parent set — chunked so the `in (...)` list stays short. */
async function fetchByParentIds(
  table: string,
  columns: string,
  fk: string,
  ids: string[],
  filters: Filter[],
): Promise<Raw[]> {
  if (ids.length === 0) return [];
  const out: Raw[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
      const base = adminClient.from(table).select(columns).in(fk, chunk);
      const { data, error } = await applyFilters(base, filters)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(`Reading ${table}: ${error.message}`);
      const rows = (data ?? []) as unknown as Raw[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
  }
  return out;
}

// ─────────────────────────────────────────────
// Row shapes — only the columns the workbook prints or computes with.
// ─────────────────────────────────────────────

export type LocationRow = { id: string; name: string; short_code: string | null };
export type BrandRow = {
  id: string; name: string; brand_type: string;
  contact_person: string | null; phone: string | null;
};
export type CustomerRow = {
  id: string; name: string; phone: string | null; address: string | null;
  location_id: string | null; opening_balance_paisa: number;
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

function indexBy<T>(rows: T[], key: (r: T) => string, label: (r: T) => string): Map<string, string> {
  return new Map(rows.map((r) => [key(r), label(r)]));
}

export async function loadBackupDataset(input: {
  businessId: string;
  businessName: string;
  range: ResolvedRange;
  showCost: boolean;
  sections: Set<BackupSection>;
}): Promise<BackupDataset> {
  const { businessId, range, sections } = input;
  const biz: Filter[] = [{ op: 'eq', col: 'business_id', value: businessId }];
  const live: Filter[] = [...biz, { op: 'isNull', col: 'deleted_at' }];

  // Entity tables are never date-filtered: a balance is an all-time number,
  // and a product list narrowed to one month is not a product list.
  const [
    rawLocations, rawBrands, rawCustomers, rawProducts, rawSuppliers,
  ] = await Promise.all([
    fetchPaged('locations', 'id, name, short_code', live, 'name'),
    fetchPaged('brands', 'id, name, brand_type, contact_person, phone', live, 'name'),
    fetchPaged(
      'customers',
      'id, name, phone, address, location_id, opening_balance_paisa, credit_limit_paisa, is_defaulter, is_active',
      live, 'name',
    ),
    fetchPaged(
      'products',
      'id, name, sku, unit, brand_id, sale_price_paisa, purchase_price_paisa, pack_size, pack_name, low_stock_threshold, is_active',
      live, 'name',
    ),
    fetchPaged('suppliers', 'id, name, phone, address', live, 'name'),
  ]);

  const [
    rawInvoices, rawReturns, rawPayments, rawExpenses, rawExpenseAssets,
    rawPurchases, rawSupplierPayments, rawMovements, rawLedger,
  ] = await Promise.all([
    fetchPaged(
      'invoices',
      'id, invoice_number, customer_id, status, issue_date, due_date, subtotal_paisa, discount_paisa, total_paisa, paid_paisa, notes',
      live, 'issue_date',
    ),
    fetchPaged(
      'returns',
      'id, return_number, invoice_id, customer_id, return_date, total_paisa, notes',
      live, 'return_date',
    ),
    // Deleted payments are kept and flagged: the ledger still counts them, so
    // hiding them would leave an unexplainable gap in the customer balance.
    fetchPaged(
      'payments',
      'id, customer_id, invoice_id, amount_paisa, method, reference, payment_date, notes, deleted_at',
      biz, 'payment_date',
    ),
    fetchPaged(
      'expenses',
      'id, type, category, asset_id, asset_name, sub_type_name, description, amount_paisa, expense_date, include_in_pnl, receipt_url',
      live, 'expense_date',
    ),
    fetchPaged('expense_assets', 'id, name, category, asset_type', live, 'name'),
    fetchPaged(
      'stock_purchases',
      'id, supplier_id, product_id, quantity, unit_price_paisa, total_paisa, purchase_date, notes, entered_quantity, entry_mode',
      live, 'purchase_date',
    ),
    fetchPaged(
      'supplier_payments',
      'id, supplier_id, amount_paisa, payment_date, payment_method, reference',
      live, 'payment_date',
    ),
    fetchPaged(
      'stock_movements',
      'id, product_id, invoice_id, return_id, stock_purchase_id, type, quantity, note, created_at',
      biz, 'created_at',
    ),
    fetchPaged(
      'ledger_entries',
      'id, customer_id, ref_type, ref_id, entry_date, debit_paisa, credit_paisa, description, created_at',
      biz, 'entry_date',
    ),
  ]);

  const invoices: InvoiceRow[] = rawInvoices.map((r) => ({
    id: str(r.id),
    invoice_number: str(r.invoice_number),
    customer_id: str(r.customer_id),
    status: str(r.status),
    issue_date: str(r.issue_date),
    due_date: nstr(r.due_date),
    subtotal_paisa: num(r.subtotal_paisa),
    discount_paisa: num(r.discount_paisa),
    total_paisa: num(r.total_paisa),
    paid_paisa: num(r.paid_paisa),
    notes: nstr(r.notes),
  }));

  const returns: ReturnRow[] = rawReturns.map((r) => ({
    id: str(r.id),
    return_number: str(r.return_number),
    invoice_id: str(r.invoice_id),
    customer_id: str(r.customer_id),
    return_date: str(r.return_date),
    total_paisa: num(r.total_paisa),
    notes: nstr(r.notes),
  }));

  const wantsItems = sections.has('invoices');
  const [rawInvoiceItems, rawReturnItems, rawUsers] = await Promise.all([
    wantsItems
      ? fetchByParentIds(
        'invoice_items',
        'id, invoice_id, product_id, quantity, unit_price_paisa, purchase_price_at_sale_paisa, discount_paisa, line_total_paisa, entered_quantity, entry_mode',
        'invoice_id', invoices.map((i) => i.id), [],
      )
      : Promise.resolve([] as Raw[]),
    sections.has('returns')
      ? fetchByParentIds(
        'return_items',
        'id, return_id, product_id, quantity, unit_price_paisa, line_total_paisa, original_price_paisa, return_price_paisa, is_price_overridden, override_reason',
        'return_id', returns.map((r) => r.id), [],
      )
      : Promise.resolve([] as Raw[]),
    loadBusinessUsers(businessId),
  ]);

  const auditLog: AuditRow[] = sections.has('audit') ? await loadRecentAudit() : [];

  const locations: LocationRow[] = rawLocations.map((r) => ({
    id: str(r.id), name: str(r.name), short_code: nstr(r.short_code),
  }));
  const brands: BrandRow[] = rawBrands.map((r) => ({
    id: str(r.id), name: str(r.name), brand_type: str(r.brand_type),
    contact_person: nstr(r.contact_person), phone: nstr(r.phone),
  }));
  const customers: CustomerRow[] = rawCustomers.map((r) => ({
    id: str(r.id), name: str(r.name), phone: nstr(r.phone), address: nstr(r.address),
    location_id: nstr(r.location_id),
    opening_balance_paisa: num(r.opening_balance_paisa),
    credit_limit_paisa: nnum(r.credit_limit_paisa),
    is_defaulter: bool(r.is_defaulter), is_active: bool(r.is_active),
  }));
  const products: ProductRow[] = rawProducts.map((r) => ({
    id: str(r.id), name: str(r.name), sku: nstr(r.sku), unit: str(r.unit) || 'unit',
    brand_id: nstr(r.brand_id),
    sale_price_paisa: num(r.sale_price_paisa),
    purchase_price_paisa: num(r.purchase_price_paisa),
    pack_size: Math.max(1, num(r.pack_size) || 1),
    pack_name: nstr(r.pack_name),
    low_stock_threshold: num(r.low_stock_threshold),
    is_active: bool(r.is_active),
  }));
  const suppliers: SupplierRow[] = rawSuppliers.map((r) => ({
    id: str(r.id), name: str(r.name), phone: nstr(r.phone), address: nstr(r.address),
  }));
  const invoiceItems: InvoiceItemRow[] = rawInvoiceItems.map((r) => ({
    id: str(r.id), invoice_id: str(r.invoice_id), product_id: str(r.product_id),
    quantity: num(r.quantity), unit_price_paisa: num(r.unit_price_paisa),
    purchase_price_at_sale_paisa: num(r.purchase_price_at_sale_paisa),
    discount_paisa: num(r.discount_paisa), line_total_paisa: num(r.line_total_paisa),
    entered_quantity: nnum(r.entered_quantity), entry_mode: nstr(r.entry_mode),
  }));
  const returnItems: ReturnItemRow[] = rawReturnItems.map((r) => ({
    id: str(r.id), return_id: str(r.return_id), product_id: str(r.product_id),
    quantity: num(r.quantity), unit_price_paisa: num(r.unit_price_paisa),
    line_total_paisa: num(r.line_total_paisa),
    original_price_paisa: nnum(r.original_price_paisa),
    return_price_paisa: nnum(r.return_price_paisa),
    is_price_overridden: bool(r.is_price_overridden),
    override_reason: nstr(r.override_reason),
  }));
  const payments: PaymentRow[] = rawPayments.map((r) => ({
    id: str(r.id), customer_id: str(r.customer_id), invoice_id: nstr(r.invoice_id),
    amount_paisa: num(r.amount_paisa), method: str(r.method),
    reference: nstr(r.reference), payment_date: str(r.payment_date),
    notes: nstr(r.notes), deleted_at: nstr(r.deleted_at),
  }));
  const expenses: ExpenseRow[] = rawExpenses.map((r) => ({
    id: str(r.id), type: str(r.type), category: str(r.category),
    asset_id: nstr(r.asset_id), asset_name: nstr(r.asset_name),
    sub_type_name: nstr(r.sub_type_name), description: nstr(r.description),
    amount_paisa: num(r.amount_paisa), expense_date: str(r.expense_date),
    include_in_pnl: bool(r.include_in_pnl), receipt_url: nstr(r.receipt_url),
  }));
  const expenseAssets: ExpenseAssetRow[] = rawExpenseAssets.map((r) => ({
    id: str(r.id), name: str(r.name), category: str(r.category),
    asset_type: nstr(r.asset_type),
  }));
  const stockPurchases: StockPurchaseRow[] = rawPurchases.map((r) => ({
    id: str(r.id), supplier_id: str(r.supplier_id), product_id: str(r.product_id),
    quantity: num(r.quantity), unit_price_paisa: num(r.unit_price_paisa),
    total_paisa: num(r.total_paisa), purchase_date: str(r.purchase_date),
    notes: nstr(r.notes), entered_quantity: nnum(r.entered_quantity),
    entry_mode: nstr(r.entry_mode),
  }));
  const supplierPayments: SupplierPaymentRow[] = rawSupplierPayments.map((r) => ({
    id: str(r.id), supplier_id: str(r.supplier_id), amount_paisa: num(r.amount_paisa),
    payment_date: str(r.payment_date), payment_method: nstr(r.payment_method),
    reference: nstr(r.reference),
  }));
  const stockMovements: StockMovementRow[] = rawMovements.map((r) => ({
    id: str(r.id), product_id: str(r.product_id), invoice_id: nstr(r.invoice_id),
    return_id: nstr(r.return_id), stock_purchase_id: nstr(r.stock_purchase_id),
    type: str(r.type), quantity: num(r.quantity), note: nstr(r.note),
    created_at: str(r.created_at),
  }));
  const ledger: LedgerRow[] = rawLedger.map((r) => ({
    id: str(r.id), customer_id: str(r.customer_id), ref_type: str(r.ref_type),
    ref_id: str(r.ref_id), entry_date: str(r.entry_date),
    debit_paisa: num(r.debit_paisa), credit_paisa: num(r.credit_paisa),
    description: nstr(r.description), created_at: str(r.created_at),
  }));

  const itemsByInvoice = new Map<string, InvoiceItemRow[]>();
  for (const item of invoiceItems) {
    const list = itemsByInvoice.get(item.invoice_id);
    if (list) list.push(item);
    else itemsByInvoice.set(item.invoice_id, [item]);
  }

  return {
    businessId,
    businessName: input.businessName,
    range,
    showCost: input.showCost,
    sections,
    locations, brands, customers, products, invoices, invoiceItems,
    returns, returnItems, payments, expenses, expenseAssets, suppliers,
    stockPurchases, supplierPayments, stockMovements, ledger,
    users: rawUsers, auditLog,

    locationName: indexBy(locations, (l) => l.id, (l) => l.name),
    brandName: indexBy(brands, (b) => b.id, (b) => b.name),
    customerName: indexBy(customers, (c) => c.id, (c) => c.name),
    productById: new Map(products.map((p) => [p.id, p])),
    supplierName: indexBy(suppliers, (s) => s.id, (s) => s.name),
    userName: indexBy(rawUsers, (u) => u.id, (u) => u.full_name || u.email),
    invoiceNumber: indexBy(invoices, (i) => i.id, (i) => i.invoice_number),
    returnNumber: indexBy(returns, (r) => r.id, (r) => r.return_number),

    stockByProduct: computeStock(stockMovements),
    customerStats: computeCustomerStats(customers, ledger),
    supplierStats: computeSupplierStats(suppliers, stockPurchases, supplierPayments),
    itemsByInvoice,
  };
}

async function loadBusinessUsers(businessId: string): Promise<UserRow[]> {
  const links = await fetchPaged(
    'user_businesses', 'user_id',
    [{ op: 'eq', col: 'business_id', value: businessId }],
    'user_id',
  );
  const ids = links.map((l) => str(l.user_id)).filter(Boolean);
  const rows = await fetchByParentIds(
    'users', 'id, email, full_name, role, is_active, last_login_at', 'id', ids,
    [{ op: 'isNull', col: 'deleted_at' }],
  );
  return rows.map((r) => ({
    id: str(r.id), email: str(r.email), full_name: nstr(r.full_name),
    role: str(r.role), is_active: bool(r.is_active),
    last_login_at: nstr(r.last_login_at),
  }));
}

/** The audit log is global and can run to millions of rows; take the tail. */
async function loadRecentAudit(): Promise<AuditRow[]> {
  const { data, error } = await adminClient
    .from('audit_log')
    .select('id, user_id, table_name, row_id, action, before_jsonb, after_jsonb, at')
    .order('at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(`Reading audit_log: ${error.message}`);
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    id: str(r.id), user_id: nstr(r.user_id), table_name: str(r.table_name),
    row_id: str(r.row_id), action: str(r.action),
    before_jsonb: r.before_jsonb, after_jsonb: r.after_jsonb, at: str(r.at),
  }));
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
