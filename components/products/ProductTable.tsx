'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Plus, Trash2, ChevronRight, AlertTriangle, Check } from 'lucide-react';
import { useProducts, useDeleteProduct, type Product } from '@/lib/queries/products';
import { useBrands, useInvalidateBrandData, type BrandSummary } from '@/lib/queries/brands';
import { bulkAssignBrand } from '@/lib/actions/brands';
import { formatPKR } from '@/lib/money';
import { BrandBadge } from './BrandBadge';
import { ExportStockButtons } from './ExportStockButtons';
import { useToast } from '@/components/ui/Toast';

type Props = {
  canSeePurchasePrice: boolean;
  /** admin/accountant — shows the bulk brand-assignment flow. */
  canBulkAssign: boolean;
};

export function ProductTable({ canSeePurchasePrice, canBulkAssign }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const invalidateBrands = useInvalidateBrandData();

  // ?brand=<uuid|unbranded> — survives refresh and is shareable.
  const brandParam = searchParams.get('brand') ?? '';
  const brandFilter =
    brandParam === 'unbranded' ? ('unbranded' as const) : brandParam || undefined;

  const { data: products = [], isLoading } = useProducts(brandFilter);
  const { data: allProducts = [] } = useProducts(); // for "Showing X of Y"
  const { data: brands = [] } = useBrands();
  const deleteMutation = useDeleteProduct();
  const [search, setSearch] = useState('');

  // Bulk assignment (Unbranded view only)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBrandId, setBulkBrandId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const unbrandedCount = useMemo(
    () => allProducts.filter((p) => p.brand_id === null).length,
    [allProducts],
  );

  const filtered = products.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const brandName = p.brand_id ? (brandById.get(p.brand_id)?.name ?? '') : '';
    // Brand name included: typing "double" surfaces all Double Horse products.
    return (
      p.name.toLowerCase().includes(q) ||
      (p.sku ?? '').toLowerCase().includes(q) ||
      brandName.toLowerCase().includes(q)
    );
  });

  function setBrandParam(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set('brand', value);
    else params.delete('brand');
    router.replace(`/products${params.size ? `?${params}` : ''}`, { scroll: false });
    setSelected(new Set());
  }

  const isUnbrandedView = brandParam === 'unbranded';
  const activeBrand = brandParam && !isUnbrandedView ? brandById.get(brandParam) : undefined;
  const showBulk = canBulkAssign && isUnbrandedView && filtered.length > 0;
  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(filtered.map((p) => p.id)));
  }

  async function onBulkAssign() {
    if (selected.size === 0 || !bulkBrandId) return;
    setAssigning(true);
    const result = await bulkAssignBrand({
      product_ids: Array.from(selected),
      brand_id: bulkBrandId,
    });
    setAssigning(false);
    if (!result.ok) {
      showToast(result.error, 'error');
      return;
    }
    const brandName = brandById.get(bulkBrandId)?.name ?? 'brand';
    invalidateBrands();
    setSelected(new Set());
    showToast(`${result.count} product${result.count === 1 ? '' : 's'} assigned to ${brandName}.`);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      {/* Brand filter chips — above everything else */}
      <div className="relative">
        <div
          className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-0.5 [scrollbar-width:none] [-webkit-overflow-scrolling:touch]"
        >
          <BrandChip label="All" active={!brandParam} onClick={() => setBrandParam('')} />
          {brands.map((b) => (
            <BrandChip
              key={b.id}
              label={b.name}
              active={brandParam === b.id}
              onClick={() => setBrandParam(brandParam === b.id ? '' : b.id)}
            />
          ))}
          <BrandChip
            label={unbrandedCount > 0 ? `Unbranded (${unbrandedCount})` : 'Unbranded'}
            active={isUnbrandedView}
            warning={unbrandedCount > 0}
            onClick={() => setBrandParam(isUnbrandedView ? '' : 'unbranded')}
          />
        </div>
        {/* fade hint that more chips exist */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-gray-50 to-transparent md:hidden" />
      </div>

      {/* Unbranded banner */}
      {canBulkAssign && !isUnbrandedView && unbrandedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            {unbrandedCount} product{unbrandedCount === 1 ? ' has' : 's have'} no brand assigned
          </p>
          <button
            onClick={() => setBrandParam('unbranded')}
            className="h-9 px-3.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
          >
            Assign Brands
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products or brands…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <ExportStockButtons activeBrand={activeBrand ?? null} isAll={!brandParam} />
        <Link
          href="/products/new"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shrink-0 ml-auto"
        >
          <Plus size={15} />
          Add Product
        </Link>
      </div>

      <p className="text-xs text-gray-500 -mt-1">
        Showing {filtered.length} of {allProducts.length} products
        {activeBrand ? ` · ${activeBrand.name}` : isUnbrandedView ? ' · Unbranded' : ''}
      </p>

      {/* Desktop bulk bar */}
      {showBulk && (
        <div className="hidden md:flex sticky top-0 z-10 items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
          </label>
          <div className="flex-1" />
          <BulkBrandSelect brands={brands} value={bulkBrandId} onChange={setBulkBrandId} />
          <button
            onClick={onBulkAssign}
            disabled={selected.size === 0 || !bulkBrandId || assigning}
            className="h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {assigning ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      )}

      {/* Table — desktop */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {showBulk && <th className="w-10 px-4 py-3" />}
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Brand</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">SKU</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Unit</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Stock</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Sale Price</th>
              {canSeePurchasePrice && (
                <th className="text-right px-4 py-3 font-medium text-gray-600">Cost</th>
              )}
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={(canSeePurchasePrice ? 9 : 8) + (showBulk ? 1 : 0)}
                  className="text-center py-10 text-gray-400 text-sm"
                >
                  {search || brandParam ? 'No products match.' : 'No products yet.'}
                </td>
              </tr>
            )}
            {filtered.map((p) => (
              <DesktopRow
                key={p.id}
                product={p}
                brand={p.brand_id ? brandById.get(p.brand_id) : undefined}
                canSeePurchasePrice={canSeePurchasePrice}
                showCheckbox={showBulk}
                checked={selected.has(p.id)}
                onCheck={() => toggleSelected(p.id)}
                onDelete={() => {
                  if (confirm(`Delete ${p.name}?`)) deleteMutation.mutate(p.id);
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards — mobile */}
      <div className="md:hidden space-y-2">
        {filtered.map((p) => {
          const isLow =
            p.low_stock_threshold != null && p.quantity_on_hand <= p.low_stock_threshold;
          const brand = p.brand_id ? brandById.get(p.brand_id) : undefined;
          const card = (
            <div className="flex items-center gap-3 bg-white rounded-2xl border border-gray-200 px-4 py-3">
              {showBulk && (
                <span
                  className={[
                    'w-5 h-5 rounded-md border flex items-center justify-center shrink-0',
                    selected.has(p.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white',
                  ].join(' ')}
                >
                  {selected.has(p.id) && <Check size={13} className="text-white" />}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">{p.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {p.sku ? `${p.sku} · ` : ''}{p.unit}
                </p>
                <p className="mt-1">
                  <BrandBadge name={brand?.name} type={brand?.brand_type} />
                </p>
              </div>
              <div className="text-right shrink-0 ml-1">
                <p className="text-sm font-mono text-gray-700">{formatPKR(p.sale_price_paisa)}</p>
                <p className={`text-xs mt-0.5 ${isLow ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                  Stock: {p.quantity_on_hand} {p.unit}
                  {isLow && ' ⚠'}
                </p>
              </div>
            </div>
          );
          return showBulk ? (
            <button key={p.id} type="button" onClick={() => toggleSelected(p.id)} className="w-full text-left">
              {card}
            </button>
          ) : (
            <Link key={p.id} href={`/products/${p.id}`}>{card}</Link>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center py-8 text-sm text-gray-400">
            {search || brandParam ? 'No products match.' : 'No products yet.'}
          </p>
        )}
      </div>

      {/* Mobile bulk bar — sticky bottom */}
      {showBulk && (
        <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-2 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
          <BulkBrandSelect brands={brands} value={bulkBrandId} onChange={setBulkBrandId} />
          <button
            onClick={onBulkAssign}
            disabled={selected.size === 0 || !bulkBrandId || assigning}
            className="h-11 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 shrink-0"
          >
            {assigning ? 'Assigning…' : `Assign ${selected.size || ''}`}
          </button>
        </div>
      )}
    </div>
  );
}

function DesktopRow({
  product: p, brand, canSeePurchasePrice, showCheckbox, checked, onCheck, onDelete,
}: {
  product: Product;
  brand: BrandSummary | undefined;
  canSeePurchasePrice: boolean;
  showCheckbox: boolean;
  checked: boolean;
  onCheck: () => void;
  onDelete: () => void;
}) {
  const isLow = p.low_stock_threshold != null && p.quantity_on_hand <= p.low_stock_threshold;
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {showCheckbox && (
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={onCheck}
            aria-label={`Select ${p.name}`}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </td>
      )}
      <td className="px-4 py-3 font-medium text-gray-900">
        <Link href={`/products/${p.id}`} className="hover:text-blue-600">
          {p.name}
        </Link>
      </td>
      <td className="px-4 py-3">
        <BrandBadge name={brand?.name} type={brand?.brand_type} />
      </td>
      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.sku ?? '—'}</td>
      <td className="px-4 py-3 text-gray-500">{p.unit}</td>
      <td className="px-4 py-3 text-right">
        <span className={isLow ? 'text-red-600 font-medium' : 'text-gray-700'}>
          {p.quantity_on_hand}
        </span>
        {isLow && <AlertTriangle size={13} className="inline ml-1 text-red-500" />}
      </td>
      <td className="px-4 py-3 text-right font-mono text-gray-700">
        {formatPKR(p.sale_price_paisa)}
      </td>
      {canSeePurchasePrice && (
        <td className="px-4 py-3 text-right font-mono text-gray-500">
          {p.purchase_price_paisa != null ? formatPKR(p.purchase_price_paisa) : '—'}
        </td>
      )}
      <td className="px-4 py-3">
        {p.is_active ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
            Active
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            Inactive
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <Link
            href={`/products/${p.id}`}
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"
          >
            <ChevronRight size={15} />
          </Link>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function BulkBrandSelect({
  brands, value, onChange,
}: { brands: BrandSummary[]; value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 md:flex-none h-11 md:h-10 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 md:min-w-44"
    >
      <option value="">— Select brand —</option>
      {brands.map((b) => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
    </select>
  );
}

function BrandChip({
  label, active, warning, onClick,
}: { label: string; active: boolean; warning?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'h-11 px-4 rounded-full border text-sm font-medium whitespace-nowrap transition-colors shrink-0',
        active
          ? 'bg-blue-600 border-blue-600 text-white'
          : warning
            ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
            : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
