'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';

export type FilterOption = { value: string; label: string; hint?: string };

/**
 * Searchable single-select for report filters. Deliberately not the entity
 * pickers: those exist to CHOOSE a thing and can create one, this exists to
 * NARROW a list and always offers a way back to "all".
 */
export function FilterSelect({
  label, value, options, onChange, allLabel, disabled,
}: {
  label: string;
  /** '' means no filter. */
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  allLabel: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.hint ?? '').toLowerCase().includes(q),
    );
  }, [options, search]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 sm:max-w-56">
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={[
          'w-full h-11 sm:h-10 px-3 rounded-xl border text-sm bg-white flex items-center justify-between gap-2',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-50',
          selected ? 'border-blue-300 text-gray-900' : 'border-gray-300 text-gray-500',
        ].join(' ')}
      >
        <span className="truncate">{selected ? selected.label : allLabel}</span>
        <ChevronDown size={15} className="text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
          {options.length > 6 && (
            <div className="relative border-b border-gray-100">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                autoFocus
                className="w-full h-10 pl-8 pr-3 text-sm focus:outline-none"
              />
            </div>
          )}

          <div className="max-h-64 overflow-y-auto">
            <Option label={allLabel} selected={value === ''} onPick={() => pick('')} />
            {visible.map((o) => (
              <Option
                key={o.value}
                label={o.label}
                hint={o.hint}
                selected={o.value === value}
                onPick={() => pick(o.value)}
              />
            ))}
            {visible.length === 0 && (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">Nothing matches.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Option({
  label, hint, selected, onPick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-blue-50 min-h-11"
    >
      <span className="min-w-0">
        <span className="block text-gray-900 truncate">{label}</span>
        {hint && <span className="block text-xs text-gray-400 truncate">{hint}</span>}
      </span>
      {selected && <Check size={15} className="text-blue-600 shrink-0" />}
    </button>
  );
}
