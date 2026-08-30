import { requireRole } from '@/lib/auth/guards';
import { LocationReport } from '@/components/reports/LocationReport';

export const metadata = { title: 'Location Report — KOC' };

export default async function LocationReportPage() {
  await requireRole('admin', 'accountant', 'staff');
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Location Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Sales, collections and outstanding per city
          </p>
        </div>
      </div>
      <LocationReport />
    </div>
  );
}
