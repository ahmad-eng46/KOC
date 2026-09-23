'use client';

import { ArrowRight } from 'lucide-react';
import { formatPKR } from '@/lib/money';

/**
 * What an edit request would change, field by field, before and after.
 *
 * An admin deciding a request is being asked to agree to specific values, so
 * "record updated" is not enough to decide on — the point of the screen is to
 * show the movement. Values are rendered by what the field IS rather than by
 * its type: a paisa column shown as a raw integer is how Rs. 130.00 reads as
 * 13,000, which is exactly the misreading that matters when money is involved.
 */

type Props = {
  /** The row as it was when the request was filed. */
  before: Record<string, unknown> | null | undefined;
  /** The values the requester wants applied. */
  proposed: Record<string, unknown> | null | undefined;
};

/** Field name → how to read it to a person. */
const LABELS: Record<string, string> = {
  quantity: 'Quantity',
  unit_price_paisa: 'Rate',
  total_paisa: 'Total',
  purchase_date: 'Date',
  notes: 'Notes',
};

function isMoneyField(field: string): boolean {
  return field.endsWith('_paisa');
}

function render(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (isMoneyField(field)) {
    const n = Number(value);
    return Number.isFinite(n) ? formatPKR(n) : String(value);
  }
  if (typeof value === 'number') return String(value);
  return String(value);
}

export function ChangeDiff({ before, proposed }: Props) {
  if (!proposed || Object.keys(proposed).length === 0) return null;

  // Only the fields the request actually names. Showing the whole row would
  // bury the two values the admin is being asked about.
  const fields = Object.keys(proposed);

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/50 overflow-hidden">
      <p className="px-3 py-2 bg-blue-50 border-b border-blue-200 text-[11px] font-semibold text-blue-800 uppercase tracking-wide">
        Requested changes
      </p>
      <ul className="divide-y divide-blue-100">
        {fields.map((field) => {
          const from = before ? before[field] : undefined;
          const to = proposed[field];
          const unchanged = String(from ?? '') === String(to ?? '');

          return (
            <li key={field} className="px-3 py-2">
              <p className="text-[11px] text-gray-500">{LABELS[field] ?? field}</p>
              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                <span className="text-sm text-gray-500 line-through tabular-nums">
                  {render(field, from)}
                </span>
                <ArrowRight size={13} className="text-blue-500 shrink-0" />
                <span className="text-sm font-medium text-gray-900 tabular-nums">
                  {render(field, to)}
                </span>
                {unchanged && (
                  <span className="text-[11px] text-amber-700">(no change)</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!before && (
        // The view withholds the snapshot from staff and viewer, so a requester
        // reading their own request sees what they asked for but not what it
        // is replacing. Better to say so than to render "—" as if the field
        // had been empty.
        <p className="px-3 py-2 text-[11px] text-gray-500 border-t border-blue-100">
          The previous values are visible to admins only.
        </p>
      )}
    </div>
  );
}
