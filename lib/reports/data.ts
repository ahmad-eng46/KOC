// Server-side data fetchers for report exports.
// These use the auth-context Supabase server client (RLS applies),
// so they can be called from server actions safely.

import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSetting, SETTING_KEYS, SETTING_DEFAULTS } from '@/lib/settings';
import { getSession } from '@/lib/auth/session';
import { formatKarachi } from '@/lib/date';
import type { DateRange } from '@/components/reports/shared';

/**
 * Supabase caps every PostgREST response at db.max_rows (1000). Without paging,
 * a report over a larger set is silently cut to 1000 rows — and because the
 * totals below the table are summed from the rows that arrived, the figures
 * come out short as well, presented as fact.
 *
 * The Excel backup hit this exact bug and was fixed by paging; the report layer
 * never received that fix. Every read below goes through here.
 *
 * The guard is a backstop, not a limit anyone should reach: at the current
 * scale (~1,150 invoices) no report comes close. If one ever does, it stops and
 * says so rather than quietly returning a third of the ledger.
 */
const PAGE_SIZE = 1000;
const MAX_ROWS = 250_000;

/**
 * `.in()` puts every id in the query string, so a year of invoices would build a
 * URL long enough for the server to reject. Ids go in batches.
 */
const ID_CHUNK = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Query = {
  range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};

export async function fetchAllRows<T>(
  build: () => Query,
  label: string,
): Promise<T[]> {
  const out: T[] = [];

  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);

    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }

  throw new Error(
    `${label}: more than ${MAX_ROWS.toLocaleString()} rows match. Narrow the date range and export again.`,
  );
}

/** Optional brand/product narrowing, matching the Sales Report's dropdowns. */
export type SalesScope = { brandId?: string; productId?: string };

export type SalesData = {
  /** "Double Horse", "DH Motor Oil 20W-50 (Double Horse)", or null for everything. */
  scopeLabel: string | null;
  rows: Array<{
    invoice_number: string;
    issue_date: string;
    customer_name: string;
    total_paisa: number;
    paid_paisa: number;
  }>;
  total_paisa: number;
  by_day: Array<{ date: string; total_paisa: number; count: number }>;
  top_customers: Array<{ customer_name: string; total_paisa: number; invoice_count: number }>;
};

export async function fetchSalesData(
  range: DateRange,
  scope: SalesScope = {},
): Promise<SalesData> {
  const supabase = await createServerClient();
  const businessId = await getActiveBusinessId();

  // A brand or product filter needs line-level rows, so the export switches to
  // sales_analytics_view. Unfiltered, it stays on the invoice query it always
  // used, so the numbers match the report exactly.
  if (scope.brandId || scope.productId) {
    return fetchScopedSalesData(supabase, businessId, range, scope);
  }

  const data = await fetchAllRows<Record<string, unknown>>(
    () => supabase
      .from('invoices')
      .select('invoice_number, issue_date, total_paisa, paid_paisa, customers(name)')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .neq('status', 'draft')
      .neq('status', 'cancelled')
      .gte('issue_date', range.from)
      .lte('issue_date', range.to)
      .order('issue_date'),
    'Sales report',
  );

  type RawCust = { name: string };
  type Raw = {
    invoice_number: string; issue_date: string;
    total_paisa: number; paid_paisa: number;
    customers: RawCust | RawCust[] | null;
  };

  const rows = (data as unknown as Raw[]).map((r) => {
    const c = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    return {
      invoice_number: r.invoice_number,
      issue_date: r.issue_date,
      customer_name: c?.name ?? '—',
      total_paisa: Number(r.total_paisa),
      paid_paisa: Number(r.paid_paisa),
    };
  });

  const total_paisa = rows.reduce((s, r) => s + r.total_paisa, 0);

  const dayMap = new Map<string, { total_paisa: number; count: number }>();
  for (const r of rows) {
    const v = dayMap.get(r.issue_date) ?? { total_paisa: 0, count: 0 };
    v.total_paisa += r.total_paisa;
    v.count += 1;
    dayMap.set(r.issue_date, v);
  }
  const by_day = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const customerMap = new Map<string, { total_paisa: number; invoice_count: number }>();
  for (const r of rows) {
    const v = customerMap.get(r.customer_name) ?? { total_paisa: 0, invoice_count: 0 };
    v.total_paisa += r.total_paisa;
    v.invoice_count += 1;
    customerMap.set(r.customer_name, v);
  }
  const top_customers = Array.from(customerMap.entries())
    .map(([customer_name, v]) => ({ customer_name, ...v }))
    .sort((a, b) => b.total_paisa - a.total_paisa)
    .slice(0, 10);

  return { scopeLabel: null, rows, total_paisa, by_day, top_customers };
}

/**
 * The same shape, read from sales_analytics_view so a brand or product filter
 * can apply. Amounts are net of returns with the invoice discount already
 * shared across lines; paid_paisa is 0 per row because a payment settles a
 * whole invoice and cannot be attributed to one product line.
 */
async function fetchScopedSalesData(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  businessId: string,
  range: DateRange,
  scope: SalesScope,
): Promise<SalesData> {
  const build = () => {
    let q = supabase
      .from('sales_analytics_view')
      .select('invoice_number, issue_date, customer_name, product_name, brand_name, net_quantity, net_amount_paisa')
      .eq('business_id', businessId)
      .gte('issue_date', range.from)
      .lte('issue_date', range.to)
      .order('issue_date');

    // 'unbranded' is not an id — it means the lines whose product has no brand.
    if (scope.brandId === 'unbranded') q = q.is('brand_id', null);
    else if (scope.brandId) q = q.eq('brand_id', scope.brandId);
    if (scope.productId) q = q.eq('product_id', scope.productId);
    return q;
  };

  const data = await fetchAllRows<Record<string, unknown>>(build, 'Filtered sales report');

  type Raw = {
    invoice_number: string; issue_date: string; customer_name: string | null;
    product_name: string; brand_name: string | null;
    net_quantity: number | string; net_amount_paisa: number | string;
  };
  const raw = (data ?? []) as unknown as Raw[];

  const rows = raw.map((r) => ({
    invoice_number: r.invoice_number,
    issue_date: r.issue_date,
    customer_name: r.customer_name ?? '—',
    total_paisa: Number(r.net_amount_paisa),
    paid_paisa: 0,
  }));

  const total_paisa = rows.reduce((sum, r) => sum + r.total_paisa, 0);

  const dayMap = new Map<string, { total_paisa: number; count: number }>();
  for (const r of rows) {
    const v = dayMap.get(r.issue_date) ?? { total_paisa: 0, count: 0 };
    v.total_paisa += r.total_paisa;
    v.count += 1;
    dayMap.set(r.issue_date, v);
  }
  const by_day = [...dayMap.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const custMap = new Map<string, { total_paisa: number; invoices: Set<string> }>();
  for (const [i, r] of rows.entries()) {
    const v = custMap.get(r.customer_name) ?? { total_paisa: 0, invoices: new Set<string>() };
    v.total_paisa += r.total_paisa;
    v.invoices.add(raw[i].invoice_number);
    custMap.set(r.customer_name, v);
  }
  const top_customers = [...custMap.entries()]
    .map(([customer_name, v]) => ({
      customer_name, total_paisa: v.total_paisa, invoice_count: v.invoices.size,
    }))
    .sort((a, b) => b.total_paisa - a.total_paisa)
    .slice(0, 10);

  const productName = scope.productId ? raw[0]?.product_name ?? null : null;
  const brandName = scope.brandId === 'unbranded'
    ? 'Unbranded'
    : raw.find((r) => r.brand_name)?.brand_name ?? null;
  const scopeLabel = productName
    ? `${productName}${brandName ? ` (${brandName})` : ''}`
    : brandName;

  return { scopeLabel, rows, total_paisa, by_day, top_customers };
}

export type PurchaseData = {
  rows: Array<{
    movement_date: string;
    product_name: string;
    sku: string | null;
    unit: string;
    quantity: number;
    purchase_price_paisa: number;
    total_value_paisa: number;
    note: string | null;
  }>;
  total_value_paisa: number;
  by_product: Array<{
    product_name: string; quantity: number; total_value_paisa: number;
  }>;
};

export async function fetchPurchaseData(range: DateRange): Promise<PurchaseData> {
  const supabase = await createServerClient();
  const businessId = await getActiveBusinessId();

  const data = await fetchAllRows<Record<string, unknown>>(
    () => supabase
      .from('stock_movements')
      .select('quantity, note, created_at, products(name, sku, unit, purchase_price_paisa)')
      .eq('business_id', businessId)
      .eq('type', 'in')
      .gte('created_at', range.from)
      .lte('created_at', `${range.to}T23:59:59`)
      .order('created_at', { ascending: false }),
    'Purchase report',
  );

  type RawProd = { name: string; sku: string | null; unit: string; purchase_price_paisa: number | null };
  type Raw = { quantity: number; note: string | null; created_at: string; products: RawProd | RawProd[] | null };

  const rows = (data as unknown as Raw[]).map((r) => {
    const p = Array.isArray(r.products) ? r.products[0] : r.products;
    const qty = Number(r.quantity);
    const price = Number(p?.purchase_price_paisa ?? 0);
    return {
      movement_date: r.created_at.slice(0, 10),
      product_name: p?.name ?? '—',
      sku: p?.sku ?? null,
      unit: p?.unit ?? '',
      quantity: qty,
      purchase_price_paisa: price,
      total_value_paisa: Math.round(qty * price),
      note: r.note,
    };
  });
  const total_value_paisa = rows.reduce((s, r) => s + r.total_value_paisa, 0);

  const productMap = new Map<string, { quantity: number; total_value_paisa: number }>();
  for (const r of rows) {
    const v = productMap.get(r.product_name) ?? { quantity: 0, total_value_paisa: 0 };
    v.quantity += r.quantity;
    v.total_value_paisa += r.total_value_paisa;
    productMap.set(r.product_name, v);
  }
  const by_product = Array.from(productMap.entries())
    .map(([product_name, v]) => ({ product_name, ...v }))
    .sort((a, b) => b.total_value_paisa - a.total_value_paisa);

  return { rows, total_value_paisa, by_product };
}

export type CustomerReportData = {
  rows: Array<{
    customer_name: string;
    phone: string | null;
    invoiced_paisa: number;
    paid_paisa: number;
    balance_paisa: number;
    last_activity: string | null;
  }>;
};

export async function fetchCustomerReportData(): Promise<CustomerReportData> {
  const supabase = await createServerClient();
  const businessId = await getActiveBusinessId();

  // The ledger is the big one here — one row per invoice, payment and return
  // ever recorded. It is exactly the table the 1000-row cap used to truncate.
  const [customers, ledger] = await Promise.all([
    fetchAllRows<{ id: string; name: string; phone: string | null; opening_balance_paisa: number }>(
      () => supabase
        .from('customers')
        .select('id, name, phone, opening_balance_paisa')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .order('name'),
      'Customer report (customers)',
    ),
    fetchAllRows<{ customer_id: string; ref_type: string; debit_paisa: number; credit_paisa: number; entry_date: string }>(
      () => supabase
        .from('ledger_entries')
        .select('customer_id, ref_type, debit_paisa, credit_paisa, entry_date')
        .eq('business_id', businessId)
        .order('entry_date'),
      'Customer report (ledger)',
    ),
  ]);

  const map = new Map<string, { invoiced: number; paid: number; deltaSum: number; lastDate: string | null }>();
  for (const e of ledger) {
    const a = map.get(e.customer_id) ?? { invoiced: 0, paid: 0, deltaSum: 0, lastDate: null };
    a.deltaSum += Number(e.debit_paisa) - Number(e.credit_paisa);
    if (e.ref_type === 'invoice') a.invoiced += Number(e.debit_paisa);
    if (e.ref_type === 'payment') a.paid += Number(e.credit_paisa);
    if (!a.lastDate || e.entry_date > a.lastDate) a.lastDate = e.entry_date;
    map.set(e.customer_id, a);
  }

  const rows = customers.map((c) => {
    const a = map.get(c.id);
    return {
      customer_name: c.name,
      phone: c.phone,
      invoiced_paisa: a?.invoiced ?? 0,
      paid_paisa: a?.paid ?? 0,
      balance_paisa: Number(c.opening_balance_paisa) + (a?.deltaSum ?? 0),
      last_activity: a?.lastDate ?? null,
    };
  });

  return { rows };
}

export type BalanceData = {
  rows: Array<{
    customer_name: string;
    phone: string | null;
    balance_paisa: number;
    last_activity: string | null;
    days_inactive: number;
    bucket: '0-30' | '31-60' | '61-90' | '90+';
  }>;
  total_paisa: number;
  by_bucket: Record<'0-30' | '31-60' | '61-90' | '90+', number>;
};

export async function fetchBalanceData(): Promise<BalanceData> {
  const cust = await fetchCustomerReportData();
  const today = new Date();

  const rows = cust.rows
    .filter((r) => r.balance_paisa > 0)
    .map((r) => {
      const daysInactive = r.last_activity
        ? Math.floor((today.getTime() - new Date(r.last_activity).getTime()) / (1000 * 60 * 60 * 24))
        : 9999;
      let bucket: '0-30' | '31-60' | '61-90' | '90+' = '0-30';
      if (daysInactive > 90) bucket = '90+';
      else if (daysInactive > 60) bucket = '61-90';
      else if (daysInactive > 30) bucket = '31-60';
      return {
        customer_name: r.customer_name,
        phone: r.phone,
        balance_paisa: r.balance_paisa,
        last_activity: r.last_activity,
        days_inactive: daysInactive,
        bucket,
      };
    });

  const total_paisa = rows.reduce((s, r) => s + r.balance_paisa, 0);
  const by_bucket: BalanceData['by_bucket'] = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  for (const r of rows) by_bucket[r.bucket] += r.balance_paisa;

  return { rows, total_paisa, by_bucket };
}

// ───────────────────────────────────────────────
// 5. P&L
// ───────────────────────────────────────────────
export type PLData = {
  range: DateRange;
  business_id: string;
  business_name: string;
  sales_paisa: number;
  returns_paisa: number;
  net_sales_paisa: number;
  cogs_paisa: number;
  cogs_returns_paisa: number;
  net_cogs_paisa: number;
  gross_profit_paisa: number;
  opex_paisa: number;
  home_exp_paisa: number;
  total_exp_paisa: number;
  net_profit_paisa: number;
  include_home_in_pnl: boolean;
  expenses_by_category: Array<{ category: string; type: 'business' | 'home'; total_paisa: number }>;
};

export async function fetchPLData(range: DateRange): Promise<PLData> {
  const supabase = await createServerClient();
  const businessId = await getActiveBusinessId();

  const includeHome = await getSetting(SETTING_KEYS.home_expense_in_pnl, SETTING_DEFAULTS.home_expense_in_pnl);

  const { data: biz } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', businessId)
    .single();

  // Sales = Σ invoices.total_paisa in range (not deleted, not draft/cancelled)
  const invoiceRows = await fetchAllRows<{ id: string; total_paisa: number }>(
    () => supabase
      .from('invoices')
      .select('id, total_paisa')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .neq('status', 'draft')
      .neq('status', 'cancelled')
      .gte('issue_date', range.from)
      .lte('issue_date', range.to)
      .order('id'),
    'P&L (invoices)',
  );
  const sales_paisa = invoiceRows.reduce((s, r) => s + Number(r.total_paisa), 0);
  const invoiceIdsInRange = new Set(invoiceRows.map((r) => r.id));

  // Returns = Σ returns.total_paisa in range
  const returnRows = await fetchAllRows<{ id: string; total_paisa: number }>(
    () => supabase
      .from('returns')
      .select('id, total_paisa')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .gte('return_date', range.from)
      .lte('return_date', range.to)
      .order('id'),
    'P&L (returns)',
  );
  const returns_paisa = returnRows.reduce((s, r) => s + Number(r.total_paisa), 0);
  const returnIdsInRange = new Set(returnRows.map((r) => r.id));

  // COGS for sales: Σ over invoice_items in those invoices: qty * purchase_price_at_sale_paisa
  let cogs_paisa = 0;
  for (const ids of chunk([...invoiceIdsInRange], ID_CHUNK)) {
    const itemRows = await fetchAllRows<{ quantity: number; purchase_price_at_sale_paisa: number }>(
      () => supabase
        .from('invoice_items')
        .select('invoice_id, quantity, purchase_price_at_sale_paisa')
        .in('invoice_id', ids)
        .order('invoice_id'),
      'P&L (invoice items)',
    );
    for (const it of itemRows) {
      cogs_paisa += Math.round(Number(it.quantity) * Number(it.purchase_price_at_sale_paisa));
    }
  }

  // COGS reversal for returns: lookup via return_items joined to invoice_items
  let cogs_returns_paisa = 0;
  type RawInvItem = { purchase_price_at_sale_paisa: number };
  type RawRet = { quantity: number; invoice_items: RawInvItem | RawInvItem[] };
  for (const ids of chunk([...returnIdsInRange], ID_CHUNK)) {
    const retItems = await fetchAllRows<RawRet>(
      () => supabase
        .from('return_items')
        .select('return_id, quantity, invoice_item_id, invoice_items!inner(purchase_price_at_sale_paisa)')
        .in('return_id', ids)
        .order('return_id'),
      'P&L (return items)',
    );
    for (const ri of retItems) {
      const ii = Array.isArray(ri.invoice_items) ? ri.invoice_items[0] : ri.invoice_items;
      cogs_returns_paisa += Math.round(Number(ri.quantity) * Number(ii?.purchase_price_at_sale_paisa ?? 0));
    }
  }

  const net_sales_paisa = sales_paisa - returns_paisa;
  const net_cogs_paisa = cogs_paisa - cogs_returns_paisa;
  const gross_profit_paisa = net_sales_paisa - net_cogs_paisa;

  // Expenses
  const expRows = await fetchAllRows<{
    type: string; category: string; amount_paisa: number; include_in_pnl: boolean;
  }>(
    () => supabase
      .from('expenses')
      .select('type, category, amount_paisa, include_in_pnl')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .gte('expense_date', range.from)
      .lte('expense_date', range.to)
      .order('expense_date'),
    'P&L (expenses)',
  );

  const opex_paisa = (expRows ?? [])
    .filter((e) => e.type === 'business')
    .reduce((s, e) => s + Number(e.amount_paisa), 0);

  // Home expenses: include only if global setting allows AND row's include_in_pnl is true
  const home_exp_paisa = (expRows ?? [])
    .filter((e) => e.type === 'home')
    .reduce((s, e) => s + Number(e.amount_paisa), 0);

  const total_exp_paisa = opex_paisa + (includeHome ? home_exp_paisa : 0);
  const net_profit_paisa = gross_profit_paisa - total_exp_paisa;

  // Category breakdown
  const catMap = new Map<string, { type: 'business' | 'home'; total_paisa: number }>();
  for (const e of expRows ?? []) {
    const key = `${e.type}::${e.category}`;
    const v = catMap.get(key) ?? { type: e.type as 'business' | 'home', total_paisa: 0 };
    v.total_paisa += Number(e.amount_paisa);
    catMap.set(key, v);
  }
  const expenses_by_category = Array.from(catMap.entries())
    .map(([key, v]) => ({ category: key.split('::')[1], type: v.type, total_paisa: v.total_paisa }))
    .sort((a, b) => b.total_paisa - a.total_paisa);

  return {
    range,
    business_id: businessId,
    business_name: biz?.name ?? '—',
    sales_paisa,
    returns_paisa,
    net_sales_paisa,
    cogs_paisa,
    cogs_returns_paisa,
    net_cogs_paisa,
    gross_profit_paisa,
    opex_paisa,
    home_exp_paisa,
    total_exp_paisa,
    net_profit_paisa,
    include_home_in_pnl: includeHome,
    expenses_by_category,
  };
}

// ───────────────────────────────────────────────
// 6. DEFAULTERS
// ───────────────────────────────────────────────
export type DefaultersData = {
  defaulter_days: number;
  rows: Array<{
    customer_name: string;
    phone: string | null;
    balance_paisa: number;
    last_activity: string | null;
    days_inactive: number;
  }>;
};

export async function fetchDefaultersData(): Promise<DefaultersData> {
  const supabase = await createServerClient();
  const businessId = await getActiveBusinessId();
  const days = await getSetting(SETTING_KEYS.defaulter_days, SETTING_DEFAULTS.defaulter_days);

  const [custRows, ledRows] = await Promise.all([
    fetchAllRows<{ id: string; name: string; phone: string | null; opening_balance_paisa: number }>(
      () => supabase.from('customers').select('id, name, phone, opening_balance_paisa')
        .eq('business_id', businessId).is('deleted_at', null).order('name'),
      'Defaulters (customers)',
    ),
    fetchAllRows<{ customer_id: string; debit_paisa: number; credit_paisa: number; entry_date: string }>(
      () => supabase.from('ledger_entries').select('customer_id, debit_paisa, credit_paisa, entry_date')
        .eq('business_id', businessId).order('entry_date'),
      'Defaulters (ledger)',
    ),
  ]);
  const custRes = { data: custRows, error: null };
  const ledRes = { data: ledRows, error: null };
  const today = new Date();
  const acc = new Map<string, { delta: number; lastDate: string | null }>();
  for (const e of ledRes.data ?? []) {
    const a = acc.get(e.customer_id) ?? { delta: 0, lastDate: null };
    a.delta += Number(e.debit_paisa) - Number(e.credit_paisa);
    if (!a.lastDate || e.entry_date > a.lastDate) a.lastDate = e.entry_date;
    acc.set(e.customer_id, a);
  }
  const rows: DefaultersData['rows'] = [];
  for (const c of custRes.data ?? []) {
    const a = acc.get(c.id);
    const balance = Number(c.opening_balance_paisa) + (a?.delta ?? 0);
    if (balance <= 0) continue;
    const inactive = a?.lastDate
      ? Math.floor((today.getTime() - new Date(a.lastDate).getTime()) / (1000 * 60 * 60 * 24))
      : 9999;
    if (inactive < days) continue;
    rows.push({ customer_name: c.name, phone: c.phone, balance_paisa: balance, last_activity: a?.lastDate ?? null, days_inactive: inactive });
  }
  rows.sort((a, b) => b.days_inactive - a.days_inactive);
  return { defaulter_days: days, rows };
}

// ───────────────────────────────────────────────
// 7. STOCK
// ───────────────────────────────────────────────
export type StockData = {
  rows: Array<{
    product_name: string;
    sku: string | null;
    unit: string;
    quantity_on_hand: number;
    sale_price_paisa: number;
    purchase_price_paisa: number | null;
    value_at_cost_paisa: number;
    is_low: boolean;
  }>;
  total_value_paisa: number;
};

export async function fetchStockData(): Promise<StockData> {
  const supabase = await createServerClient();
  const businessId = await getActiveBusinessId();

  const [prodRows, stockRows] = await Promise.all([
    fetchAllRows<{
      id: string; name: string; sku: string | null; unit: string;
      sale_price_paisa: number; purchase_price_paisa: number | null;
      low_stock_threshold: number | null;
    }>(
      () => supabase.from('products_for_role')
        .select('id, name, sku, unit, sale_price_paisa, purchase_price_paisa, low_stock_threshold')
        .eq('business_id', businessId).eq('is_active', true).order('name'),
      'Stock report (products)',
    ),
    fetchAllRows<{ product_id: string; quantity_on_hand: number }>(
      () => supabase.from('current_stock').select('product_id, quantity_on_hand')
        .eq('business_id', businessId).order('product_id'),
      'Stock report (stock)',
    ),
  ]);
  const stockMap = new Map<string, number>(
    stockRows.map((s) => [s.product_id, Number(s.quantity_on_hand)]),
  );
  const rows = prodRows.map((p) => {
    const qty = stockMap.get(p.id) ?? 0;
    const cost = p.purchase_price_paisa != null ? Number(p.purchase_price_paisa) : null;
    return {
      product_name: p.name,
      sku: p.sku,
      unit: p.unit,
      quantity_on_hand: qty,
      sale_price_paisa: Number(p.sale_price_paisa),
      purchase_price_paisa: cost,
      value_at_cost_paisa: cost != null ? Math.round(qty * cost) : 0,
      is_low: p.low_stock_threshold != null && qty <= Number(p.low_stock_threshold),
    };
  });
  const total_value_paisa = rows.reduce((s, r) => s + r.value_at_cost_paisa, 0);
  return { rows, total_value_paisa };
}

// ───────────────────────────────────────────────
// 8. CASH BOOK
// ───────────────────────────────────────────────
export type CashBookData = {
  entries: Array<{ kind: 'in' | 'out'; date: string; description: string; amount_paisa: number }>;
  total_in_paisa: number;
  total_out_paisa: number;
  closing_paisa: number;
};

export async function fetchCashBookData(range: DateRange): Promise<CashBookData> {
  const supabase = await createServerClient();
  const businessId = await getActiveBusinessId();

  const [payRows, expRows] = await Promise.all([
    fetchAllRows<Record<string, unknown>>(
      () => supabase.from('payments')
        .select('payment_date, amount_paisa, reference, customers(name)')
        .eq('business_id', businessId).is('deleted_at', null).eq('method', 'cash')
        .gte('payment_date', range.from).lte('payment_date', range.to)
        .order('payment_date'),
      'Cash book (receipts)',
    ),
    fetchAllRows<{ expense_date: string; amount_paisa: number; category: string; description: string | null }>(
      () => supabase.from('expenses')
        .select('expense_date, amount_paisa, category, description')
        .eq('business_id', businessId).is('deleted_at', null)
        .gte('expense_date', range.from).lte('expense_date', range.to)
        .order('expense_date'),
      'Cash book (payments out)',
    ),
  ]);
  const paysRes = { data: payRows };
  const expRes = { data: expRows };

  type RawCust = { name: string };
  type RawPay = { payment_date: string; amount_paisa: number; reference: string | null; customers: RawCust | RawCust[] | null };
  const ins = (paysRes.data as unknown as RawPay[] | null ?? []).map((p) => {
    const c = Array.isArray(p.customers) ? p.customers[0] : p.customers;
    return {
      kind: 'in' as const,
      date: p.payment_date,
      description: `${c?.name ?? '—'}${p.reference ? ` · ${p.reference}` : ''}`,
      amount_paisa: Number(p.amount_paisa),
    };
  });
  const outs = (expRes.data ?? []).map((e) => ({
    kind: 'out' as const,
    date: e.expense_date,
    description: `${e.category}${e.description ? ` · ${e.description}` : ''}`,
    amount_paisa: Number(e.amount_paisa),
  }));
  const all = [...ins, ...outs].sort((a, b) => a.date.localeCompare(b.date));
  const total_in_paisa = ins.reduce((s, e) => s + e.amount_paisa, 0);
  const total_out_paisa = outs.reduce((s, e) => s + e.amount_paisa, 0);
  return { entries: all, total_in_paisa, total_out_paisa, closing_paisa: total_in_paisa - total_out_paisa };
}

// ───────────────────────────────────────────────
// 9. AUDIT LOG
// ───────────────────────────────────────────────
export type AuditFilters = {
  from: string; to: string;
  table?: string;
  action?: 'INSERT' | 'UPDATE' | 'DELETE';
  userId?: string;
};

export type AuditData = {
  rows: Array<{
    at: string;
    user_email: string | null;
    table_name: string;
    row_id: string;
    action: 'INSERT' | 'UPDATE' | 'DELETE';
    before_jsonb: unknown;
    after_jsonb: unknown;
  }>;
};

export async function fetchAuditData(filters: AuditFilters): Promise<AuditData> {
  const supabase = await createServerClient();
  // Was capped at 500 with no indication in the file that anything was left
  // out. Now paged, so an audit export covers the range it claims to.
  const build = () => {
    let q = supabase
      .from('audit_log')
      .select('at, table_name, row_id, action, before_jsonb, after_jsonb, users(email)')
      .gte('at', filters.from)
      .lte('at', `${filters.to}T23:59:59`)
      .order('at', { ascending: false });
    if (filters.table) q = q.eq('table_name', filters.table);
    if (filters.action) q = q.eq('action', filters.action);
    if (filters.userId) q = q.eq('user_id', filters.userId);
    return q;
  };
  const data = await fetchAllRows<Record<string, unknown>>(build, 'Audit report');

  type RawUser = { email: string };
  type Raw = {
    at: string; table_name: string; row_id: string;
    action: 'INSERT' | 'UPDATE' | 'DELETE';
    before_jsonb: unknown; after_jsonb: unknown;
    users: RawUser | RawUser[] | null;
  };

  const rows = (data as unknown as Raw[]).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      at: r.at,
      user_email: u?.email ?? null,
      table_name: r.table_name,
      row_id: r.row_id,
      action: r.action,
      before_jsonb: r.before_jsonb,
      after_jsonb: r.after_jsonb,
    };
  });
  return { rows };
}

// ───────────────────────────────────────────────
// LOCATION — per-city rollup + per-city customer breakdown
// ───────────────────────────────────────────────
export type LocationReportRow = {
  location_id: string | null; // null = the Unassigned bucket
  location_name: string;
  customer_count: number;
  /** Invoice debits inside the date range. */
  sales_paisa: number;
  /** Payment credits inside the date range. */
  paid_paisa: number;
  /** Sum of positive CURRENT balances — all-time, not range-bound. */
  outstanding_paisa: number;
  /** paid / sales inside the range; null when there were no sales. */
  collection_pct: number | null;
};

export type LocationCustomerBreakdownRow = {
  customer_name: string;
  phone: string | null;
  sales_paisa: number;
  paid_paisa: number;
  balance_paisa: number;
};

export type LocationReportData = {
  rows: LocationReportRow[];
  breakdown: Map<string | null, LocationCustomerBreakdownRow[]>;
  total_sales_paisa: number;
  total_paid_paisa: number;
  total_outstanding_paisa: number;
};

/**
 * Sales and Paid are filtered to the range; Outstanding is the customer's
 * live balance (opening + all entries) because "what do they owe me" has no
 * date range. Same ledger semantics as fetchCustomerReportData above.
 */
export async function fetchLocationReportData(range: DateRange): Promise<LocationReportData> {
  const supabase = await createServerClient();
  const businessId = await getActiveBusinessId();

  const [locRows, custRows, ledgerRows] = await Promise.all([
    fetchAllRows<{ id: string; name: string; sort_order: number }>(
      () => supabase.from('locations').select('id, name, sort_order')
        .eq('business_id', businessId).is('deleted_at', null)
        .order('sort_order').order('name'),
      'Location report (locations)',
    ),
    fetchAllRows<{
      id: string; name: string; phone: string | null;
      location_id: string | null; opening_balance_paisa: number;
    }>(
      () => supabase.from('customers').select('id, name, phone, location_id, opening_balance_paisa')
        .eq('business_id', businessId).is('deleted_at', null).order('name'),
      'Location report (customers)',
    ),
    fetchAllRows<{
      customer_id: string; ref_type: string;
      debit_paisa: number; credit_paisa: number; entry_date: string;
    }>(
      () => supabase.from('ledger_entries')
        .select('customer_id, ref_type, debit_paisa, credit_paisa, entry_date')
        .eq('business_id', businessId).order('entry_date'),
      'Location report (ledger)',
    ),
  ]);
  const locRes = { data: locRows };
  const custRes = { data: custRows };
  const ledgerRes = { data: ledgerRows };

  type Acc = { sales: number; paid: number; delta: number };
  const byCustomer = new Map<string, Acc>();
  for (const e of ledgerRes.data ?? []) {
    const a = byCustomer.get(e.customer_id) ?? { sales: 0, paid: 0, delta: 0 };
    a.delta += Number(e.debit_paisa) - Number(e.credit_paisa);
    const inRange = e.entry_date >= range.from && e.entry_date <= range.to;
    if (inRange && e.ref_type === 'invoice') a.sales += Number(e.debit_paisa);
    if (inRange && e.ref_type === 'payment') a.paid += Number(e.credit_paisa);
    byCustomer.set(e.customer_id, a);
  }

  const breakdown = new Map<string | null, LocationCustomerBreakdownRow[]>();
  type LocAcc = { count: number; sales: number; paid: number; outstanding: number };
  const byLocation = new Map<string | null, LocAcc>();

  for (const c of custRes.data ?? []) {
    const a = byCustomer.get(c.id);
    const balance = Number(c.opening_balance_paisa) + (a?.delta ?? 0);
    const key = (c.location_id as string | null) ?? null;

    const locAcc = byLocation.get(key) ?? { count: 0, sales: 0, paid: 0, outstanding: 0 };
    locAcc.count += 1;
    locAcc.sales += a?.sales ?? 0;
    locAcc.paid += a?.paid ?? 0;
    locAcc.outstanding += Math.max(balance, 0);
    byLocation.set(key, locAcc);

    const list = breakdown.get(key) ?? [];
    list.push({
      customer_name: c.name,
      phone: c.phone,
      sales_paisa: a?.sales ?? 0,
      paid_paisa: a?.paid ?? 0,
      balance_paisa: balance,
    });
    breakdown.set(key, list);
  }

  const toRow = (id: string | null, name: string): LocationReportRow => {
    const a = byLocation.get(id) ?? { count: 0, sales: 0, paid: 0, outstanding: 0 };
    return {
      location_id: id,
      location_name: name,
      customer_count: a.count,
      sales_paisa: a.sales,
      paid_paisa: a.paid,
      outstanding_paisa: a.outstanding,
      collection_pct: a.sales > 0 ? Math.round((a.paid / a.sales) * 100) : null,
    };
  };

  const rows = (locRes.data ?? []).map((l) => toRow(l.id, l.name));
  // The Unassigned bucket appears only when it has customers.
  if (byLocation.has(null)) rows.push(toRow(null, 'Unassigned'));

  return {
    rows,
    breakdown,
    total_sales_paisa: rows.reduce((s, r) => s + r.sales_paisa, 0),
    total_paid_paisa: rows.reduce((s, r) => s + r.paid_paisa, 0),
    total_outstanding_paisa: rows.reduce((s, r) => s + r.outstanding_paisa, 0),
  };
}

// ───────────────────────────────────────────────
// Report identity: who produced this document, for whom, and when.
// Every PDF header needs it, so it is fetched once here rather than
// reassembled per report.
// ───────────────────────────────────────────────
export type ReportIdentity = {
  company: { name: string; address: string | null; phone: string | null; ntn: string | null };
  generatedAt: string;
  generatedBy: string;
};

export async function fetchReportIdentity(): Promise<ReportIdentity> {
  const supabase = await createServerClient();
  const businessId = await getActiveBusinessId();

  const [bizRes, address, phone, ntn, session] = await Promise.all([
    supabase.from('businesses').select('name').eq('id', businessId).single(),
    getSetting(SETTING_KEYS.business_address, SETTING_DEFAULTS.business_address),
    getSetting(SETTING_KEYS.business_phone, SETTING_DEFAULTS.business_phone),
    // Optional: businesses without a tax number simply omit the line.
    getSetting('business_ntn', ''),
    getSession(),
  ]);

  return {
    company: {
      name: (bizRes.data as { name: string } | null)?.name ?? 'Business',
      address: address || null,
      phone: phone || null,
      ntn: ntn || null,
    },
    generatedAt: formatKarachi(new Date(), 'dd MMM yyyy, hh:mm a'),
    generatedBy: session?.full_name || session?.email || 'Unknown user',
  };
}
