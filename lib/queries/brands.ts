'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';
import type { BrandType } from '@/lib/validators/brands';

export type Brand = {
  id: string;
  name: string;
  brand_type: BrandType;
  contact_person: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type BrandSummary = Brand & {
  product_count: number;
  low_stock_count: number;
  out_of_stock_count: number;
  total_stock_units: number;
};

/**
 * All active brands with their stock stats — one query on
 * brand_summary_view (no N+1), joined to the base row for address/notes.
 */
export function useBrands() {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['brands', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      const [summaryRes, brandsRes] = await Promise.all([
        supabase
          .from('brand_summary_view')
          .select('*')
          .eq('business_id', activeId!)
          .order('sort_order')
          .order('brand_name'),
        supabase
          .from('brands')
          .select('id, address, notes, created_at')
          .eq('business_id', activeId!)
          .is('deleted_at', null),
      ]);
      if (summaryRes.error) throw summaryRes.error;
      if (brandsRes.error) throw brandsRes.error;

      const extras = new Map(
        (brandsRes.data ?? []).map((b) => [b.id as string, b]),
      );

      return (summaryRes.data ?? []).map((r) => {
        const extra = extras.get(r.brand_id as string);
        return {
          id: r.brand_id as string,
          name: r.brand_name as string,
          brand_type: r.brand_type as BrandType,
          contact_person: (r.contact_person as string | null) ?? null,
          phone: (r.phone as string | null) ?? null,
          address: (extra?.address as string | null) ?? null,
          notes: (extra?.notes as string | null) ?? null,
          sort_order: Number(r.sort_order ?? 0),
          is_active: Boolean(r.is_active),
          created_at: (extra?.created_at as string) ?? '',
          product_count: Number(r.product_count ?? 0),
          low_stock_count: Number(r.low_stock_count ?? 0),
          out_of_stock_count: Number(r.out_of_stock_count ?? 0),
          total_stock_units: Number(r.total_stock_units ?? 0),
        } as BrandSummary;
      });
    },
  });
}

export function useBrand(id: string) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['brands', activeId, id],
    enabled: !!activeId && !!id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .eq('id', id)
        .eq('business_id', activeId!)
        .is('deleted_at', null)
        .single();
      if (error) throw error;
      return data as Brand;
    },
  });
}

export function useInvalidateBrandData() {
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);

  return () => {
    queryClient.invalidateQueries({ queryKey: ['brands', activeId] });
    queryClient.invalidateQueries({ queryKey: ['products', activeId] });
  };
}
