'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard, MapPin, Users, Package, Warehouse, Truck,
  FileText, CreditCard, Receipt, TrendingUp,
  Banknote, BookOpen, BarChart3, PieChart, UserCog, HardDrive, Settings, Activity, ShieldCheck, X,
} from 'lucide-react';
import { can, type Permission, type Role } from '@/lib/auth/permissions';
import { usePendingRequestCount } from '@/lib/queries/deletion-requests';

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  permission?: Permission;
  adminOnly?: boolean;
  /** Show only for these roles; checked before `permission`. */
  roles?: Role[];
  /** Names a live counter to render beside the label. */
  badge?: 'pendingApprovals';
  /** The page_definitions key that governs this link. */
  pageKey?: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',   href: '/dashboard',   icon: LayoutDashboard , pageKey: 'dashboard' },
  // Everyone sees this: admins to decide, everyone else to follow their own
  // requests. RLS decides which rows each of them gets.
  { label: 'Approvals',   href: '/approvals',   icon: ShieldCheck, badge: 'pendingApprovals' , pageKey: 'approvals' },
  { label: 'Locations',   href: '/locations',   icon: MapPin , pageKey: 'locations' },
  { label: 'Customers',   href: '/customers',   icon: Users,       permission: 'customers.view' , pageKey: 'customers' },
  { label: 'Products',    href: '/products',    icon: Package,     permission: 'products.view' , pageKey: 'products' },
  { label: 'Suppliers',   href: '/suppliers',   icon: Truck,       roles: ['admin', 'accountant', 'staff'] , pageKey: 'suppliers' },
  { label: 'Stock',       href: '/stock',       icon: Warehouse,   permission: 'stock.view' , pageKey: 'stock' },
  { label: 'Invoices',    href: '/invoices',    icon: FileText,    permission: 'invoices.view' , pageKey: 'invoices' },
  { label: 'Payments',    href: '/payments',    icon: CreditCard,  permission: 'payments.view' , pageKey: 'payments' },
  { label: 'Expenses',    href: '/expenses',    icon: Receipt,     permission: 'expenses.view' , pageKey: 'expenses' },
  { label: 'Investments', href: '/investments', icon: TrendingUp,  adminOnly: true , pageKey: 'investments' },
  { label: 'Loans',       href: '/loans',       icon: Banknote,    adminOnly: true , pageKey: 'loans' },
  { label: 'Ledger',      href: '/ledger',      icon: BookOpen,    permission: 'ledger.view' , pageKey: 'ledger' },
  { label: 'Reports',     href: '/reports',     icon: BarChart3,   permission: 'reports.view_basic' , pageKey: 'reports.sales' },
  { label: 'Sales Analytics', href: '/reports/sales-analytics', icon: PieChart, permission: 'reports.view' , pageKey: 'reports.analytics' },
  { label: 'Settings',    href: '/settings',         icon: Settings,  adminOnly: true , pageKey: 'settings' },
  { label: 'Users',       href: '/settings/users',   icon: UserCog,   adminOnly: true , pageKey: 'users' },
  { label: 'Backup',      href: '/settings/backup',  icon: HardDrive, adminOnly: true , pageKey: 'backup' },
  { label: 'Activity Log', href: '/settings/activity-log', icon: Activity, roles: ['admin', 'accountant'] , pageKey: 'settings' },
];

type Props = {
  role: Role;
  /**
   * The user's effective permissions — role defaults with their overrides
   * applied, resolved on the server. Absent means "role only", which is what
   * `can()` answers.
   */
  permissions?: Permission[];
  /** page key → allowed, resolved server-side. Absent falls back to role rules. */
  pageAccess?: Record<string, boolean>;
  open: boolean;
  onClose: () => void;
};

export function Sidebar({ role, permissions, pageAccess, open, onClose }: Props) {
  const pathname = usePathname();
  const { data: pendingApprovals = 0 } = usePendingRequestCount();

  const effective = permissions ? new Set<Permission>(permissions) : null;
  const allows = (p: Permission) => (effective ? effective.has(p) : can(role, p));

  const visibleItems = NAV_ITEMS.filter((item) => {
    // Page access decides first where it has an opinion: it is the admin's
    // explicit choice for this user, and it already accounts for the role
    // default, the permission system and the admin override.
    if (item.pageKey && pageAccess && item.pageKey in pageAccess) {
      return pageAccess[item.pageKey];
    }
    if (item.adminOnly) return role === 'admin';
    if (item.roles) return item.roles.includes(role);
    if (item.permission) return allows(item.permission);
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
                <span className="flex-1">{item.label}</span>
                {item.badge === 'pendingApprovals' && pendingApprovals > 0 && (
                  <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-semibold flex items-center justify-center tabular-nums">
                    {pendingApprovals}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
