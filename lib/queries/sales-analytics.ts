'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';
import type { DateRange } from '@/components/reports/shared';
import {
  type SalesLine, type ProductPeriodRow,
  toSalesLine, toProductPeriodRow,
  summarise, byBrand, byCustomer, byLocation, trendSeries, deadStock, productPeriodsFromLines,
  previousRange, type TrendPeriod,
} from '@/lib/sales-analytics';

// Every read is a projection of one of the two views. PostgREST caps a response
// at db.max_rows (1000 on Supabase), so line reads are paged rather than given
// a large .limit() that would silently truncate — the same trap the Excel
// backup fell into.
const PAGE = 1000;
const MAX_LINES = 100_000;

const LINE_COLUMNS =
  'line_item_id, invoice_id, invoice_number, issue_date, invoice_status, customer_id, customer_name, ' +
  'location_id, location_name, product_id, product_name, product_sku, product_unit, brand_id, brand_name, ' +
  'brand_type, quantity, returned_quantity, net_quantity, unit_price_paisa, line_total_paisa, ' +
  'discount_share_paisa, effective_amount_paisa, returned_amount_paisa, net_amount_paisa, ' +
  'cost_price_paisa, profit_paisa, sale_date, sale_week, sale_month';

/** 'unbranded' is not an id — it means the lines whose product has no brand. */
export const UNBRANDED_BRAND = 'unbranded';

export type LineFilters = {
  range?: DateRange;
  brandId?: string;
  productId?: string;
  locationId?: string;
  customerId?: string;
};

async function fetchLines(businessId: string, f: LineFilters): Promise<SalesLine[]> {
  const supabase = createClient();
  const out: SalesLine[] = [];

  for (let from = 0; from < MAX_LINES; from += PAGE) {
    let q = supabase
      .from('sales_analytics_view')
      .select(LINE_COLUMNS)
      .eq('business_id', businessId)
      .order('issue_date', { ascending: false })
      .range(from, from + PAGE - 1);

    if (f.range) q = q.gte('issue_date', f.range.from).lte('issue_date', f.range.to);
    if (f.brandId === UNBRANDED_BRAND) q = q.is('brand_id', null);
    else if (f.brandId) q = q.eq('brand_id', f.brandId);
    if (f.productId) q = q.eq('product_id', f.productId);
    if (f.locationId) q = q.eq('location_id', f.locationId);
    if (f.customerId) q = q.eq('customer_id', f.customerId);

    const { data, error } = await q;
    if (error) throw error;

    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    out.push(...rows.map(toSalesLine));
    if (rows.length < PAGE) break;
  }

  return out;
}

function useLines(filters: LineFilters, key: string) {
  const activeId = useBusinessStore((s) => s.activeId);
  return useQuery({
    queryKey: ['sales-analytics', key, activeId, filters],
    enabled: !!activeId,
    queryFn: () => fetchLines(activeId!, filters),
  });
}

// ───────────────────────────────────────────────
// 1. Overview — totals for the range, and the same span immediately before it
// ───────────────────────────────────────────────
export function useSalesOverview(range?: DateRange, filters: LineFilters = {}) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['sales-overview', activeId, range, filters],
    enabled: !!activeId,
    queryFn: async () => {
      const prev = range ? previousRange(range) : undefined;
      const [current, previous] = await Promise.all([
        fetchLines(activeId!, { ...filters, range }),
        prev ? fetchLines(activeId!, { ...filters, range: prev }) : Promise.resolve([]),
      ]);
      return {
        current: summarise(current),
        previous: prev ? summarise(previous) : null,
        lines: current,
        // The previous period's lines, not just its totals — a per-product
        // trend arrow needs the breakdown on both sides, not one number.
        previousLines: previous,
      };
    },
  });
}

// ───────────────────────────────────────────────
// 2-6. Groupings — all off the same line read, grouped in pure code
// ───────────────────────────────────────────────
export function useSalesByBrand(range?: DateRange, filters: LineFilters = {}) {
  const q = useLines({ ...filters, range }, 'by-brand');
  return { ...q, data: q.data ? byBrand(q.data) : undefined };
}

export function useSalesByCustomer(range?: DateRange, brandId?: string) {
  const q = useLines({ range, brandId }, 'by-customer');
  return { ...q, data: q.data ? byCustomer(q.data) : undefined };
}

export function useSalesByLocation(range?: DateRange, filters: LineFilters = {}) {
  const q = useLines({ ...filters, range }, 'by-location');
  return { ...q, data: q.data ? byLocation(q.data) : undefined };
}

export function useSalesTrend(period: TrendPeriod, filters: LineFilters = {}) {
  const q = useLines(filters, `trend-${period}`);
  return { ...q, data: q.data ? trendSeries(q.data, period) : undefined };
}

// ───────────────────────────────────────────────
// 7. Per-product period columns, straight from the rollup view
// ───────────────────────────────────────────────
export type ProductFilters = {
  brandId?: string;
  /** 'all' includes inactive products; the table defaults to active only. */
  status?: 'active' | 'all';
};

export function useSalesByProduct(filters: ProductFilters = {}) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery<ProductPeriodRow[]>({
    queryKey: ['sales-by-product', activeId, filters],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from('product_sales_periods_view')
        .select('*')
        .eq('business_id', activeId!)
        .order('sales_30d_paisa', { ascending: false })
        .limit(PAGE);

      if (filters.brandId) q = q.eq('brand_id', filters.brandId);
      if (filters.status !== 'all') q = q.eq('is_active', true);

      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map(toProductPeriodRow);
    },
  });
}

// ───────────────────────────────────────────────
// 8. One product, in full
// ───────────────────────────────────────────────
export function useProductSalesDetail(productId: string | null, range?: DateRange) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['product-sales-detail', activeId, productId, range],
    enabled: !!activeId && !!productId,
    queryFn: async () => {
      const lines = await fetchLines(activeId!, { productId: productId!, range });
      return {
        lines,
        totals: summarise(lines),
        byCustomer: byCustomer(lines),
        byLocation: byLocation(lines),
        monthly: trendSeries(lines, 'monthly'),
      };
    },
  });
}

// ───────────────────────────────────────────────
// 9. Dead stock — has stock, has not sold
// ───────────────────────────────────────────────
export function useDeadStock(days: number) {
  const products = useSalesByProduct({ status: 'all' });
  return {
    ...products,
    data: products.data ? deadStock(products.data, days) : undefined,
  };
}

// ───────────────────────────────────────────────
// 10. Product rows honouring a location filter
//
// The rollup view has no location dimension, so a location filter cannot be
// pushed into it. Rather than disable the filter, the same windows are rebuilt
// from the lines that survive it, with stock and price merged back in from the
// rollup — see productPeriodsFromLines.
// ───────────────────────────────────────────────
export function useProductRows(filters: ProductFilters & { locationId?: string | null }) {
  const activeId = useBusinessStore((s) => s.activeId);
  const base = useSalesByProduct({ brandId: filters.brandId, status: filters.status });

  const scoped = useQuery({
    queryKey: ['product-rows-by-location', activeId, filters.brandId, filters.locationId, filters.status],
    enabled: !!activeId && !!filters.locationId && !!base.data,
    queryFn: async () => {
      const from = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
      const to = new Date().toISOString().slice(0, 10);
      const lines = await fetchLines(activeId!, {
        range: { from, to },
        brandId: filters.brandId,
        locationId: filters.locationId!,
      });
      return productPeriodsFromLines(lines, base.data ?? []);
    },
  });

  if (!filters.locationId) return base;
  return {
    ...scoped,
    isLoading: base.isLoading || scoped.isLoading,
    error: base.error ?? scoped.error,
    data: scoped.data,
  };
}
