'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { useSalesData } from '@/lib/queries/reports';
import { useSalesOverview } from '@/lib/queries/sales-analytics';
import { useBrands } from '@/lib/queries/brands';
import { useProducts } from '@/lib/queries/products';
import { formatPKR } from '@/lib/money';
import {
  byCustomer, trendSeries, percentChange, previousRange,
} from '@/lib/sales-analytics';
import { exportSalesPdf, exportSalesExcel } from '@/lib/actions/reports';
import {
  FilterBar, KPICard, ExportButtons, rangeForPreset,
  type DatePreset, type DateRange,
} from './shared';
import { FilterSelect } from './FilterSelect';
import { ProductBreakdown, InvoiceBreakdown } from './SalesBreakdown';
import { formatQty } from './analytics/OverviewCards';

import { UNBRANDED_BRAND as UNBRANDED } from '@/lib/queries/sales-analytics';

type Props = {
  initialBrand?: string;
  initialProduct?: string;
};

export function SalesReport({ initialBrand = '', initialProduct = '' }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [preset, setPreset] = useState<DatePreset>('month');
  const [range, setRange] = useState<DateRange>(rangeForPreset('month'));
  const [brandId, setBrandId] = useState(initialBrand);
  const [productId, setProductId] = useState(initialProduct);

  const filtered = brandId !== '' || productId !== '';

  // Unfiltered numbers keep coming from the invoice-level query, so "All
  // brands + All products" is byte-for-byte the report that existed before.
  const { data: invoiceRows = [], isLoading: invoicesLoading } = useSalesData(range);

  // Filtering by brand or product needs line-level data, which is what
  // sales_analytics_view is for — discount already shared out, returns netted.
  // UNBRANDED goes into the query too — filtering it here instead would leave
  // the PDF and Excel exporting everything while the screen showed one slice.
  const lineFilters = useMemo(
    () => ({
      brandId: brandId || undefined,
      productId: productId || undefined,
    }),
    [brandId, productId],
  );
  const { data: overview, isLoading: linesLoading } = useSalesOverview(range, lineFilters);

  const { data: brands = [] } = useBrands();
  const { data: products = [] } = useProducts(
    brandId === '' ? undefined : brandId === UNBRANDED ? 'unbranded' : brandId,
  );

  // Memoised so the `?? []` fallback does not hand a fresh array to the
  // grouping hooks below on every render.
  const lines = useMemo(() => overview?.lines ?? [], [overview?.lines]);
  const previousLines = useMemo(() => overview?.previousLines ?? [], [overview?.previousLines]);

  const isLoading = filtered ? linesLoading : invoicesLoading;

  function updateFilters(next: { brand?: string; product?: string }) {
    const brand = next.brand ?? brandId;
    // The product list depends on the brand, so a brand change drops a product
    // that may no longer be in it.
    const product = next.brand !== undefined ? '' : (next.product ?? productId);

    setBrandId(brand);
    setProductId(product);

    const params = new URLSearchParams(searchParams.toString());
    if (brand) params.set('brand', brand); else params.delete('brand');
    if (product) params.set('product', product); else params.delete('product');
    const query = params.toString();
    router.replace(query ? `/reports/sales?${query}` : '/reports/sales', { scroll: false });
  }

  const brandName = brandId === UNBRANDED
    ? 'Unbranded'
    : brands.find((b) => b.id === brandId)?.name ?? null;
  const productName = products.find((p) => p.id === productId)?.name ?? null;

  const scopeLabel = productName
    ? `${productName}${brandName ? ` (${brandName})` : ''}`
    : brandName ?? null;

  // ── Summary ──
  const invoiceTotal = invoiceRows.reduce((s, r) => s + r.total_paisa, 0);
  const invoicePaid = invoiceRows.reduce((s, r) => s + r.paid_paisa, 0);

  const filteredSales = lines.reduce((s, l) => s + l.net_amount_paisa, 0);
  const filteredQty = lines.reduce((s, l) => s + l.net_quantity, 0);
  const filteredInvoices = new Set(lines.map((l) => l.invoice_id)).size;
  const previousSales = previousLines.reduce((s, l) => s + l.net_amount_paisa, 0);

  const change = percentChange(filteredSales, previousSales);
  const prev = previousRange(range);

  // ── Chart ──
  const byDay = useMemo(() => {
    if (filtered) {
      return trendSeries(lines, 'daily').map((p) => ({ date: p.date, total: p.amountPaisa / 100 }));
    }
    const m = new Map<string, number>();
    for (const r of invoiceRows) m.set(r.issue_date, (m.get(r.issue_date) ?? 0) + r.total_paisa);
    return Array.from(m.entries())
      .map(([date, total_paisa]) => ({ date, total: total_paisa / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered, lines, invoiceRows]);

  // ── Top customers ──
  const topCustomers = useMemo(() => {
    if (filtered) {
      return byCustomer(lines)
        .slice(0, 10)
        .map((c) => ({ name: c.name, total_paisa: c.salesPaisa, count: c.invoiceCount }));
    }
    const m = new Map<string, { total_paisa: number; count: number }>();
    for (const r of invoiceRows) {
      const v = m.get(r.customer_name) ?? { total_paisa: 0, count: 0 };
      v.total_paisa += r.total_paisa;
      v.count += 1;
      m.set(r.customer_name, v);
    }
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total_paisa - a.total_paisa)
      .slice(0, 10);
  }, [filtered, lines, invoiceRows]);

  return (
    <div className="space-y-4">
      <FilterBar
        preset={preset}
        range={range}
        onPresetChange={setPreset}
        onRangeChange={setRange}
        extras={
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <FilterSelect
              label="Brand"
              value={brandId}
              allLabel="All brands"
              onChange={(v) => updateFilters({ brand: v })}
              options={[
                ...brands.map((b) => ({ value: b.id, label: b.name })),
                { value: UNBRANDED, label: 'Unbranded' },
              ]}
            />
            <FilterSelect
              label="Product"
              value={productId}
              allLabel="All products"
              onChange={(v) => updateFilters({ product: v })}
              options={products.map((p) => ({
                value: p.id,
                label: p.name,
                hint: p.sku ?? undefined,
              }))}
            />
            <div className="sm:ml-auto sm:pb-0.5">
              <ExportButtons
                onExportPdf={() => exportSalesPdf(range, lineFilters)}
                onExportExcel={() => exportSalesExcel(range, lineFilters)}
              />
            </div>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {filtered ? (
              <>
                <KPICard
                  label="Total Sales"
                  value={formatPKR(filteredSales)}
                  sub={changeLabel(change, prev)}
                />
                <KPICard
                  label="Quantity Sold"
                  value={formatQty(filteredQty)}
                  sub={`${filteredInvoices} invoice${filteredInvoices === 1 ? '' : 's'}`}
                />
                <KPICard
                  label="Invoices"
                  value={String(filteredInvoices)}
                  sub={scopeLabel ?? undefined}
                />
              </>
            ) : (
              <>
                <KPICard
                  label="Total Sales"
                  value={formatPKR(invoiceTotal)}
                  sub={changeLabel(percentChange(filteredSales, previousSales), prev)}
                />
                <KPICard label="Total Paid" value={formatPKR(invoicePaid)} accent="text-green-700" />
                <KPICard
                  label="Outstanding"
                  value={formatPKR(invoiceTotal - invoicePaid)}
                  accent={invoiceTotal - invoicePaid > 0 ? 'text-red-600' : 'text-gray-700'}
                  sub={`${invoiceRows.length} invoice${invoiceRows.length === 1 ? '' : 's'}`}
                />
              </>
            )}
          </div>

          {filtered && (
            // Payments settle whole invoices, never a single line, so there is
            // no honest "paid" figure for one product. Saying so beats printing
            // a number that looks apportioned and is not.
            <p className="text-xs text-gray-500">
              Paid and outstanding are recorded per invoice, not per product, so they are shown
              only for the unfiltered report. Amounts here are net of returns.
            </p>
          )}

          {byDay.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Sales by Day{scopeLabel ? ` — ${scopeLabel}` : ''}
              </h3>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={byDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), 'dd MMM')} fontSize={11} />
                    <YAxis tickFormatter={(n) => `${(n / 1000).toFixed(0)}k`} fontSize={11} />
                    <Tooltip formatter={(v) => formatPKR(Math.round(Number(v) * 100))} labelFormatter={(d) => format(parseISO(d as string), 'dd MMM yyyy')} />
                    <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {filtered && productId && (
            <InvoiceBreakdown lines={lines} title={`Invoice Detail — ${scopeLabel}`} />
          )}

          {filtered && !productId && (
            <ProductBreakdown
              lines={lines}
              previousLines={previousLines}
              title={`Product Sales — ${scopeLabel}`}
            />
          )}

          <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
            <h3 className="text-sm font-semibold text-gray-900 p-4 border-b border-gray-200">
              Top 10 Customers{scopeLabel ? ` — ${scopeLabel}` : ''}
            </h3>
            <table className="w-full text-sm min-w-[34rem]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Customer</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Invoices</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topCustomers.length === 0 && (
                  <tr><td colSpan={3} className="text-center py-6 text-gray-400">No sales in this period.</td></tr>
                )}
                {topCustomers.map((c) => (
                  <tr key={c.name}>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.count}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatPKR(c.total_paisa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function changeLabel(change: number | null, prev: DateRange): string {
  if (change === null) return `No sales in ${prev.from} to ${prev.to}`;
  const arrow = change >= 0 ? '▲' : '▼';
  return `${arrow} ${Math.abs(change).toFixed(1)}% vs previous period`;
}
