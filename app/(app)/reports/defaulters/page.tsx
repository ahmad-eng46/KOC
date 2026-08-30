import { requireRole } from '@/lib/auth/guards';
import { DefaultersReport } from '@/components/reports/DefaultersReport';

export const metadata = { title: 'Defaulters — KOC' };

export default async function DefaultersReportPage() {
  await requireRole('admin', 'accountant', 'staff', 'viewer');
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Defaulter List</h1>
          <p className="text-sm text-gray-500 mt-0.5">Customers with outstanding balance + extended inactivity</p>
        </div>
      </div>
      <DefaultersReport />
    </div>
  );
}
