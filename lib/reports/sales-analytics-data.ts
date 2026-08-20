// Server-side fetch for the sales analytics exports. Uses the auth-context
// client, so RLS applies and the views decide for themselves whether this
// caller may see cost — the export never has to make that judgement.

import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import type { DateRange } from '@/components/reports/shared';
import {
  toSalesLine, toProductPeriodRow, summarise, byBrand, byCustomer, byLocation,
  trendSeries, deadStock, previousRange,
  type SalesLine, type ProductPeriodRow, type SalesSummary, type GroupRow,
  type TrendPoint, type DeadStockRow,
} from '@/lib/sales-analytics';

const PAGE = 1000;
const MAX_LINES = 100_000;

export type SalesAnalyticsFilters = {
  range: DateRange;
  brandId?: string | null;
  locationId?: string | null;
  /** Window for the dead-stock sheet. */
  deadStockDays?: number;
};

export type SalesAnalyticsData = {
  range: DateRange;
  brandName: string | null;
  current: SalesSummary;
  previous: SalesSummary;
  brands: GroupRow[];
  customers: GroupRow[];
  locations: GroupRow[];
  daily: TrendPoint[];
  products: ProductPeriodRow[];
  dead: DeadStockRow[];
  deadStockDays: number;
  /** False for staff and viewer — the views returned no cost, so no column is written. */
  costVisible: boolean;
};

export async function fetchSalesAnalyticsData(
  filters: SalesAnalyticsFilters,
): Promise<SalesAnalyticsData> {
  const supabase = await createServerClient();
  const businessId = await getActiveBusinessId();
  const deadStockDays = filters.deadStockDays ?? 30;

  const prev = previousRange(filters.range);

  const [current, previousLines, products] = await Promise.all([
    fetchLines(supabase, businessId, filters, filters.range),
    fetchLines(supabase, businessId, filters, prev),
    fetchProducts(supabase, businessId, filters),
  ]);

  const brandName =
    filters.brandId
      ? current.find((l) => l.brand_id === filters.brandId)?.brand_name
        ?? products.find((p) => p.brand_id === filters.brandId)?.brand_name
        ?? null
      : null;

  return {
    range: filters.range,
    brandName,
    current: summarise(current),
    previous: summarise(previousLines),
    brands: byBrand(current),
    customers: byCustomer(current),
    locations: byLocation(current),
    daily: trendSeries(current, 'daily'),
    products,
    dead: deadStock(products, deadStockDays),
    deadStockDays,
    costVisible: current.some((l) => l.profit_paisa !== null)
      || products.some((p) => p.purchase_price_paisa !== null),
  };
}

type Client = Awaited<ReturnType<typeof createServerClient>>;

async function fetchLines(
  supabase: Client,
  businessId: string,
  filters: SalesAnalyticsFilters,
  range: DateRange,
): Promise<SalesLine[]> {
  const out: SalesLine[] = [];

  for (let from = 0; from < MAX_LINES; from += PAGE) {
    let q = supabase
      .from('sales_analytics_view')
      .select('*')
      .eq('business_id', businessId)
      .gte('issue_date', range.from)
      .lte('issue_date', range.to)
      .order('issue_date')
      .range(from, from + PAGE - 1);

    if (filters.brandId) q = q.eq('brand_id', filters.brandId);
    if (filters.locationId) q = q.eq('location_id', filters.locationId);

    const { data, error } = await q;
    if (error) throw error;

    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    out.push(...rows.map(toSalesLine));
    if (rows.length < PAGE) break;
  }

  return out;
}

async function fetchProducts(
  supabase: Client,
  businessId: string,
  filters: SalesAnalyticsFilters,
): Promise<ProductPeriodRow[]> {
  let q = supabase
    .from('product_sales_periods_view')
    .select('*')
    .eq('business_id', businessId)
    .order('sales_30d_paisa', { ascending: false })
    .limit(PAGE);

  if (filters.brandId) q = q.eq('brand_id', filters.brandId);

  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toProductPeriodRow);
}
