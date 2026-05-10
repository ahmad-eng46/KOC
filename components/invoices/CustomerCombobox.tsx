'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import { formatPKR } from '@/lib/money';
import { type CustomerWithBalance } from '@/lib/queries/customers-balance';

type Props = {
  customers: CustomerWithBalance[];
  value: string | null;
  onChange: (id: string | null) => void;
  loading?: boolean;
  error?: string;
};

export function CustomerCombobox({ customers, value, onChange, loading, error }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = customers.find((c) => c.id === value) ?? null;

  // Close on outside click / Escape
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

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? '').includes(search),
  );

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        Customer <span className="text-red-500">*</span>
      </label>

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
            {selected.phone && (
              <span className="text-xs text-gray-500">{selected.phone}</span>
            )}
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
          {loading ? 'Loading customers…' : 'Select a customer'}
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
                placeholder="Search by name or phone…"
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-center py-6 text-sm text-gray-400">No customers match.</p>
            )}
            {filtered.map((c) => {
              const isSelected = c.id === value;
              const isDefaulter = c.current_balance_paisa > 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c.id)}
                  className={[
                    'w-full px-3 py-2.5 text-left hover:bg-gray-50 border-b border-gray-50 last:border-0',
                    isSelected ? 'bg-blue-50' : '',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                      {c.phone && (
                        <p className="text-xs text-gray-500">{c.phone}</p>
                      )}
                    </div>
                    <span
                      className={[
                        'text-xs font-mono shrink-0',
                        isDefaulter ? 'text-red-600 font-semibold' : 'text-gray-400',
                      ].join(' ')}
                    >
                      {formatPKR(c.current_balance_paisa)}
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
