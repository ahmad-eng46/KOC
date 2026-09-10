'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export type LastSold = {
  /** What it actually sold for, per unit, in paisa. */
  unitPricePaisa: number;
  /** Issue date of the invoice it sold on, as YYYY-MM-DD. */
  soldOn: string;
  /** True when this was a sale to the customer on the current invoice. */
  forThisCustomer: boolean;
};

type Row = {
  product_id: string;
  unit_price_paisa: number | string;
  sold_on: string;
  for_this_customer: boolean;
};

/** Postgres reports an absent function this way; 0067 may not be applied yet. */
function isMissingFunction(code: string | undefined): boolean {
  return code === 'PGRST202' || code === '42883';
}

/**
 * Last sold rate for every product on the invoice, in ONE round trip.
 *
 * Keyed on the sorted id list so re-ordering lines does not refetch, and on the
 * customer because the answer is customer-specific: the rate given to this
 * buyer wins over the last rate given to anyone.
 *
 * Returns an empty map rather than throwing when 0067 has not been applied.
 * The form then falls back to the product's sale price, which is exactly what
 * it did before this feature — the page keeps working on an older database.
 */
export function useLastSoldRates(productIds: string[], customerId: string | null) {
  const ids = Array.from(new Set(productIds.filter(Boolean))).sort();

  return useQuery({
    queryKey: ['last-sold', customerId ?? 'no-customer', ids],
    enabled: ids.length > 0,
    // A sale that just happened should show on the next invoice.
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, LastSold>> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('last_sold_rates', {
        p_product_ids: ids,
        p_customer_id: customerId,
      });

      if (error) {
        if (isMissingFunction(error.code)) return new Map();
        throw error;
      }

      const out = new Map<string, LastSold>();
      for (const row of (data ?? []) as Row[]) {
        out.set(row.product_id, {
          unitPricePaisa: Number(row.unit_price_paisa),
          soldOn: row.sold_on,
          forThisCustomer: row.for_this_customer,
        });
      }
      return out;
    },
  });
}
