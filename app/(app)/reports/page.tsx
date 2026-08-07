import Link from 'next/link';
import {
  TrendingUp, ShoppingCart, Users, Wallet, BarChart3,
  AlertTriangle, Package, BookOpen, ScrollText, MapPin,
} from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const metadata = { title: 'Reports — KOC' };

type ReportTile = {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
  permission?: Parameters<typeof can>[1];
  adminOnly?: boolean;
};

const TILES: ReportTile[] = [
  { href: '/reports/sales', title: 'Sales', description: 'Invoices by day, top customers', icon: TrendingUp, permission: 'reports.view_basic' },
  { href: '/reports/purchase', title: 'Purchase', description: 'Stock-in movements with cost', icon: ShoppingCart, permission: 'reports.view' },
  { href: '/reports/customer', title: 'Customer', description: 'Per-customer invoiced / paid / balance', icon: Users, permission: 'reports.view_basic' },
  { href: '/reports/balance', title: 'Receivables', description: 'Customers with balance > 0, aging buckets', icon: Wallet, permission: 'reports.view_basic' },
  { href: '/reports/pl', title: 'Profit & Loss', description: 'Sales − COGS − Expenses', icon: BarChart3, permission: 'reports.pnl' },
  { href: '/reports/defaulters', title: 'Defaulters', description: 'Inactive customers with outstanding balance', icon: AlertTriangle, permission: 'reports.view_basic' },
  { href: '/reports/locations', title: 'Locations', description: 'Sales, collections and outstanding per city', icon: MapPin, permission: 'reports.view' },
  { href: '/reports/stock', title: 'Stock', description: 'Current quantities + value at cost', icon: Package, permission: 'reports.view' },
  { href: '/reports/cash-book', title: 'Daily Cash Book', description: 'Cash in vs cash out, closing balance', icon: BookOpen, permission: 'reports.view' },
  { href: '/reports/audit', title: 'Audit Log', description: 'Every change to financial data', icon: ScrollText, adminOnly: true },
];

export default async function ReportsPage() {
  await requireRole('admin', 'accountant', 'staff', 'viewer');
  const session = await getSession();
  const role = session?.role ?? 'viewer';

  const visible = TILES.filter((t) => {
    if (t.adminOnly) return role === 'admin';
    if (t.permission) return can(role, t.permission);
    return true;
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Financial and operational reports</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visible.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className="rounded-2xl border border-gray-200 bg-white p-4 hover:border-blue-400 hover:bg-blue-50/30 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-100">
                  <Icon size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900">{t.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
