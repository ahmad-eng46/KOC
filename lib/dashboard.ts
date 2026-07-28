// Server-side data for the dashboard. Uses the auth-context Supabase client,
// so RLS scopes everything to the caller's businesses.

import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { todayKarachiISO } from '@/lib/date';

const COUNTED_STATUSES = ['issued', 'partially_paid', 'paid'] as const;

export type DashboardData = {
  today: string;
  today_sales_paisa: number;
  today_invoice_count: number;
  today_cash_paisa: number;
  today_payment_count: number;
  outstanding_paisa: number;
  outstanding_invoice_count: number;
  low_stock: Array<{
    product_id: string;
    name: string;
    sku: string | null;
    unit: string | null;
    quantity_on_hand: number;
    low_stock_threshold: number | null;
  }>;
  recent_invoices: Array<{
    id: string;
    invoice_number: string;
    issue_date: string;
    customer_name: string;
    total_paisa: number;
    paid_paisa: number;
    status: string;
  }>;
};

export async function fetchDashboardData(): Promise<DashboardData> {
  const supabase = await createServerClient();
  const businessId = await getActiveBusinessId();
  const today = todayKarachiISO();

  const [todayInvoicesRes, todayPaymentsRes, openInvoicesRes, stockRes, recentRes] =
    await Promise.all([
      supabase
        .from('invoices')
        .select('total_paisa')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .in('status', COUNTED_STATUSES)
        .eq('issue_date', today),
      supabase
        .from('payments')
        .select('amount_paisa')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .eq('payment_date', today),
      supabase
        .from('invoices')
        .select('total_paisa, paid_paisa')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .in('status', ['issued', 'partially_paid']),
      supabase
        .from('current_stock')
        .select('product_id, product_name, sku, unit, quantity_on_hand, low_stock_threshold')
        .eq('business_id', businessId),
      supabase
        .from('invoices')
        .select('id, invoice_number, issue_date, total_paisa, paid_paisa, status, customers(name)')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .neq('status', 'draft')
        .order('issue_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(8),
    ]);

  if (todayInvoicesRes.error) throw todayInvoicesRes.error;
  if (todayPaymentsRes.error) throw todayPaymentsRes.error;
  if (openInvoicesRes.error) throw openInvoicesRes.error;
  if (stockRes.error) throw stockRes.error;
  if (recentRes.error) throw recentRes.error;

  const todayInvoices = todayInvoicesRes.data ?? [];
  const todayPayments = todayPaymentsRes.data ?? [];
  const openInvoices = openInvoicesRes.data ?? [];

  // An invoice can be paid beyond its total (advance against the next order),
  // so clamp per row — otherwise one overpaid invoice would mask real debt.
  const outstanding_paisa = openInvoices.reduce(
    (sum, i) => sum + Math.max(Number(i.total_paisa) - Number(i.paid_paisa), 0),
    0,
  );

  type StockRow = {
    product_id: string;
    product_name: string;
    sku: string | null;
    unit: string | null;
    quantity_on_hand: number | string | null;
    low_stock_threshold: number | null;
  };

  const low_stock = ((stockRes.data ?? []) as StockRow[])
    .map((s) => ({
      product_id: s.product_id,
      name: s.product_name,
      sku: s.sku,
      unit: s.unit,
      quantity_on_hand: Number(s.quantity_on_hand ?? 0),
      low_stock_threshold: s.low_stock_threshold,
    }))
    .filter((s) => s.quantity_on_hand <= (s.low_stock_threshold ?? 0))
    .sort((a, b) => a.quantity_on_hand - b.quantity_on_hand);

  type RawCustomer = { name: string };
  type RawInvoice = {
    id: string;
    invoice_number: string;
    issue_date: string;
    total_paisa: number;
    paid_paisa: number;
    status: string;
    customers: RawCustomer | RawCustomer[] | null;
  };

  const recent_invoices = ((recentRes.data ?? []) as unknown as RawInvoice[]).map((r) => {
    const c = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    return {
      id: r.id,
      invoice_number: r.invoice_number,
      issue_date: r.issue_date,
      customer_name: c?.name ?? '—',
      total_paisa: Number(r.total_paisa),
      paid_paisa: Number(r.paid_paisa),
      status: r.status,
    };
  });

  return {
    today,
    today_sales_paisa: todayInvoices.reduce((s, i) => s + Number(i.total_paisa), 0),
    today_invoice_count: todayInvoices.length,
    today_cash_paisa: todayPayments.reduce((s, p) => s + Number(p.amount_paisa), 0),
    today_payment_count: todayPayments.length,
    outstanding_paisa,
    outstanding_invoice_count: openInvoices.length,
    low_stock,
    recent_invoices,
  };
}
