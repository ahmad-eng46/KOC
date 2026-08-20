'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';
import {
  createCustomerCategory,
  updateCustomerCategory,
  deleteCustomerCategory,
} from '@/lib/actions/customer-categories';
import type {
  CustomerCategoryInput, CustomerCategoryUpdateInput,
} from '@/lib/validators/customer-categories';

export type CustomerCategory = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
};

export type CustomerCategoryWithCount = CustomerCategory & { customer_count: number };

/**
 * Active categories for the current business, in the owner's order.
 * Soft-deleted rows never arrive — the RLS policy filters them (0053).
 */
export function useCustomerCategories() {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery<CustomerCategory[]>({
    queryKey: ['customer-categories', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('customer_categories')
        .select('id, name, description, color, sort_order, is_active')
        .eq('business_id', activeId!)
        .eq('is_active', true)
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return (data ?? []) as CustomerCategory[];
    },
  });
}

/** Every category including deactivated ones, with how many customers each holds. */
export function useCustomerCategoriesWithCounts() {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery<CustomerCategoryWithCount[]>({
    queryKey: ['customer-categories-counts', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();

      const [catRes, custRes] = await Promise.all([
        supabase
          .from('customer_categories')
          .select('id, name, description, color, sort_order, is_active')
          .eq('business_id', activeId!)
          .order('sort_order')
          .order('name'),
        supabase
          .from('customers')
          .select('category_id')
          .eq('business_id', activeId!)
          .is('deleted_at', null),
      ]);

      if (catRes.error) throw catRes.error;
      if (custRes.error) throw custRes.error;

      const counts = new Map<string, number>();
      for (const row of (custRes.data ?? []) as Array<{ category_id: string | null }>) {
        if (!row.category_id) continue;
        counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
      }

      return ((catRes.data ?? []) as CustomerCategory[]).map((c) => ({
        ...c,
        customer_count: counts.get(c.id) ?? 0,
      }));
    },
  });
}

/**
 * Both category caches at once. The picker reads one and Settings the other, so
 * invalidating a single key would leave one of them stale after a write.
 * Awaited by callers before selecting a new category, so the dropdown already
 * holds it — the same ordering BrandPicker relies on.
 */
export function useInvalidateCustomerCategories() {
  const qc = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);

  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['customer-categories', activeId] }),
      qc.invalidateQueries({ queryKey: ['customer-categories-counts', activeId] }),
      // Customer rows carry the joined category name, so they go stale too.
      qc.invalidateQueries({ queryKey: ['customers', activeId] }),
    ]);
  };
}

export function useCreateCustomerCategory() {
  const invalidate = useInvalidateCustomerCategories();
  return useMutation({
    mutationFn: (input: CustomerCategoryInput) => createCustomerCategory(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateCustomerCategory() {
  const invalidate = useInvalidateCustomerCategories();
  return useMutation({
    mutationFn: (v: { id: string; input: CustomerCategoryUpdateInput }) =>
      updateCustomerCategory(v.id, v.input),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteCustomerCategory() {
  const invalidate = useInvalidateCustomerCategories();
  return useMutation({
    mutationFn: (id: string) => deleteCustomerCategory(id),
    onSuccess: () => invalidate(),
  });
}
