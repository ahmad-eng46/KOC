import Link from 'next/link';
import { TrendingUp, Banknote, AlertCircle, Package } from 'lucide-react';
import { requireAuth } from '@/lib/auth/guards';
import { fetchDashboardData } from '@/lib/dashboard';
import { formatPKR } from '@/lib/money';
import { formatKarachi } from '@/lib/date';

export const metadata = { title: 'Dashboard — KOC' };

// Figures must reflect invoices raised seconds ago, so never serve a cached page.
export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  issued:         { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Unpaid'    },
  partially_paid: { bg: 'bg-blue-50',  text: 'text-blue-700',  label: 'Partial'   },
  paid:           { bg: 'bg-green-50', text: 'text-green-700', label: 'Paid'      },
  cancelled:      { bg: 'bg-red-50',   text: 'text-red-700',   label: 'Cancelled' },
};

export default async function DashboardPage() {
  await requireAuth();
  const data = await fetchDashboardData();

  const cards = [
    {
      label: "Today's Sales",
      value: formatPKR(data.today_sales_paisa),
      hint: `${data.today_invoice_count} invoice${data.today_invoice_count === 1 ? '' : 's'}`,
      icon: TrendingUp,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      href: '/invoices',
    },
    {
      label: "Today's Cash",
      value: formatPKR(data.today_cash_paisa),
      hint: `${data.today_payment_count} payment${data.today_payment_count === 1 ? '' : 's'}`,
      icon: Banknote,
      color: 'text-green-600',
      bg: 'bg-green-50',
      href: '/payments',
    },
    {
      label: 'Outstanding',
      value: formatPKR(data.outstanding_paisa),
      hint: `${data.outstanding_invoice_count} unpaid invoice${data.outstanding_invoice_count === 1 ? '' : 's'}`,
      icon: AlertCircle,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      href: '/reports/defaulters',
    },
    {
      label: 'Low Stock Items',
      value: String(data.low_stock.length),
      hint: data.low_stock.length === 0 ? 'all above threshold' : 'at or below threshold',
      icon: Package,
      color: 'text-red-600',
      bg: 'bg-red-50',
      href: '/stock',
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {formatKarachi(data.today, 'EEEE, dd MMM yyyy')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              href={card.href}
              className="bg-white rounded-2xl border border-gray-200 p-4 hover:border-gray-300 transition-colors"
            >
              <div className={`inline-flex p-2 rounded-xl ${card.bg} mb-3`}>
                <Icon size={18} className={card.color} />
              </div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums wrap-break-word">
                {card.value}
              </p>
              <p className="text-xs text-gray-500 mt-1">{card.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{card.hint}</p>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="bg-white rounded-2xl border border-gray-200 lg:col-span-2">
          <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Recent invoices</h2>
            <Link href="/invoices" className="text-xs font-medium text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </header>

          {data.recent_invoices.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">No invoices yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.recent_invoices.map((inv) => {
                const style = STATUS_STYLE[inv.status] ?? STATUS_STYLE.issued;
                return (
                  <li key={inv.id}>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {inv.customer_name}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {inv.invoice_number} · {formatKarachi(inv.issue_date)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-gray-900 tabular-nums">
                          {formatPKR(inv.total_paisa)}
                        </p>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 ${style.bg} ${style.text}`}
                        >
                          {style.label}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-gray-200">
          <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Low stock</h2>
            <Link href="/stock" className="text-xs font-medium text-blue-600 hover:text-blue-700">
              Stock
            </Link>
          </header>

          {data.low_stock.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">
              Everything is above its threshold.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {data.low_stock.slice(0, 8).map((s) => (
                <li key={s.product_id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {s.sku ?? '—'} · threshold {s.low_stock_threshold ?? 0}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-semibold tabular-nums shrink-0 ${
                      s.quantity_on_hand < 0 ? 'text-red-600' : 'text-gray-900'
                    }`}
                  >
                    {s.quantity_on_hand}
                    {s.unit ? <span className="text-xs text-gray-400 ml-1">{s.unit}</span> : null}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {data.low_stock.length > 8 && (
            <p className="px-4 py-2.5 text-xs text-gray-500 border-t border-gray-100">
              +{data.low_stock.length - 8} more
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
