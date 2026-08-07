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
  customer_categories: { name: string } | null;
  locations: { name: string } | null;
};

export function useCustomers() {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['customers', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('customers')
        .select('*, customer_categories(name), locations(name)')
        .eq('business_id', activeId!)
        .is('deleted_at', null)
        .order('name');
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
        .select('*, customer_categories(name), locations(name)')
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

export function useCustomerCategories() {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['customer_categories', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('customer_categories')
        .select('id, name')
        .eq('business_id', activeId!)
        .order('name');
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });
}
