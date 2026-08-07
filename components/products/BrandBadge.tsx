import type { BrandType } from '@/lib/validators/brands';

/**
 * Small brand pill on product rows. Purple = multinational, coral = local
 * dealer, subtle gray italic text (no pill) when unbranded — it must never
 * outweigh the product name.
 */
export function BrandBadge({
  name, type,
}: { name: string | null | undefined; type: BrandType | null | undefined }) {
  if (!name) {
    return <span className="text-xs text-gray-400 italic">No brand</span>;
  }
  const styles =
    type === 'local_dealer'
      ? 'bg-orange-50 text-orange-800'
      : 'bg-purple-50 text-purple-800';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${styles}`}>
      {name}
    </span>
  );
}
