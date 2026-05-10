'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X, ChevronDown, AlertTriangle } from 'lucide-react';
import { formatPKR } from '@/lib/money';
import { type Product } from '@/lib/queries/products';

type Props = {
  products: Product[];
  value: string | null;
  onChange: (id: string | null) => void;
  loading?: boolean;
  error?: string;
  placeholder?: string;
};

export function ProductCombobox({
  products,
  value,
  onChange,
  loading,
  error,
  placeholder = 'Select a product',
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = products.find((p) => p.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = products
    .filter((p) => p.is_active)
    .filter(
      (p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku ?? '').toLowerCase().includes(search.toLowerCase()),
    );

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={wrapperRef} className="relative">
      {selected ? (
        <div
          className={[
            'w-full h-11 px-3 rounded-xl border bg-white flex items-center justify-between gap-2 cursor-pointer',
            error ? 'border-red-400' : 'border-gray-300 hover:border-gray-400',
          ].join(' ')}
          onClick={() => setOpen(true)}
        >
          <div className="min-w-0 flex-1">
            <span className="text-sm font-medium text-gray-900 truncate block">
              {selected.name}
            </span>
            <span className="text-xs text-gray-500">
              {selected.sku ? `${selected.sku} · ` : ''}{selected.unit}
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 shrink-0"
            aria-label="Clear"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={[
            'w-full h-11 px-3 rounded-xl border bg-white flex items-center justify-between text-sm',
            error ? 'border-red-400' : 'border-gray-300 hover:border-gray-400',
            'text-gray-400',
          ].join(' ')}
        >
          {loading ? 'Loading products…' : placeholder}
          <ChevronDown size={14} />
        </button>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-80 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or SKU…"
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-center py-6 text-sm text-gray-400">No products match.</p>
            )}
            {filtered.map((p) => {
              const isSelected = p.id === value;
              const isLow = p.low_stock_threshold != null && p.quantity_on_hand <= p.low_stock_threshold;
              const isOut = p.quantity_on_hand <= 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p.id)}
                  className={[
                    'w-full px-3 py-2.5 text-left hover:bg-gray-50 border-b border-gray-50 last:border-0',
                    isSelected ? 'bg-blue-50' : '',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-500">
                        {p.sku ? `${p.sku} · ` : ''}{p.unit}
                        <span
                          className={[
                            'ml-1.5 inline-flex items-center gap-0.5 font-mono',
                            isOut ? 'text-red-600 font-medium' : isLow ? 'text-amber-600' : 'text-gray-400',
                          ].join(' ')}
                        >
                          stock: {p.quantity_on_hand}
                          {(isLow || isOut) && <AlertTriangle size={10} />}
                        </span>
                      </p>
                    </div>
                    <span className="text-xs font-mono text-gray-700 shrink-0 font-medium">
                      {formatPKR(p.sale_price_paisa)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
