'use client';

import { useState } from 'react';
import { BarChart3, Package, PackageX } from 'lucide-react';
import { FilterBar, rangeForPreset, type DatePreset, type DateRange } from '@/components/reports/shared';
import { useSalesOverview, useSalesByProduct, useProductRows } from '@/lib/queries/sales-analytics';
import { useBrands } from '@/lib/queries/brands';
import { useLocations } from '@/lib/queries/locations';
import { previousRange, type ProductPeriodRow } from '@/lib/sales-analytics';
import { OverviewCards } from './analytics/OverviewCards';
import { BrandPerformance } from './analytics/BrandPerformance';
import { ProductSalesTable, type ProductTableFilters } from './analytics/ProductSalesTable';
import { ProductDetailPanel } from './analytics/ProductDetailPanel';
import { SalesCharts } from './analytics/SalesCharts';
import { DeadStockTable } from './analytics/DeadStockTable';

type Tab = 'overview' | 'products' | 'dead-stock';

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'dead-stock', label: 'Dead Stock', icon: PackageX },
];

export function SalesAnalytics({ canSeeCost }: { canSeeCost: boolean }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [detailProduct, setDetailProduct] = useState<ProductPeriodRow | null>(null);
  const [preset, setPreset] = useState<DatePreset>('month');
  const [range, setRange] = useState<DateRange>(rangeForPreset('month'));
  const [tableFilters, setTableFilters] = useState<ProductTableFilters>({
    brandId: null, locationId: null, status: 'active',
  });
  const brandId = tableFilters.brandId;
  const setBrandId = (id: string | null) => setTableFilters((f) => ({ ...f, brandId: id }));

  const overview = useSalesOverview(range, brandId ? { brandId } : {});
  const products = useSalesByProduct(brandId ? { brandId } : {});
  const productRows = useProductRows({
    brandId: tableFilters.brandId ?? undefined,
    locationId: tableFilters.locationId,
    status: tableFilters.status,
  });
  const { data: brands = [] } = useBrands();
  const { data: locations = [] } = useLocations();

  const prev = previousRange(range);
  const comparisonLabel = `${prev.from} to ${prev.to}`;

  return (
    <div className="space-y-4">
      <FilterBar
        preset={preset}
        range={range}
        onPresetChange={setPreset}
        onRangeChange={setRange}
      />

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={[
              'inline-flex items-center gap-1.5 h-11 px-4 text-sm font-medium border-b-2 -mb-px whitespace-nowrap',
              tab === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {brandId && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Filtered to one brand.</span>
          <button
            onClick={() => setBrandId(null)}
            className="text-xs font-medium text-blue-700 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {tab === 'overview' && (
        <section className="space-y-4">
          {overview.isLoading ? (
            <Spinner />
          ) : overview.error ? (
            <ErrorBox error={overview.error} />
          ) : overview.data ? (
            <OverviewCards
              current={overview.data.current}
              previous={overview.data.previous}
              comparisonLabel={comparisonLabel}
              showProfit={canSeeCost}
            />
          ) : null}

          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Brand Performance</h2>
            <p className="text-xs text-gray-500 mb-2">
              Fixed windows ending today — independent of the date range above.
            </p>
            {products.isLoading ? <Spinner />
              : products.error ? <ErrorBox error={products.error} />
              : <BrandPerformance rows={products.data ?? []} onSelectBrand={setBrandId} />}
          </div>

          {overview.data && (
            <SalesCharts lines={overview.data.lines} onSelectBrand={setBrandId} />
          )}
        </section>
      )}

      {tab === 'products' && (
        productRows.isLoading ? <Spinner />
          : productRows.error ? <ErrorBox error={productRows.error} />
          : (
            <ProductSalesTable
              rows={productRows.data ?? []}
              filters={tableFilters}
              onFiltersChange={setTableFilters}
              brands={brands.map((b) => ({ id: b.id, name: b.name }))}
              locations={locations.map((l) => ({ id: l.location_id, name: l.location_name }))}
              onSelectProduct={(row) => setDetailProduct(row)}
            />
          )
      )}

      {tab === 'dead-stock' && <DeadStockTable canSeeCost={canSeeCost} />}

      {detailProduct && (
        <ProductDetailPanel
          product={detailProduct}
          canSeeCost={canSeeCost}
          onClose={() => setDetailProduct(null)}
        />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-32">
      <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
    </div>
  );
}

function ErrorBox({ error }: { error: unknown }) {
  const message =
    typeof (error as { message?: unknown } | null)?.message === 'string'
      ? (error as { message: string }).message
      : 'Could not load sales analytics.';
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-4">
      <p className="text-sm text-red-700">{message}</p>
    </div>
  );
}
