'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';
import type { DateRange } from '@/components/reports/shared';

// ───────────────────────────────────────────────
// 1. SALES — invoices grouped by day + top 10 customers
// ───────────────────────────────────────────────
export type SalesRow = {
  invoice_id: string;
  invoice_number: string;
  issue_date: string;
  customer_id: string;
  customer_name: string;
  total_paisa: number;
  paid_paisa: number;
};

export function useSalesData(range: DateRange) {
  const activeId = useBusinessStore((s) => s.activeId);
  return useQuery({
    queryKey: ['report-sales', activeId, range],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, issue_date, total_paisa, paid_paisa, customer_id, customers(name)')
        .eq('business_id', activeId!)
        .is('deleted_at', null)
        .neq('status', 'draft')
        .neq('status', 'cancelled')
        .gte('issue_date', range.from)
        .lte('issue_date', range.to)
        .order('issue_date');
      if (error) throw error;

      type RawCustomer = { name: string };
      type Raw = {
        id: string; invoice_number: string; issue_date: string;
        total_paisa: number; paid_paisa: number; customer_id: string;
        customers: RawCustomer | RawCustomer[] | null;
      };
      return (data as unknown as Raw[]).map((r) => {
        const c = Array.isArray(r.customers) ? r.customers[0] : r.customers;
        return {
          invoice_id: r.id,
          invoice_number: r.invoice_number,
          issue_date: r.issue_date,
          customer_id: r.customer_id,
          customer_name: c?.name ?? '—',
          total_paisa: Number(r.total_paisa),
          paid_paisa: Number(r.paid_paisa),
        } as SalesRow;
      });
    },
  });
}

// ───────────────────────────────────────────────
// 2. PURCHASE — stock_movements type='in'
// ───────────────────────────────────────────────
export type PurchaseRow = {
  id: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  unit: string;
  quantity: number;
  purchase_price_paisa: number; // current product purchase price (best available proxy)
  total_value_paisa: number;
  movement_date: string;
  note: string | null;
};

export function usePurchaseData(range: DateRange) {
  const activeId = useBusinessStore((s) => s.activeId);
  return useQuery({
    queryKey: ['report-purchase', activeId, range],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('stock_movements')
        .select('id, product_id, quantity, note, created_at, products(name, sku, unit, purchase_price_paisa)')
        .eq('business_id', activeId!)
        .eq('type', 'in')
        .gte('created_at', range.from)
        .lte('created_at', `${range.to}T23:59:59`)
        .order('created_at', { ascending: false });
      if (error) throw error;

      type RawProd = { name: string; sku: string | null; unit: string; purchase_price_paisa: number | null };
      type Raw = {
        id: string; product_id: string; quantity: number; note: string | null; created_at: string;
        products: RawProd | RawProd[] | null;
      };
      return (data as unknown as Raw[]).map((r) => {
        const p = Array.isArray(r.products) ? r.products[0] : r.products;
        const qty = Number(r.quantity);
        const price = Number(p?.purchase_price_paisa ?? 0);
        return {
          id: r.id,
          product_id: r.product_id,
          product_name: p?.name ?? '—',
          sku: p?.sku ?? null,
          unit: p?.unit ?? '',
          quantity: qty,
          purchase_price_paisa: price,
          total_value_paisa: Math.round(qty * price),
          movement_date: r.created_at.slice(0, 10),
          note: r.note,
        } as PurchaseRow;
      });
    },
  });
}

// ───────────────────────────────────────────────
// 3. CUSTOMER — totals per customer
// ───────────────────────────────────────────────
export type CustomerReportRow = {
  customer_id: string;
  customer_name: string;
  phone: string | null;
  invoiced_paisa: number;
  paid_paisa: number;
  balance_paisa: number;
  last_activity: string | null;
};

export function useCustomerReport() {
  const activeId = useBusinessStore((s) => s.activeId);
  return useQuery({
    queryKey: ['report-customer', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      // customer_balances_view (0042) — the same server-side balance the
      // customer ledger and the invoice PDF use. The old client-side
      // ledger sum returned zeros for staff/viewer under ledger RLS.
      const supabase = createClient();
      const { data, error } = await supabase
        .from('customer_balances_view')
        .select('customer_id, name, phone, current_balance_paisa, total_sales_paisa, total_paid_paisa, last_activity')
        .eq('business_id', activeId!)
        .order('name');
      if (error) throw error;

      return (data ?? []).map((r) => ({
        customer_id: r.customer_id as string,
        customer_name: r.name as string,
        phone: (r.phone as string | null) ?? null,
        invoiced_paisa: Number(r.total_sales_paisa ?? 0),
        paid_paisa: Number(r.total_paid_paisa ?? 0),
        balance_paisa: Number(r.current_balance_paisa ?? 0),
        last_activity: (r.last_activity as string | null) ?? null,
      })) as CustomerReportRow[];
    },
  });
}

// ───────────────────────────────────────────────
// 4. BALANCE / Receivables
// ───────────────────────────────────────────────
export type AgingBucket = '0-30' | '31-60' | '61-90' | '90+';

export type BalanceReportRow = {
  customer_id: string;
  customer_name: string;
  phone: string | null;
  balance_paisa: number;
  last_activity: string | null;
  days_inactive: number;
  bucket: AgingBucket;
};

export function useBalanceReport() {
  const result = useCustomerReport();
  const today = new Date();

  const rows = (result.data ?? [])
    .filter((r) => r.balance_paisa > 0)
    .map((r) => {
      const days = r.last_activity
        ? Math.floor((today.getTime() - new Date(r.last_activity).getTime()) / (1000 * 60 * 60 * 24))
        : 9999;
      const bucket: AgingBucket = days > 90 ? '90+' : days > 60 ? '61-90' : days > 30 ? '31-60' : '0-30';
      return {
        customer_id: r.customer_id,
        customer_name: r.customer_name,
        phone: r.phone,
        balance_paisa: r.balance_paisa,
        last_activity: r.last_activity,
        days_inactive: days,
        bucket,
      };
    });

  return { ...result, balanceRows: rows };
}

// ───────────────────────────────────────────────
// 5. P&L
// ───────────────────────────────────────────────
export type PLRow = {
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

export function usePLReport(range: DateRange) {
  const activeId = useBusinessStore((s) => s.activeId);
  return useQuery({
    queryKey: ['report-pl', activeId, range],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();

      // Settings + business name
      const [bizRes, settingsRes] = await Promise.all([
        supabase.from('businesses').select('name').eq('id', activeId!).single(),
        supabase.from('app_settings').select('value').eq('business_id', activeId!).eq('key', 'home_expense_in_pnl').maybeSingle(),
      ]);
      const businessName = bizRes.data?.name ?? '—';
      const includeHome = settingsRes.data?.value === 'true';

      // Sales (invoices in range)
      const { data: invoices, error: invErr } = await supabase
        .from('invoices')
        .select('id, total_paisa')
        .eq('business_id', activeId!)
        .is('deleted_at', null)
        .neq('status', 'draft')
        .neq('status', 'cancelled')
        .gte('issue_date', range.from)
        .lte('issue_date', range.to);
      if (invErr) throw invErr;
      const sales = (invoices ?? []).reduce((s, r) => s + Number(r.total_paisa), 0);
      const invoiceIds = (invoices ?? []).map((r) => r.id);

      // Returns
      const { data: returns, error: retErr } = await supabase
        .from('returns')
        .select('id, total_paisa')
        .eq('business_id', activeId!)
        .is('deleted_at', null)
        .gte('return_date', range.from)
        .lte('return_date', range.to);
      if (retErr) throw retErr;
      const returnsTotal = (returns ?? []).reduce((s, r) => s + Number(r.total_paisa), 0);
      const returnIds = (returns ?? []).map((r) => r.id);

      // COGS
      let cogs = 0;
      if (invoiceIds.length > 0) {
        const { data: items, error: itErr } = await supabase
          .from('invoice_items')
          .select('quantity, purchase_price_at_sale_paisa')
          .in('invoice_id', invoiceIds);
        if (itErr) throw itErr;
        for (const it of items ?? []) cogs += Math.round(Number(it.quantity) * Number(it.purchase_price_at_sale_paisa));
      }

      // COGS reversal for returns
      let cogsRet = 0;
      if (returnIds.length > 0) {
        const { data: retItems, error: rIErr } = await supabase
          .from('return_items')
          .select('quantity, invoice_items!inner(purchase_price_at_sale_paisa)')
          .in('return_id', returnIds);
        if (rIErr) throw rIErr;
        type RawII = { purchase_price_at_sale_paisa: number };
        type RawRI = { quantity: number; invoice_items: RawII | RawII[] };
        for (const ri of (retItems as unknown as RawRI[]) ?? []) {
          const ii = Array.isArray(ri.invoice_items) ? ri.invoice_items[0] : ri.invoice_items;
          cogsRet += Math.round(Number(ri.quantity) * Number(ii?.purchase_price_at_sale_paisa ?? 0));
        }
      }

      // Expenses
      const { data: exps, error: expErr } = await supabase
        .from('expenses')
        .select('type, category, amount_paisa')
        .eq('business_id', activeId!)
        .is('deleted_at', null)
        .gte('expense_date', range.from)
        .lte('expense_date', range.to);
      if (expErr) throw expErr;
      const opex = (exps ?? []).filter((e) => e.type === 'business').reduce((s, e) => s + Number(e.amount_paisa), 0);
      const homeExp = (exps ?? []).filter((e) => e.type === 'home').reduce((s, e) => s + Number(e.amount_paisa), 0);
      const totalExp = opex + (includeHome ? homeExp : 0);

      const netSales = sales - returnsTotal;
      const netCogs = cogs - cogsRet;
      const grossProfit = netSales - netCogs;
      const netProfit = grossProfit - totalExp;

      const catMap = new Map<string, { type: 'business' | 'home'; total_paisa: number }>();
      for (const e of exps ?? []) {
        const key = `${e.type}::${e.category}`;
        const v = catMap.get(key) ?? { type: e.type as 'business' | 'home', total_paisa: 0 };
        v.total_paisa += Number(e.amount_paisa);
        catMap.set(key, v);
      }
      const expenses_by_category = Array.from(catMap.entries())
        .map(([k, v]) => ({ category: k.split('::')[1], type: v.type, total_paisa: v.total_paisa }))
        .sort((a, b) => b.total_paisa - a.total_paisa);

      return {
        range,
        business_id: activeId!,
        business_name: businessName,
        sales_paisa: sales,
        returns_paisa: returnsTotal,
        net_sales_paisa: netSales,
        cogs_paisa: cogs,
        cogs_returns_paisa: cogsRet,
        net_cogs_paisa: netCogs,
        gross_profit_paisa: grossProfit,
        opex_paisa: opex,
        home_exp_paisa: homeExp,
        total_exp_paisa: totalExp,
        net_profit_paisa: netProfit,
        include_home_in_pnl: includeHome,
        expenses_by_category,
      } as PLRow;
    },
  });
}

// ───────────────────────────────────────────────
// 6. DEFAULTERS — customers with balance > 0 AND inactive > defaulter_days
// ───────────────────────────────────────────────
export type DefaulterRow = {
  customer_id: string;
  customer_name: string;
  phone: string | null;
  balance_paisa: number;
  last_activity: string | null;
  days_inactive: number;
};

export function useDefaulters() {
  const activeId = useBusinessStore((s) => s.activeId);
  return useQuery({
    queryKey: ['report-defaulters', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      // Same view as useCustomerReport / the invoice PDF — one balance
      // definition everywhere, or the owner sees different numbers in
      // different screens and trusts none of them.
      const supabase = createClient();
      const [setRes, balRes] = await Promise.all([
        supabase.from('app_settings').select('value').eq('business_id', activeId!).eq('key', 'defaulter_days').maybeSingle(),
        supabase
          .from('customer_balances_view')
          .select('customer_id, name, phone, current_balance_paisa, last_activity')
          .eq('business_id', activeId!),
      ]);
      if (balRes.error) throw balRes.error;

      const days = Number(setRes.data?.value ?? 20);
      const today = new Date();

      const rows: DefaulterRow[] = [];
      for (const c of balRes.data ?? []) {
        const balance = Number(c.current_balance_paisa ?? 0);
        if (balance <= 0) continue;
        const lastDate = (c.last_activity as string | null) ?? null;
        const inactive = lastDate
          ? Math.floor((today.getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
          : 9999;
        if (inactive < days) continue;
        rows.push({
          customer_id: c.customer_id as string,
          customer_name: c.name as string,
          phone: (c.phone as string | null) ?? null,
          balance_paisa: balance,
          last_activity: lastDate,
          days_inactive: inactive,
        });
      }

      rows.sort((a, b) => b.days_inactive - a.days_inactive);
      return { rows, defaulter_days: days };
    },
  });
}

// ───────────────────────────────────────────────
// 7. STOCK — current quantity per product + value at purchase price
// ───────────────────────────────────────────────
export type StockReportRow = {
  product_id: string;
  product_name: string;
  sku: string | null;
  unit: string;
  quantity_on_hand: number;
  purchase_price_paisa: number | null;
  sale_price_paisa: number;
  value_at_cost_paisa: number; // null if cost not visible to user
  low_stock_threshold: number | null;
  is_low: boolean;
};

export function useStockReport() {
  const activeId = useBusinessStore((s) => s.activeId);
  return useQuery({
    queryKey: ['report-stock', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      const [prodRes, stockRes] = await Promise.all([
        supabase.from('products_for_role')
          .select('id, name, sku, unit, sale_price_paisa, purchase_price_paisa, low_stock_threshold')
          .eq('business_id', activeId!)
          .eq('is_active', true)
          .order('name'),
        supabase.from('current_stock').select('product_id, quantity_on_hand').eq('business_id', activeId!),
      ]);
      if (prodRes.error) throw prodRes.error;
      if (stockRes.error) throw stockRes.error;

      const stockMap = new Map<string, number>(
        (stockRes.data ?? []).map((s) => [s.product_id, Number(s.quantity_on_hand)]),
      );

      return (prodRes.data ?? []).map((p) => {
        const qty = stockMap.get(p.id) ?? 0;
        const cost = p.purchase_price_paisa != null ? Number(p.purchase_price_paisa) : null;
        const value = cost != null ? Math.round(qty * cost) : 0;
        const isLow = p.low_stock_threshold != null && qty <= Number(p.low_stock_threshold);
        return {
          product_id: p.id,
          product_name: p.name,
          sku: p.sku,
          unit: p.unit,
          quantity_on_hand: qty,
          purchase_price_paisa: cost,
          sale_price_paisa: Number(p.sale_price_paisa),
          value_at_cost_paisa: value,
          low_stock_threshold: p.low_stock_threshold != null ? Number(p.low_stock_threshold) : null,
          is_low: isLow,
        } as StockReportRow;
      });
    },
  });
}

// ───────────────────────────────────────────────
// 8. DAILY CASH BOOK
// ───────────────────────────────────────────────
export type CashEntry = {
  id: string;
  kind: 'in' | 'out';
  date: string;
  description: string;
  amount_paisa: number;
};

export function useCashBook(range: DateRange) {
  const activeId = useBusinessStore((s) => s.activeId);
  return useQuery({
    queryKey: ['report-cashbook', activeId, range],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      const [paysRes, expRes] = await Promise.all([
        supabase.from('payments')
          .select('id, payment_date, amount_paisa, reference, customers(name)')
          .eq('business_id', activeId!).is('deleted_at', null).eq('method', 'cash')
          .gte('payment_date', range.from).lte('payment_date', range.to),
        supabase.from('expenses')
          .select('id, expense_date, amount_paisa, category, description')
          .eq('business_id', activeId!).is('deleted_at', null)
          .gte('expense_date', range.from).lte('expense_date', range.to),
      ]);
      if (paysRes.error) throw paysRes.error;
      if (expRes.error) throw expRes.error;

      type RawCust = { name: string };
      type RawPay = {
        id: string; payment_date: string; amount_paisa: number;
        reference: string | null; customers: RawCust | RawCust[] | null;
      };

      const ins: CashEntry[] = (paysRes.data as unknown as RawPay[]).map((p) => {
        const c = Array.isArray(p.customers) ? p.customers[0] : p.customers;
        return {
          id: `pay-${p.id}`,
          kind: 'in' as const,
          date: p.payment_date,
          description: `${c?.name ?? '—'}${p.reference ? ` · ${p.reference}` : ''}`,
          amount_paisa: Number(p.amount_paisa),
        };
      });

      const outs: CashEntry[] = (expRes.data ?? []).map((e) => ({
        id: `exp-${e.id}`,
        kind: 'out' as const,
        date: e.expense_date,
        description: `${e.category}${e.description ? ` · ${e.description}` : ''}`,
        amount_paisa: Number(e.amount_paisa),
      }));

      const all = [...ins, ...outs].sort((a, b) => a.date.localeCompare(b.date));
      const totalIn = ins.reduce((s, e) => s + e.amount_paisa, 0);
      const totalOut = outs.reduce((s, e) => s + e.amount_paisa, 0);
      return {
        entries: all,
        total_in_paisa: totalIn,
        total_out_paisa: totalOut,
        closing_paisa: totalIn - totalOut,
      };
    },
  });
}

// ───────────────────────────────────────────────
// 9. AUDIT LOG (admin only)
// ───────────────────────────────────────────────
export type AuditRow = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  table_name: string;
  row_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  before_jsonb: unknown;
  after_jsonb: unknown;
  at: string;
};

export type AuditFilters = {
  from: string;
  to: string;
  table?: string;
  action?: 'INSERT' | 'UPDATE' | 'DELETE';
  userId?: string;
};

export function useAuditLog(filters: AuditFilters) {
  const activeId = useBusinessStore((s) => s.activeId);
  return useQuery({
    queryKey: ['report-audit', activeId, filters],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from('audit_log')
        .select('id, user_id, table_name, row_id, action, before_jsonb, after_jsonb, at, users(email)')
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
      type Raw = Omit<AuditRow, 'user_email'> & { users: RawUser | RawUser[] | null };

      return (data as unknown as Raw[]).map((r) => {
        const u = Array.isArray(r.users) ? r.users[0] : r.users;
        return { ...r, user_email: u?.email ?? null } as AuditRow;
      });
    },
  });
}
