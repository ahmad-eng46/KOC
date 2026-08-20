import { categoryColor } from '@/lib/validators/customer-categories';

/**
 * Small pill naming a customer's category. Renders "No category" (gray italic)
 * when there is none — including when the category was soft-deleted and the
 * RLS-filtered join returned nothing, which is the same shape LocationBadge
 * handles for cities.
 *
 * The colour tints a soft background rather than filling the pill, so the badge
 * stays quieter than the customer's name beside it.
 */
export function CategoryBadge({
  name,
  color,
  id,
}: {
  name: string | null | undefined;
  color?: string | null;
  /** Used only to pick a stable fallback colour when none is stored. */
  id?: string | null;
}) {
  if (!name) {
    return <span className="text-xs text-gray-400 italic">No category</span>;
  }

  const hex = categoryColor(id ?? name, color);

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${hex}1a`, color: hex }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: hex }} aria-hidden />
      {name}
    </span>
  );
}
