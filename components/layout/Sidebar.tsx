'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Users, Package, Warehouse, Truck,
  FileText, CreditCard, Receipt, TrendingUp,
  Banknote, BookOpen, BarChart3, UserCog, HardDrive, Settings, X,
} from 'lucide-react';
import { can, type Role } from '@/lib/auth/permissions';

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  permission?: Parameters<typeof can>[1];
  adminOnly?: boolean;
  /** Show only for these roles; checked before `permission`. */
  roles?: Role[];
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',   href: '/dashboard',   icon: LayoutDashboard },
  { label: 'Customers',   href: '/customers',   icon: Users,       permission: 'customers.view' },
  { label: 'Products',    href: '/products',    icon: Package,     permission: 'products.view' },
  { label: 'Suppliers',   href: '/suppliers',   icon: Truck,       roles: ['admin', 'accountant', 'staff'] },
  { label: 'Stock',       href: '/stock',       icon: Warehouse,   permission: 'stock.view' },
  { label: 'Invoices',    href: '/invoices',    icon: FileText,    permission: 'invoices.view' },
  { label: 'Payments',    href: '/payments',    icon: CreditCard,  permission: 'payments.view' },
  { label: 'Expenses',    href: '/expenses',    icon: Receipt,     permission: 'expenses.view' },
  { label: 'Investments', href: '/investments', icon: TrendingUp,  adminOnly: true },
  { label: 'Loans',       href: '/loans',       icon: Banknote,    adminOnly: true },
  { label: 'Ledger',      href: '/ledger',      icon: BookOpen,    permission: 'ledger.view' },
  { label: 'Reports',     href: '/reports',     icon: BarChart3,   permission: 'reports.view_basic' },
  { label: 'Settings',    href: '/settings',         icon: Settings,  adminOnly: true },
  { label: 'Users',       href: '/settings/users',   icon: UserCog,   adminOnly: true },
  { label: 'Backup',      href: '/settings/backup',  icon: HardDrive, adminOnly: true },
];

type Props = {
  role: Role;
  open: boolean;
  onClose: () => void;
};

export function Sidebar({ role, open, onClose }: Props) {
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly) return role === 'admin';
    if (item.roles) return item.roles.includes(role);
    if (item.permission) return can(role, item.permission);
    return true;
  });

  return (
    <>
      {/* Overlay for mobile */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-200',
          'md:relative md:translate-x-0 md:flex',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200 shrink-0">
          <span className="font-bold text-gray-900 text-sm">Khaliq Oil Co.</span>
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded text-gray-500 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {visibleItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 transition-colors',
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                )}
              >
                <Icon size={18} className="shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
