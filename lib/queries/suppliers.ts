'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';
import { deleteSupplier } from '@/lib/actions/suppliers';
import type { SupplierPaymentMethod } from '@/lib/validators/suppliers';

export type Supplier = {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
};

/**
 * Money fields are null when the current role may not see purchase prices —
 * supplier_balance_view returns NULL for staff and viewer (iron rule #3).
 * The UI must render "—" rather than assuming 0.
 */
export type SupplierBalance = {
  supplier_id: string;
  total_purchased_paisa: number | null;
  total_paid_paisa: number | null;
  balance_due_paisa: number | null;
};

export type StockPurchaseRow = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  product_unit: string;
  quantity: number;
  unit_price_paisa: number | null;
  total_paisa: number | null;
  purchase_date: string;
  notes: string | null;
  created_at: string;
};

export type SupplierPaymentRow = {
  id: string;
  supplier_id: string;
  amount_paisa: number;
  payment_date: string;
  payment_method: SupplierPaymentMethod | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
};

export type SupplierLedgerRow = {
  id: string;
  ref_type: 'purchase' | 'payment';
  ref_id: string;
  entry_date: string;
  created_at: string;
  description: string;
  debit_paisa: number;
  credit_paisa: number;
  running_balance: number;
};

/** BIGINT can arrive from PostgREST as number or string; null must stay null. */
function toMoney(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function useSuppliers() {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['suppliers', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, business_id, name, phone, address, notes, created_at')
        .eq('business_id', activeId!)
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
  });
}

/** Every supplier's balance in one round-trip, for the list page. */
export function useSupplierBalances() {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['supplier-balances', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('supplier_balance_view')
        .select('supplier_id, total_purchased_paisa, total_paid_paisa, balance_due_paisa')
        .eq('business_id', activeId!);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        supplier_id: r.supplier_id as string,
        total_purchased_paisa: toMoney(r.total_purchased_paisa),
        total_paid_paisa: toMoney(r.total_paid_paisa),
        balance_due_paisa: toMoney(r.balance_due_paisa),
      })) as SupplierBalance[];
    },
  });
}

export function useSupplierBalance(supplierId: string) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['supplier-balances', activeId, supplierId],
    enabled: !!activeId && !!supplierId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('supplier_balance_view')
        .select('supplier_id, total_purchased_paisa, total_paid_paisa, balance_due_paisa')
        .eq('supplier_id', supplierId)
        .eq('business_id', activeId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        supplier_id: data.supplier_id as string,
        total_purchased_paisa: toMoney(data.total_purchased_paisa),
        total_paid_paisa: toMoney(data.total_paid_paisa),
        balance_due_paisa: toMoney(data.balance_due_paisa),
      } as SupplierBalance;
    },
  });
}

/** Single supplier plus its balance summary. */
export function useSupplier(id: string) {
  const activeId = useBusinessStore((s) => s.activeId);
  const balance = useSupplierBalance(id);

  const supplier = useQuery({
    queryKey: ['suppliers', activeId, id],
    enabled: !!activeId && !!id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, business_id, name, phone, address, notes, created_at')
        .eq('id', id)
        .eq('business_id', activeId!)
        .is('deleted_at', null)
        .single();
      if (error) throw error;
      return data as Supplier;
    },
  });

  return {
    supplier: supplier.data ?? null,
    balance: balance.data ?? null,
    isLoading: supplier.isLoading || balance.isLoading,
    error: supplier.error ?? balance.error ?? null,
  };
}

/**
 * Purchases, newest first. Reads stock_purchases_for_role rather than the base
 * table so staff get rows with NULL money instead of a policy error.
 * Omitting supplierId lists every purchase in the business.
 */
export function useStockPurchases(supplierId?: string, productId?: string) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['stock-purchases', activeId, supplierId ?? null, productId ?? null],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from('stock_purchases_for_role')
        .select(
          'id, supplier_id, supplier_name, product_id, product_name, product_sku, product_unit, quantity, unit_price_paisa, total_paisa, purchase_date, notes, created_at',
        )
        .eq('business_id', activeId!)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (supplierId) q = q.eq('supplier_id', supplierId);
      if (productId) q = q.eq('product_id', productId);

      const { data, error } = await q;
      if (error) throw error;

      return (data ?? []).map((r) => ({
        ...r,
        quantity: Number(r.quantity),
        unit_price_paisa: toMoney(r.unit_price_paisa),
        total_paisa: toMoney(r.total_paisa),
      })) as StockPurchaseRow[];
    },
  });
}

export function useSupplierPayments(supplierId?: string) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['supplier-payments', activeId, supplierId ?? null],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from('supplier_payments')
        .select(
          'id, supplier_id, amount_paisa, payment_date, payment_method, reference, notes, created_at',
        )
        .eq('business_id', activeId!)
        .is('deleted_at', null)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (supplierId) q = q.eq('supplier_id', supplierId);

      const { data, error } = await q;
      if (error) throw error;

      return (data ?? []).map((r) => ({
        ...r,
        amount_paisa: Number(r.amount_paisa),
      })) as SupplierPaymentRow[];
    },
  });
}

/**
 * Combined purchase/payment ledger with server-computed running balance.
 * The RPC refuses staff and viewer, so `enabled` must keep it unfetched for
 * them — callers pass canSeeMoney from the server-resolved role.
 */
export function useSupplierLedger(supplierId: string, enabled = true) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['supplier-ledger', activeId, supplierId],
    enabled: !!activeId && !!supplierId && enabled,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('supplier_ledger', {
        p_supplier_id: supplierId,
      });
      if (error) throw error;
      return ((data ?? []) as SupplierLedgerRow[]).map((r) => ({
        ...r,
        debit_paisa: Number(r.debit_paisa),
        credit_paisa: Number(r.credit_paisa),
        running_balance: Number(r.running_balance),
      })) as SupplierLedgerRow[];
    },
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);

  return useMutation({
    mutationFn: (id: string) => deleteSupplier(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', activeId] });
      queryClient.invalidateQueries({ queryKey: ['supplier-balances', activeId] });
    },
  });
}

/** Shared invalidation after a purchase or payment lands. */
export function useInvalidateSupplierData() {
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);

  return () => {
    for (const key of [
      'suppliers',
      'supplier-balances',
      'stock-purchases',
      'supplier-payments',
      'supplier-ledger',
      'products',
      'current-stock',
      'stock',
    ]) {
      queryClient.invalidateQueries({ queryKey: [key, activeId] });
    }
  };
}
