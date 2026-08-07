'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Phone } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  useCustomersByLocation,
  type CustomerLocationFilters,
} from '@/lib/queries/locations';
import { balanceFilters, BALANCE_FILTER_LABELS, type BalanceFilter } from '@/lib/validators/locations';
import { formatPKR, rupeesToPaisa } from '@/lib/money';

type Props = {
  locationId: string | 'unassigned';
};

type SortKey = CustomerLocationFilters['sort'];

const SORT_LABELS: Record<SortKey, string> = {
  name: 'Name A–Z',
  balance_desc: 'Balance High→Low',
  balance_asc: 'Balance Low→High',
  recent: 'Recent activity',
};

function BalanceAmount({ paisa }: { paisa: number }) {
  if (paisa > 0) {
    return <span className="font-bold text-red-600">{formatPKR(paisa)}</span>;
  }
  if (paisa < 0) {
    return <span className="font-bold text-green-600">+{formatPKR(Math.abs(paisa))}</span>;
  }
  return <span className="text-gray-400">Rs. 0.00</span>;
}

/** Parse a rupee bound; empty/garbage = no bound. */
function parseBound(v: string): number | undefined {
  const t = v.trim().replace(/,/g, '');
  if (t === '') return undefined;
  const n = parseFloat(t);
  return Number.isFinite(n) ? rupeesToPaisa(n) : undefined;
}

export function LocationCustomerList({ locationId }: Props) {
  const [balance, setBalance] = useState<BalanceFilter>('all');
  const [minRupees, setMinRupees] = useState('');
  const [maxRupees, setMaxRupees] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('balance_desc');

  const { rows, isLoading } = useCustomersByLocation(locationId, {
    balance,
    minBalancePaisa: parseBound(minRupees),
    maxBalancePaisa: parseBound(maxRupees),
    search,
    sort,
  });

  const totalDue = rows.reduce(
    (sum, c) => sum + (c.current_balance_paisa > 0 ? c.current_balance_paisa : 0),
    0,
  );

  return (
    <div className="space-y-3 pb-16 md:pb-0">
      {/* Filter bar — sticky under the app header on mobile */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-3 md:mx-0 md:px-0 md:py-0 bg-gray-50 md:bg-transparent space-y-2.5 md:static">
        {/* Balance chips */}
        <div className="flex gap-2 overflow-x-auto">
          {balanceFilters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setBalance(f)}
              className={[
                'h-9 px-3.5 rounded-full border text-sm font-medium whitespace-nowrap transition-colors shrink-0',
                balance === f
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {BALANCE_FILTER_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Search + range + sort */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-40">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search shops…"
              className="w-full h-10 pl-8 pr-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <input
            value={minRupees}
            onChange={(e) => setMinRupees(e.target.value)}
            placeholder="Min Rs."
            inputMode="decimal"
            className="w-24 h-10 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            value={maxRupees}
            onChange={(e) => setMaxRupees(e.target.value)}
            placeholder="Max Rs."
            inputMode="decimal"
            className="w-24 h-10 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-10 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-center py-10 text-sm text-gray-400">
          No customers match these filters.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <div
              key={c.customer_id}
              className="flex items-center gap-3 bg-white rounded-2xl border border-gray-200 px-4 py-3"
            >
              <Link href={`/customers/${c.customer_id}`} className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">
                  {c.name}
                  {c.is_defaulter && (
                    <span className="ml-1.5 text-[10px] font-semibold text-red-600 align-middle">
                      DEFAULTER
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {c.last_activity
                    ? `Last activity ${format(parseISO(c.last_activity), 'dd MMM yyyy')}`
                    : 'No activity yet'}
                </p>
              </Link>

              {c.phone && (
                <a
                  href={`tel:${c.phone}`}
                  aria-label={`Call ${c.name}`}
                  className="p-2.5 rounded-xl text-gray-400 hover:text-blue-600 hover:bg-blue-50 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Phone size={16} />
                </a>
              )}

              <Link
                href={`/customers/${c.customer_id}`}
                className="text-right shrink-0 text-sm font-mono min-w-24"
              >
                <BalanceAmount paisa={c.current_balance_paisa} />
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Summary footer — sticky at the bottom on mobile */}
      <div className="fixed md:static bottom-0 inset-x-0 md:inset-x-auto bg-white md:bg-gray-100 border-t md:border md:border-gray-200 md:rounded-2xl px-4 py-3 flex items-center justify-between gap-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] md:shadow-none">
        <span className="text-xs md:text-sm text-gray-600">
          Showing {rows.length} {rows.length === 1 ? 'customer' : 'customers'}
        </span>
        <span className="text-sm font-semibold">
          Total Due:{' '}
          <span className={totalDue > 0 ? 'text-red-600 font-mono' : 'text-green-600 font-mono'}>
            {formatPKR(totalDue)}
          </span>
        </span>
      </div>
    </div>
  );
}
