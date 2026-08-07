'use client';

import { useEffect, useState } from 'react';
import { Search, Plus, AlertTriangle, PackageCheck, PackageX } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useProducts } from '@/lib/queries/products';
import { useBusinessStore } from '@/lib/store/business';
import { AddStockModal } from './AddStockModal';

type Props = { canUpdate: boolean; canAdjust: boolean; canPurchase?: boolean };

export function StockList({ canUpdate, canAdjust, canPurchase = false }: Props) {
  const { data: products = [], isLoading } = useProducts();
  const activeId = useBusinessStore((s) => s.activeId);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [modalProductId, setModalProductId] = useState<string | undefined>(undefined);
  const [modalOpen, setModalOpen] = useState(false);

  // Realtime subscription — invalidate products query on any new stock movement
  useEffect(() => {
    if (!activeId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`stock-${activeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stock_movements',
          filter: `business_id=eq.${activeId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['products', activeId] });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeId, queryClient]);

  const filtered = products
    .filter((p) => p.is_active)
    .filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(search.toLowerCase()),
    )
    .filter((p) =>
      !lowStockOnly ||
      (p.low_stock_threshold != null && p.quantity_on_hand <= p.low_stock_threshold),
    );

  const lowStockCount = products.filter(
    (p) => p.is_active && p.low_stock_threshold != null && p.quantity_on_hand <= p.low_stock_threshold,
  ).length;

  function openModal(productId?: string) {
    setModalProductId(productId);
    setModalOpen(true);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {lowStockCount > 0 && (
          <button
            onClick={() => setLowStockOnly((v) => !v)}
            className={[
              'inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border text-sm font-medium transition-colors',
              lowStockOnly
                ? 'bg-red-50 border-red-300 text-red-700'
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
            ].join(' ')}
          >
            <AlertTriangle size={14} />
            {lowStockCount} low stock
          </button>
        )}

        {canUpdate && (
          <button
            onClick={() => openModal()}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shrink-0 ml-auto"
          >
            <Plus size={15} />
            Add Stock
          </button>
        )}
      </div>

      {/* Table — desktop */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">SKU</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Unit</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">On Hand</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Threshold</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              {canUpdate && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={canUpdate ? 7 : 6} className="text-center py-10 text-gray-400 text-sm">
                  {search || lowStockOnly ? 'No products match.' : 'No active products.'}
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const isLow = p.low_stock_threshold != null && p.quantity_on_hand <= p.low_stock_threshold;
              const isOut = p.quantity_on_hand <= 0;
              return (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.sku ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{p.unit}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium">
                    <span className={isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-gray-900'}>
                      {p.quantity_on_hand}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 font-mono text-xs">
                    {p.low_stock_threshold ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    {isOut ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
                        <PackageX size={11} /> Out of stock
                      </span>
                    ) : isLow ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                        <AlertTriangle size={11} /> Low stock
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                        <PackageCheck size={11} /> OK
                      </span>
                    )}
                  </td>
                  {canUpdate && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openModal(p.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                      >
                        <Plus size={12} /> Add
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cards — mobile */}
      <div className="md:hidden space-y-2">
        {filtered.map((p) => {
          const isLow = p.low_stock_threshold != null && p.quantity_on_hand <= p.low_stock_threshold;
          const isOut = p.quantity_on_hand <= 0;
          return (
            <div
              key={p.id}
              className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">{p.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{p.unit}{p.sku ? ` · ${p.sku}` : ''}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-3">
                <div className="text-right">
                  <p className={`text-sm font-mono font-medium ${isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-gray-900'}`}>
                    {p.quantity_on_hand}
                  </p>
                  {isOut && <p className="text-[10px] text-red-500 font-semibold">OUT OF STOCK</p>}
                  {isLow && !isOut && <p className="text-[10px] text-amber-500 font-semibold">LOW STOCK</p>}
                </div>
                {canUpdate && (
                  <button
                    onClick={() => openModal(p.id)}
                    className="p-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center py-8 text-sm text-gray-400">
            {search || lowStockOnly ? 'No products match.' : 'No active products.'}
          </p>
        )}
      </div>

      {modalOpen && (
        <AddStockModal
          products={filtered.length > 0 ? filtered : products.filter((p) => p.is_active)}
          defaultProductId={modalProductId}
          canAdjust={canAdjust}
          canPurchase={canPurchase}
          onClose={() => setModalOpen(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['products', activeId] })}
        />
      )}
    </>
  );
}
