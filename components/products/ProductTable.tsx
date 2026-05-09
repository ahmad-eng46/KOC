'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Plus, Trash2, ChevronRight, AlertTriangle } from 'lucide-react';
import { useProducts, useDeleteProduct } from '@/lib/queries/products';
import { formatPKR } from '@/lib/money';

type Props = { canSeePurchasePrice: boolean };

export function ProductTable({ canSeePurchasePrice }: Props) {
  const { data: products = [], isLoading } = useProducts();
  const deleteMutation = useDeleteProduct();
  const [search, setSearch] = useState('');

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Link
          href="/products/new"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shrink-0"
        >
          <Plus size={15} />
          Add Product
        </Link>
      </div>

      {/* Table — desktop */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
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
                  colSpan={canSeePurchasePrice ? 8 : 7}
                  className="text-center py-10 text-gray-400 text-sm"
                >
                  {search ? 'No products match your search.' : 'No products yet.'}
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const isLow =
                p.low_stock_threshold != null && p.quantity_on_hand <= p.low_stock_threshold;
              return (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/products/${p.id}`} className="hover:text-blue-600">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.sku ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{p.unit}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={isLow ? 'text-red-600 font-medium' : 'text-gray-700'}>
                      {p.quantity_on_hand}
                    </span>
                    {isLow && (
                      <AlertTriangle size={13} className="inline ml-1 text-red-500" />
                    )}
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
                        onClick={() => {
                          if (confirm(`Delete ${p.name}?`)) deleteMutation.mutate(p.id);
                        }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cards — mobile */}
      <div className="md:hidden space-y-2">
        {filtered.map((p) => {
          const isLow =
            p.low_stock_threshold != null && p.quantity_on_hand <= p.low_stock_threshold;
          return (
            <Link
              key={p.id}
              href={`/products/${p.id}`}
              className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 px-4 py-3"
            >
              <div>
                <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {p.sku ? `${p.sku} · ` : ''}{p.unit}
                </p>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className="text-sm font-mono text-gray-700">{formatPKR(p.sale_price_paisa)}</p>
                <p className={`text-xs mt-0.5 ${isLow ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                  Stock: {p.quantity_on_hand} {p.unit}
                  {isLow && ' ⚠'}
                </p>
              </div>
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center py-8 text-sm text-gray-400">
            {search ? 'No products match your search.' : 'No products yet.'}
          </p>
        )}
      </div>
    </div>
  );
}
