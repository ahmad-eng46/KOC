'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';

export type StockMovementType = 'in' | 'out' | 'adjustment' | 'return';

export type ProductStockMovement = {
  id: string;
  type: StockMovementType;
  /** Stored positive; direction comes from `type` ('out' subtracts). */
  quantity: number;
  note: string | null;
  created_at: string;
  invoice_id: string | null;
  invoice_number: string | null;
  return_id: string | null;
  return_number: string | null;
};

type RawMovement = {
  id: string;
  type: StockMovementType;
  quantity: number;
  note: string | null;
  created_at: string;
  invoice_id: string | null;
  return_id: string | null;
  invoices: { invoice_number: string } | { invoice_number: string }[] | null;
  returns: { return_number: string } | { return_number: string }[] | null;
};

/**
 * Every stock movement for one product, newest first — sales out, purchases
 * and returns back in, adjustments. RLS limits this to admin/accountant/staff.
 */
export function useProductStockHistory(productId: string, limit = 50) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['product-stock-history', activeId, productId, limit],
    enabled: !!activeId && !!productId,
    queryFn: async (): Promise<ProductStockMovement[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('stock_movements')
        .select(
          'id, type, quantity, note, created_at, invoice_id, return_id, invoices(invoice_number), returns(return_number)',
        )
        .eq('business_id', activeId!)
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return ((data ?? []) as unknown as RawMovement[]).map((m) => {
        const inv = Array.isArray(m.invoices) ? m.invoices[0] : m.invoices;
        const ret = Array.isArray(m.returns) ? m.returns[0] : m.returns;
        return {
          id: m.id,
          type: m.type,
          quantity: Number(m.quantity),
          note: m.note,
          created_at: m.created_at,
          invoice_id: m.invoice_id,
          invoice_number: inv?.invoice_number ?? null,
          return_id: m.return_id,
          return_number: ret?.return_number ?? null,
        };
      });
    },
  });
}
