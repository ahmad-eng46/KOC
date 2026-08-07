'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';
import { softDeleteProduct } from '@/lib/actions/product';

export type Product = {
  id: string;
  business_id: string;
  name: string;
  sku: string | null;
  unit: string;
  sale_price_paisa: number;
  purchase_price_paisa: number | null;
  low_stock_threshold: number | null;
  brand_id: string | null;
  is_active: boolean;
  created_at: string;
  quantity_on_hand: number;
};

/** 'unbranded' filters to products with no brand; undefined returns all. */
export type ProductBrandFilter = string | 'unbranded' | undefined;

export function useProducts(brandId?: ProductBrandFilter) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['products', activeId, brandId ?? 'all'],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      let productsQuery = supabase
        .from('products_for_role')
        .select('*')
        .eq('business_id', activeId!)
        .order('name');
      if (brandId === 'unbranded') productsQuery = productsQuery.is('brand_id', null);
      else if (brandId) productsQuery = productsQuery.eq('brand_id', brandId);

      const [productsRes, stockRes] = await Promise.all([
        productsQuery,
        supabase
          .from('current_stock')
          .select('product_id, quantity_on_hand')
          .eq('business_id', activeId!),
      ]);
      if (productsRes.error) throw productsRes.error;
      if (stockRes.error) throw stockRes.error;

      const stockMap = new Map(
        (stockRes.data ?? []).map((s) => [s.product_id, Number(s.quantity_on_hand)]),
      );

      return (productsRes.data ?? []).map((p) => ({
        ...p,
        quantity_on_hand: stockMap.get(p.id) ?? 0,
      })) as Product[];
    },
  });
}

/** Spec-named convenience wrapper: null = unbranded products. */
export function useProductsByBrand(brandId: string | null) {
  return useProducts(brandId ?? 'unbranded');
}

export function useProduct(id: string) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['products', activeId, id],
    enabled: !!activeId && !!id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('products_for_role')
        .select('*')
        .eq('id', id)
        .eq('business_id', activeId!)
        .single();
      if (error) throw error;
      return { ...data, quantity_on_hand: 0 } as Product;
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);

  return useMutation({
    mutationFn: (id: string) => softDeleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', activeId] });
    },
  });
}
