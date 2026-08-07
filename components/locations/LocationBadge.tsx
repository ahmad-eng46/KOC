import { MapPin } from 'lucide-react';

/**
 * Small pill naming a customer's city. Renders "No Location" (gray italic)
 * when the customer has no city — including when their city was soft-deleted
 * and the RLS-filtered join returned nothing.
 */
export function LocationBadge({ name }: { name: string | null | undefined }) {
  if (!name) {
    return <span className="text-xs text-gray-400 italic">No Location</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
      <MapPin size={10} />
      {name}
    </span>
  );
}
