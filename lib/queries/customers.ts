'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';
import { softDeleteCustomer } from '@/lib/actions/customer';

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  opening_balance_paisa: number;
  credit_limit_paisa: number | null;
  is_defaulter: boolean;
  is_active: boolean;
  notes: string | null;
  category_id: string | null;
  location_id: string | null;
  created_at: string;
  customer_categories: { name: string; color: string | null } | null;
  locations: { name: string } | null;
};

/**
 * `categoryId` narrows the read server-side; 'uncategorised' means the rows with
 * no category at all. Left undefined, every customer comes back, which is what
 * the list does by default so search and the location chips keep working on the
 * full set.
 */
export function useCustomers(categoryId?: string) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['customers', activeId, categoryId ?? 'all'],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from('customers')
        .select('*, customer_categories(name, color), locations(name)')
        .eq('business_id', activeId!)
        .is('deleted_at', null)
        .order('name');

      if (categoryId === 'uncategorised') q = q.is('category_id', null);
      else if (categoryId) q = q.eq('category_id', categoryId);

      const { data, error } = await q;
      if (error) throw error;
      return data as Customer[];
    },
  });
}

export function useCustomer(id: string) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['customers', activeId, id],
    enabled: !!activeId && !!id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('customers')
        .select('*, customer_categories(name, color), locations(name)')
        .eq('id', id)
        .eq('business_id', activeId!)
        .is('deleted_at', null)
        .single();
      if (error) throw error;
      return data as Customer;
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);

  return useMutation({
    mutationFn: (id: string) => softDeleteCustomer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', activeId] });
    },
  });
}

// useCustomerCategories moved to lib/queries/customer-categories.ts, where the
// writes and cache invalidation live. Two copies reading different columns and
// keyed differently is how a dropdown ends up stale after a quick-create.
