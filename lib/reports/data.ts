// Server-side data fetchers for report exports.
// These use the auth-context Supabase server client (RLS applies),
// so they can be called from server actions safely.

import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSetting, SETTING_KEYS, SETTING_DEFAULTS } from '@/lib/settings';
import type { DateRange } from '@/components/reports/shared';

export type SalesData = {
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

export async function fetchSalesData(range: DateRange): Promise<SalesData> {
  const supabase = await createServerClient();
  const businessId = await getActiveBusinessId();

  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_number, issue_date, total_paisa, paid_paisa, customers(name)')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .neq('status', 'draft')
    .neq('status', 'cancelled')
    .gte('issue_date', range.from)
    .lte('issue_date', range.to)
    .order('issue_date');
  if (error) throw error;

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

  return { rows, total_paisa, by_day, top_customers };
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

  const { data, error } = await supabase
    .from('stock_movements')
    .select('quantity, note, created_at, products(name, sku, unit, purchase_price_paisa)')
    .eq('business_id', businessId)
    .eq('type', 'in')
    .gte('created_at', range.from)
    .lte('created_at', `${range.to}T23:59:59`)
    .order('created_at', { ascending: false });
  if (error) throw error;

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

  const [custRes, ledgerRes] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, phone, opening_balance_paisa')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('ledger_entries')
      .select('customer_id, ref_type, debit_paisa, credit_paisa, entry_date')
      .eq('business_id', businessId),
  ]);
  if (custRes.error) throw custRes.error;
  if (ledgerRes.error) throw ledgerRes.error;

  const map = new Map<string, { invoiced: number; paid: number; deltaSum: number; lastDate: string | null }>();
  for (const e of ledgerRes.data ?? []) {
    const a = map.get(e.customer_id) ?? { invoiced: 0, paid: 0, deltaSum: 0, lastDate: null };
    a.deltaSum += Number(e.debit_paisa) - Number(e.credit_paisa);
    if (e.ref_type === 'invoice') a.invoiced += Number(e.debit_paisa);
    if (e.ref_type === 'payment') a.paid += Number(e.credit_paisa);
    if (!a.lastDate || e.entry_date > a.lastDate) a.lastDate = e.entry_date;
    map.set(e.customer_id, a);
  }

  const rows = (custRes.data ?? []).map((c) => {
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
  const { data: invoiceRows, error: invErr } = await supabase
    .from('invoices')
    .select('id, total_paisa')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .neq('status', 'draft')
    .neq('status', 'cancelled')
    .gte('issue_date', range.from)
    .lte('issue_date', range.to);
  if (invErr) throw invErr;
  const sales_paisa = (invoiceRows ?? []).reduce((s, r) => s + Number(r.total_paisa), 0);
  const invoiceIdsInRange = new Set((invoiceRows ?? []).map((r) => r.id));

  // Returns = Σ returns.total_paisa in range
  const { data: returnRows, error: retErr } = await supabase
    .from('returns')
    .select('id, total_paisa')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .gte('return_date', range.from)
    .lte('return_date', range.to);
  if (retErr) throw retErr;
  const returns_paisa = (returnRows ?? []).reduce((s, r) => s + Number(r.total_paisa), 0);
  const returnIdsInRange = new Set((returnRows ?? []).map((r) => r.id));

  // COGS for sales: Σ over invoice_items in those invoices: qty * purchase_price_at_sale_paisa
  let cogs_paisa = 0;
  if (invoiceIdsInRange.size > 0) {
    const { data: itemRows, error: itErr } = await supabase
      .from('invoice_items')
      .select('invoice_id, quantity, purchase_price_at_sale_paisa')
      .in('invoice_id', Array.from(invoiceIdsInRange));
    if (itErr) throw itErr;
    for (const it of itemRows ?? []) {
      cogs_paisa += Math.round(Number(it.quantity) * Number(it.purchase_price_at_sale_paisa));
    }
  }

  // COGS reversal for returns: lookup via return_items joined to invoice_items
  let cogs_returns_paisa = 0;
  if (returnIdsInRange.size > 0) {
    const { data: retItems, error: rItErr } = await supabase
      .from('return_items')
      .select('return_id, quantity, invoice_item_id, invoice_items!inner(purchase_price_at_sale_paisa)')
      .in('return_id', Array.from(returnIdsInRange));
    if (rItErr) throw rItErr;
    type RawInvItem = { purchase_price_at_sale_paisa: number };
    type RawRet = { return_id: string; quantity: number; invoice_item_id: string; invoice_items: RawInvItem | RawInvItem[] };
    for (const ri of (retItems as unknown as RawRet[]) ?? []) {
      const ii = Array.isArray(ri.invoice_items) ? ri.invoice_items[0] : ri.invoice_items;
      cogs_returns_paisa += Math.round(Number(ri.quantity) * Number(ii?.purchase_price_at_sale_paisa ?? 0));
    }
  }

  const net_sales_paisa = sales_paisa - returns_paisa;
  const net_cogs_paisa = cogs_paisa - cogs_returns_paisa;
  const gross_profit_paisa = net_sales_paisa - net_cogs_paisa;

  // Expenses
  const { data: expRows, error: expErr } = await supabase
    .from('expenses')
    .select('type, category, amount_paisa, include_in_pnl')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .gte('expense_date', range.from)
    .lte('expense_date', range.to);
  if (expErr) throw expErr;

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

  const [custRes, ledRes] = await Promise.all([
    supabase.from('customers').select('id, name, phone, opening_balance_paisa').eq('business_id', businessId).is('deleted_at', null),
    supabase.from('ledger_entries').select('customer_id, debit_paisa, credit_paisa, entry_date').eq('business_id', businessId),
  ]);
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

  const [prodRes, stockRes] = await Promise.all([
    supabase.from('products_for_role')
      .select('id, name, sku, unit, sale_price_paisa, purchase_price_paisa, low_stock_threshold')
      .eq('business_id', businessId).eq('is_active', true).order('name'),
    supabase.from('current_stock').select('product_id, quantity_on_hand').eq('business_id', businessId),
  ]);
  const stockMap = new Map<string, number>(
    (stockRes.data ?? []).map((s) => [s.product_id, Number(s.quantity_on_hand)]),
  );
  const rows = (prodRes.data ?? []).map((p) => {
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

  const [paysRes, expRes] = await Promise.all([
    supabase.from('payments')
      .select('payment_date, amount_paisa, reference, customers(name)')
      .eq('business_id', businessId).is('deleted_at', null).eq('method', 'cash')
      .gte('payment_date', range.from).lte('payment_date', range.to),
    supabase.from('expenses')
      .select('expense_date, amount_paisa, category, description')
      .eq('business_id', businessId).is('deleted_at', null)
      .gte('expense_date', range.from).lte('expense_date', range.to),
  ]);

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
  let q = supabase
    .from('audit_log')
    .select('at, table_name, row_id, action, before_jsonb, after_jsonb, users(email)')
    .gte('at', filters.from)
    .lte('at', `${filters.to}T23:59:59`)
    .order('at', { ascending: false })
    .limit(500);
  if (filters.table) q = q.eq('table_name', filters.table);
  if (filters.action) q = q.eq('action', filters.action);
  if (filters.userId) q = q.eq('user_id', filters.userId);
  const { data, error } = await q;
  if (error) throw error;

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
