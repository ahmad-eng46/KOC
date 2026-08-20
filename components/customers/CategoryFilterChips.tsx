'use client';

import { categoryColor } from '@/lib/validators/customer-categories';
import type { CustomerCategory } from '@/lib/queries/customer-categories';

export const UNCATEGORISED = 'uncategorised';

type Props = {
  categories: CustomerCategory[];
  /** '' = all, UNCATEGORISED = no category, else a category id. */
  value: string;
  onChange: (value: string) => void;
  /** How many customers sit in each category, and under no category at all. */
  counts: Map<string, number>;
  uncategorisedCount: number;
};

export function CategoryFilterChips({
  categories, value, onChange, counts, uncategorisedCount,
}: Props) {
  if (categories.length === 0 && uncategorisedCount === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      <Chip label="All" active={value === ''} onClick={() => onChange('')} />

      {categories.map((c) => {
        const count = counts.get(c.id) ?? 0;
        const hex = categoryColor(c.id, c.color);
        return (
          <Chip
            key={c.id}
            label={c.name}
            count={count}
            active={value === c.id}
            onClick={() => onChange(c.id)}
            activeStyle={{ backgroundColor: `${hex}1a`, borderColor: hex, color: hex }}
          />
        );
      })}

      {/* Only worth offering when there is something to find, and worth
          flagging when there is — uncategorised customers are the ones the
          owner has not got round to filing. */}
      {uncategorisedCount > 0 && (
        <Chip
          label="Uncategorized"
          count={uncategorisedCount}
          active={value === UNCATEGORISED}
          onClick={() => onChange(UNCATEGORISED)}
          warning
        />
      )}
    </div>
  );
}

function Chip({
  label, count, active, onClick, warning, activeStyle,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  warning?: boolean;
  activeStyle?: React.CSSProperties;
}) {
  const base = 'shrink-0 inline-flex items-center gap-1.5 px-3 h-11 sm:h-8 rounded-full border text-xs font-medium whitespace-nowrap';

  const className = active
    ? warning
      ? `${base} bg-amber-50 border-amber-300 text-amber-700`
      : activeStyle
        ? base
        : `${base} bg-blue-50 border-blue-300 text-blue-700`
    : warning
      ? `${base} bg-white border-amber-200 text-amber-700 hover:bg-amber-50`
      : `${base} bg-white border-gray-300 text-gray-600 hover:bg-gray-50`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={className}
      style={active && activeStyle && !warning ? activeStyle : undefined}
    >
      {label}
      {count !== undefined && (
        <span className={active ? 'opacity-70' : 'text-gray-400'}>{count}</span>
      )}
    </button>
  );
}
