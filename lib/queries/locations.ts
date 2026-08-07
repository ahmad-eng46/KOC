'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';
import type { BalanceFilter } from '@/lib/validators/locations';

export type LocationSummary = {
  location_id: string;
  location_name: string;
  short_code: string | null;
  sort_order: number;
  is_active: boolean;
  customer_count: number;
  customers_with_dues: number;
  /** Sum of POSITIVE balances only — what is collectable in this city. */
  total_outstanding_paisa: number;
  total_sales_paisa: number;
  total_paid_paisa: number;
};

export type CustomerBalanceRow = {
  customer_id: string;
  location_id: string | null;
  name: string;
  phone: string | null;
  is_defaulter: boolean;
  current_balance_paisa: number;
  total_sales_paisa: number;
  total_paid_paisa: number;
  last_activity: string | null;
};

export type CustomerLocationFilters = {
  balance: BalanceFilter;
  /** Rupee-range bounds, already converted to paisa. */
  minBalancePaisa?: number;
  maxBalancePaisa?: number;
  search: string;
  sort: 'name' | 'balance_desc' | 'balance_asc' | 'recent';
};

function mapBalanceRow(r: Record<string, unknown>): CustomerBalanceRow {
  return {
    customer_id: r.customer_id as string,
    location_id: (r.location_id as string | null) ?? null,
    name: r.name as string,
    phone: (r.phone as string | null) ?? null,
    is_defaulter: Boolean(r.is_defaulter),
    current_balance_paisa: Number(r.current_balance_paisa ?? 0),
    total_sales_paisa: Number(r.total_sales_paisa ?? 0),
    total_paid_paisa: Number(r.total_paid_paisa ?? 0),
    last_activity: (r.last_activity as string | null) ?? null,
  };
}

/** Every active location with its summary stats, in route (sort_order) order. */
export function useLocations() {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['locations', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('location_summary_view')
        .select('*')
        .eq('business_id', activeId!)
        .order('sort_order')
        .order('location_name');
      if (error) throw error;
      return (data ?? []).map((r) => ({
        location_id: r.location_id as string,
        location_name: r.location_name as string,
        short_code: (r.short_code as string | null) ?? null,
        sort_order: Number(r.sort_order ?? 0),
        is_active: Boolean(r.is_active),
        customer_count: Number(r.customer_count ?? 0),
        customers_with_dues: Number(r.customers_with_dues ?? 0),
        total_outstanding_paisa: Number(r.total_outstanding_paisa ?? 0),
        total_sales_paisa: Number(r.total_sales_paisa ?? 0),
        total_paid_paisa: Number(r.total_paid_paisa ?? 0),
      })) as LocationSummary[];
    },
  });
}

export function useLocation(id: string) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['locations', activeId, id],
    enabled: !!activeId && !!id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('location_summary_view')
        .select('*')
        .eq('business_id', activeId!)
        .eq('location_id', id)
        .single();
      if (error) throw error;
      return {
        location_id: data.location_id as string,
        location_name: data.location_name as string,
        short_code: (data.short_code as string | null) ?? null,
        sort_order: Number(data.sort_order ?? 0),
        is_active: Boolean(data.is_active),
        customer_count: Number(data.customer_count ?? 0),
        customers_with_dues: Number(data.customers_with_dues ?? 0),
        total_outstanding_paisa: Number(data.total_outstanding_paisa ?? 0),
        total_sales_paisa: Number(data.total_sales_paisa ?? 0),
        total_paid_paisa: Number(data.total_paid_paisa ?? 0),
      } as LocationSummary;
    },
  });
}

/**
 * Customers of one location with server-computed balances.
 *
 * The balance-range filters push down to SQL (they cut the payload); the
 * text search and sort run client-side on the already-small result — same
 * trade-off as the existing customer list.
 */
export function useCustomersByLocation(
  locationId: string | 'unassigned',
  filters: CustomerLocationFilters,
) {
  const activeId = useBusinessStore((s) => s.activeId);

  const query = useQuery({
    queryKey: [
      'customers-by-location',
      activeId,
      locationId,
      filters.balance,
      filters.minBalancePaisa ?? null,
      filters.maxBalancePaisa ?? null,
    ],
    enabled: !!activeId && !!locationId,
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from('customer_balances_view')
        .select('*')
        .eq('business_id', activeId!);

      if (locationId === 'unassigned') q = q.is('location_id', null);
      else q = q.eq('location_id', locationId);

      if (filters.balance === 'has_dues') q = q.gt('current_balance_paisa', 0);
      if (filters.balance === 'no_dues') q = q.eq('current_balance_paisa', 0);
      if (filters.balance === 'overpaid') q = q.lt('current_balance_paisa', 0);
      if (filters.minBalancePaisa !== undefined) {
        q = q.gte('current_balance_paisa', filters.minBalancePaisa);
      }
      if (filters.maxBalancePaisa !== undefined) {
        q = q.lte('current_balance_paisa', filters.maxBalancePaisa);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapBalanceRow);
    },
  });

  const search = filters.search.trim().toLowerCase();
  let rows = (query.data ?? []).filter(
    (c) => !search || c.name.toLowerCase().includes(search) || (c.phone ?? '').includes(search),
  );

  rows = [...rows].sort((a, b) => {
    switch (filters.sort) {
      case 'balance_desc':
        return b.current_balance_paisa - a.current_balance_paisa;
      case 'balance_asc':
        return a.current_balance_paisa - b.current_balance_paisa;
      case 'recent':
        return (b.last_activity ?? '').localeCompare(a.last_activity ?? '');
      default:
        return a.name.localeCompare(b.name);
    }
  });

  return { ...query, rows };
}

/** Customers with no location — drives the "Unassigned" card and setup flow. */
export function useUnassignedCustomers() {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['customers-by-location', activeId, 'unassigned', 'all', null, null],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('customer_balances_view')
        .select('*')
        .eq('business_id', activeId!)
        .is('location_id', null)
        .order('name');
      if (error) throw error;
      return (data ?? []).map(mapBalanceRow);
    },
  });
}

/** Invalidate everything the assignment flows touch. */
export function useInvalidateLocationData() {
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);

  return () => {
    for (const key of ['locations', 'customers-by-location', 'customers']) {
      queryClient.invalidateQueries({ queryKey: [key, activeId] });
    }
  };
}
