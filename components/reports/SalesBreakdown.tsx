'use client';

import { format, parseISO } from 'date-fns';
import { formatPKR } from '@/lib/money';
import { byProduct, trendOf, type SalesLine } from '@/lib/sales-analytics';
import { formatQty } from './analytics/OverviewCards';
import { TrendMark } from './analytics/ProductSalesTable';

/**
 * What sold, once a brand is chosen but no single product. Percentages are of
 * the filtered total, not of all sales — the table is answering "within Double
 * Horse, what moved".
 */
export function ProductBreakdown({
  lines, previousLines, title,
}: {
  lines: SalesLine[];
  previousLines: SalesLine[];
  title: string;
}) {
  const rows = byProduct(lines);
  const previousById = new Map(byProduct(previousLines).map((r) => [r.id, r.salesPaisa]));

  const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
  const totalSales = rows.reduce((s, r) => s + r.salesPaisa, 0);

  if (rows.length === 0) {
    return <EmptyPanel title={title} message="Nothing sold in this period." />;
  }

  return (
    <Panel title={title}>
      <table className="w-full text-sm min-w-[34rem]">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Product</th>
            <th className="text-right px-4 py-2.5 font-medium text-gray-600">Qty</th>
            <th className="text-right px-4 py-2.5 font-medium text-gray-600">Amount</th>
            <th className="text-right px-4 py-2.5 font-medium text-gray-600">% of total</th>
            <th className="text-center px-4 py-2.5 font-medium text-gray-600">Trend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2.5 font-medium text-gray-900">{r.name}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatQty(r.quantity)}</td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatPKR(r.salesPaisa)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                {r.sharePercent.toFixed(1)}%
              </td>
              <td className="px-4 py-2.5 text-center">
                <TrendMark trend={trendOf(r.salesPaisa, previousById.get(r.id) ?? 0)} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-50 border-t border-gray-200">
          <tr>
            <td className="px-4 py-2.5 font-semibold text-gray-900">Total</td>
            <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatQty(totalQty)}</td>
            <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
              {formatPKR(totalSales)}
            </td>
            <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-gray-600">100%</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </Panel>
  );
}

/** Every line for one product: which invoice, which customer, how much. */
export function InvoiceBreakdown({
  lines, title,
}: {
  lines: SalesLine[];
  title: string;
}) {
  const rows = [...lines].sort((a, b) => b.issue_date.localeCompare(a.issue_date));
  const invoiceCount = new Set(rows.map((r) => r.invoice_id)).size;
  const totalQty = rows.reduce((s, r) => s + r.net_quantity, 0);
  const totalSales = rows.reduce((s, r) => s + r.net_amount_paisa, 0);

  if (rows.length === 0) {
    return <EmptyPanel title={title} message="This product did not sell in this period." />;
  }

  return (
    <Panel title={title}>
      <table className="w-full text-sm min-w-[34rem]">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Date</th>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Invoice</th>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Customer</th>
            <th className="text-right px-4 py-2.5 font-medium text-gray-600">Qty</th>
            <th className="text-right px-4 py-2.5 font-medium text-gray-600">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.line_item_id}>
              <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                {format(parseISO(r.issue_date), 'dd MMM')}
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-gray-900">{r.invoice_number}</td>
              <td className="px-4 py-2.5 text-gray-900 truncate">{r.customer_name ?? '—'}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {formatQty(r.net_quantity)}
                {r.returned_quantity > 0 && (
                  <span className="block text-xs text-amber-700">
                    {formatQty(r.returned_quantity)} returned
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                {formatPKR(r.net_amount_paisa)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-50 border-t border-gray-200">
          <tr>
            <td className="px-4 py-2.5 font-semibold text-gray-900">Total</td>
            <td className="px-4 py-2.5 text-gray-600" colSpan={2}>
              {invoiceCount} invoice{invoiceCount === 1 ? '' : 's'}
            </td>
            <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatQty(totalQty)}</td>
            <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
              {formatPKR(totalSales)}
            </td>
          </tr>
        </tfoot>
      </table>
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <h3 className="text-sm font-semibold text-gray-900 p-4 border-b border-gray-200">{title}</h3>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function EmptyPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <h3 className="text-sm font-semibold text-gray-900 p-4 border-b border-gray-200">{title}</h3>
      <p className="text-center py-8 text-sm text-gray-400">{message}</p>
    </div>
  );
}
