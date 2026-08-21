import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { SalesReport } from '@/components/reports/SalesReport';

export const metadata = { title: 'Sales Report — KOC' };

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; product?: string }>;
}) {
  await requireRole('admin', 'accountant', 'staff', 'viewer');
  const { brand, product } = await searchParams;
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"><ChevronLeft size={18} /></Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sales Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Invoices over time + top customers</p>
        </div>
      </div>
      <SalesReport initialBrand={brand ?? ''} initialProduct={product ?? ''} />
    </div>
  );
}
