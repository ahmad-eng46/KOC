import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { LoanForm } from '@/components/loans/LoanForm';

export const metadata = { title: 'New Loan — KOC' };

export default async function NewLoanPage() {
  await requireRole('admin');
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/loans" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">New Loan</h1>
          <p className="text-sm text-gray-500 mt-0.5">Record a loan given or taken</p>
        </div>
      </div>
      <LoanForm />
    </div>
  );
}
