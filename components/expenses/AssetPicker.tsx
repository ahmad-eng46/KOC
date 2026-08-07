'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, X, Check } from 'lucide-react';
import type { ExpenseAsset } from '@/lib/queries/expense-assets';

type Props = {
  assets: ExpenseAsset[];
  value: string | null;
  onChange: (assetId: string | null) => void;
  onAddNew: () => void;
  categoryLabel: string;
};

/**
 * Searchable asset dropdown for the expense form. Data arrives prefetched
 * from the parent (no loading state here by design). "+ Add New" is pinned
 * to the bottom of the list; clearing is a tap on the ×.
 */
export function AssetPicker({ assets, value, onChange, onAddNew, categoryLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = assets.find((a) => a.id === value) ?? null;

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtered = assets.filter(
    (a) => !search || a.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          'w-full h-11 px-3 rounded-xl border text-sm bg-white flex items-center justify-between gap-2',
          'focus:outline-none focus:ring-2 focus:ring-blue-500',
          selected ? 'border-blue-300 text-gray-900' : 'border-gray-300 text-gray-400',
        ].join(' ')}
      >
        <span className="truncate">
          {selected ? selected.name : `Select (optional)`}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && (
            <span
              role="button"
              aria-label="Clear"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="p-1 rounded text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={15} className="text-gray-400" />
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
          {assets.length > 3 && (
            <div className="p-2 border-b border-gray-100">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                autoFocus
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="max-h-52 overflow-y-auto">
            {assets.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">
                No items added yet. Add your first{' '}
                {categoryLabel === 'Rent' ? 'shop' : categoryLabel === 'Transport' || categoryLabel === 'Maintenance' ? 'vehicle' : 'item'}.
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">No match.</p>
            ) : (
              filtered.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    onChange(a.id);
                    setOpen(false);
                    setSearch('');
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-blue-50 min-h-[44px]"
                >
                  <span className="min-w-0">
                    <span className="block text-gray-900 truncate">{a.name}</span>
                    {a.asset_type && (
                      <span className="block text-xs text-gray-400 capitalize">{a.asset_type}</span>
                    )}
                  </span>
                  {a.id === value && <Check size={15} className="text-blue-600 shrink-0" />}
                </button>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setSearch('');
              onAddNew();
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-blue-600 border-t border-gray-100 hover:bg-blue-50 min-h-[44px]"
          >
            <Plus size={15} />
            Add New
          </button>
        </div>
      )}
    </div>
  );
}
