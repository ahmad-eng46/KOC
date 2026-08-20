'use client';

import { X } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { formatPKR } from '@/lib/money';
import { formatStock } from '@/lib/pack';
import { useProductSalesDetail } from '@/lib/queries/sales-analytics';
import { lastSaleByKey, type ProductPeriodRow } from '@/lib/sales-analytics';
import { formatQty } from './OverviewCards';

export function ProductDetailPanel({
  product, canSeeCost, onClose,
}: {
  product: ProductPeriodRow;
  canSeeCost: boolean;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useProductSalesDetail(product.product_id);

  const periods = [
    { label: '7 Days', qty: product.qty_7d, amount: product.sales_7d_paisa },
    { label: '15 Days', qty: product.qty_15d, amount: product.sales_15d_paisa },
    { label: '30 Days', qty: product.qty_30d, amount: product.sales_30d_paisa },
    { label: '90 Days', qty: product.qty_90d, amount: product.sales_90d_paisa },
    { label: 'All Time', qty: product.qty_all, amount: product.sales_all_paisa },
  ];

  const lastByCustomer = data ? lastSaleByKey(data.lines, (l) => l.customer_id) : new Map<string, string>();

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-gray-50 w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl overflow-y-auto">
        <header className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">{product.product_name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {product.brand_name ?? 'Unbranded'}
              {' · Stock: '}
              {formatStock(product.stock_on_hand, {
                unit: product.product_unit ?? '',
                pack_size: product.pack_size,
                pack_name: product.pack_name,
              })}
              {' · Sale price: '}{formatPKR(product.sale_price_paisa)}
              {canSeeCost && product.purchase_price_paisa !== null && (
                <> · Cost: {formatPKR(product.purchase_price_paisa)}</>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 shrink-0"
          >
            <X size={18} />
          </button>
        </header>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {periods.map((p) => (
              <div key={p.label} className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                <p className="text-xs text-gray-500">{p.label}</p>
                <p className="text-sm font-mono font-semibold tabular-nums text-gray-900 mt-0.5">
                  {formatQty(p.qty)}
                </p>
                <p className="text-xs text-gray-500 tabular-nums">{formatPKR(p.amount)}</p>
              </div>
            ))}
          </div>

          {isLoading && <Spinner />}
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-700">
                {error instanceof Error ? error.message : 'Could not load this product.'}
              </p>
            </div>
          )}

          {data && data.lines.length === 0 && (
            <p className="text-sm text-gray-400 py-6 text-center">
              This product has never appeared on an invoice.
            </p>
          )}

          {data && data.lines.length > 0 && (
            <>
              <Panel title="Monthly trend">
                <div className="h-56 px-2 pb-2">
                  <ResponsiveContainer>
                    <LineChart data={data.monthly.map((p) => ({ ...p, rupees: p.amountPaisa / 100 }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d: string) => format(parseISO(d), 'MMM yy')}
                        fontSize={11}
                      />
                      <YAxis tickFormatter={(n: number) => `${(n / 1000).toFixed(0)}k`} fontSize={11} />
                      <Tooltip
                        formatter={(v) => formatPKR(Math.round(Number(v) * 100))}
                        labelFormatter={(d) => format(parseISO(d as string), 'MMMM yyyy')}
                      />
                      <Line type="monotone" dataKey="rupees" stroke="#2563eb" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel title="By customer">
                <SimpleTable
                  head={['Customer', 'Qty', 'Amount', 'Last purchase']}
                  rows={data.byCustomer.map((c) => [
                    c.name,
                    formatQty(c.quantity),
                    formatPKR(c.salesPaisa),
                    lastByCustomer.get(c.id)
                      ? format(parseISO(lastByCustomer.get(c.id)!), 'dd MMM yyyy')
                      : '—',
                  ])}
                />
              </Panel>

              <Panel title="By location">
                <SimpleTable
                  head={['Location', 'Qty', 'Amount']}
                  rows={data.byLocation.map((l) => [l.name, formatQty(l.quantity), formatPKR(l.salesPaisa)])}
                />
              </Panel>

              <Panel title="Recent invoices">
                <SimpleTable
                  head={['Invoice', 'Date', 'Customer', 'Qty', 'Amount']}
                  rows={data.lines.slice(0, 20).map((l) => [
                    l.invoice_number,
                    format(parseISO(l.issue_date), 'dd MMM yyyy'),
                    l.customer_name ?? '—',
                    formatQty(l.net_quantity),
                    formatPKR(l.net_amount_paisa),
                  ])}
                />
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <h3 className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wide">
        {title}
      </h3>
      {children}
    </section>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: string[][] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">Nothing to show.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100">
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                className={[
                  'px-4 py-2 font-medium text-gray-500 text-xs',
                  i === 0 ? 'text-left' : 'text-right',
                ].join(' ')}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  className={[
                    'px-4 py-2',
                    ci === 0 ? 'text-left text-gray-900' : 'text-right tabular-nums text-gray-700 font-mono text-xs',
                  ].join(' ')}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-24">
      <div className="w-5 h-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
    </div>
  );
}
