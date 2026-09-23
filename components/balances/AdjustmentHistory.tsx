'use client';

import { Scale, ArrowRight } from 'lucide-react';
import { usePartyAdjustments } from '@/lib/queries/activity-log';
import { relativeTime } from '@/lib/activity-display';
import { formatPKR } from '@/lib/money';

/**
 * Every manual correction made to this party's balance, on the party's own
 * page rather than only in the audit screen.
 *
 * The reason it belongs here: someone looking at an account that does not add
 * up should not have to know that an audit screen exists, or go looking. If a
 * balance was corrected by hand, that fact belongs beside the balance.
 *
 * Renders nothing at all when there are no corrections — which is the normal
 * case, and an empty "no adjustments" panel on every account would be noise.
 */
export function AdjustmentHistory({
  party, partyId,
}: {
  party: 'customer' | 'supplier';
  partyId: string;
}) {
  const { data: entries = [], isLoading } = usePartyAdjustments(party, partyId);

  if (isLoading || entries.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
        <Scale size={14} className="text-amber-700" />
        <h3 className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
          Manual balance corrections
        </h3>
      </div>

      <ul className="divide-y divide-gray-100">
        {entries.map((e) => {
          const m = e.metadata ?? {};
          const oldValue = Number(m.old_value_paisa ?? NaN);
          const newValue = Number(m.new_value_paisa ?? NaN);
          const hasMovement = Number.isFinite(oldValue) && Number.isFinite(newValue);
          const field = typeof m.field === 'string' ? m.field : 'outstanding';
          const reason = typeof m.reason === 'string' ? m.reason : null;
          const effective = typeof m.effective_date === 'string' ? m.effective_date : null;

          return (
            <li key={e.id} className="px-4 py-3">
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-700">{e.user_name}</span>
                {' · '}
                {relativeTime(e.created_at)}
                {effective && <span> · effective {effective}</span>}
              </p>

              <p className="mt-0.5 text-xs text-gray-500 uppercase tracking-wide">
                {field === 'opening' ? 'Opening balance' : 'Outstanding balance'}
              </p>

              {hasMovement && (
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm tabular-nums">
                  <span className="text-gray-500 line-through">{formatPKR(oldValue)}</span>
                  <ArrowRight size={12} className="text-gray-400 shrink-0" />
                  <span className="font-medium text-gray-900">{formatPKR(newValue)}</span>
                </div>
              )}

              {reason && (
                <p className="mt-1 text-xs text-gray-600 italic">&ldquo;{reason}&rdquo;</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
