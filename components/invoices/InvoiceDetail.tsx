'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  Printer, MessageSquare, Trash2, CheckCircle2, RotateCcw, Download, X as CloseIcon,
} from 'lucide-react';
import { useInvoiceDetail } from '@/lib/queries/invoice-detail';
import { useBusinessStore } from '@/lib/store/business';
import { formatPKR } from '@/lib/money';
import { softDeleteInvoice, markInvoicePaid } from '@/lib/actions/invoice-detail';
import { can, type Role } from '@/lib/auth/permissions';
import { InvoicePDF } from './InvoicePDF';

// react-pdf is heavy and uses browser-only APIs — load only on client.
const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then((mod) => mod.PDFDownloadLink),
  { ssr: false, loading: () => <PDFButton label="Loading…" disabled /> },
);

type Props = { invoiceId: string; role: Role };

export function InvoiceDetail({ invoiceId, role }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);
  const { data: invoice, isLoading, error } = useInvoiceDetail(invoiceId);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [acting, setActing] = useState<'mark-paid' | 'delete' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }
  if (error || !invoice) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-4">
        <p className="text-sm text-red-700">Invoice not found or you don't have access.</p>
      </div>
    );
  }

  const balance = invoice.total_paisa - invoice.paid_paisa;
  const canDelete = role === 'admin';
  const canMarkPaid = can(role, 'payments.create') && balance > 0 && invoice.status !== 'cancelled';
  const canReturn = can(role, 'returns.create');

  async function onMarkPaid() {
    if (!confirm(`Mark invoice ${invoice!.invoice_number} as fully paid? This will record a cash payment for ${formatPKR(balance)}.`)) return;
    setActing('mark-paid');
    setActionError(null);
    const r = await markInvoicePaid(invoice!.id);
    if (!r.ok) {
      setActionError(r.error);
      setActing(null);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['invoice-detail', activeId, invoice!.id] });
    await queryClient.invalidateQueries({ queryKey: ['invoices', activeId] });
    await queryClient.invalidateQueries({ queryKey: ['customers-with-balance', activeId] });
    setActing(null);
  }

  async function onDelete() {
    setActing('delete');
    setActionError(null);
    const r = await softDeleteInvoice(invoice!.id, deleteReason);
    if (!r.ok) {
      setActionError(r.error);
      setActing(null);
      return;
    }
    setDeleteOpen(false);
    router.push('/invoices');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Invoice</p>
            <h2 className="font-mono text-2xl font-semibold text-gray-900 mt-0.5">
              {invoice.invoice_number}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {format(parseISO(invoice.issue_date), 'dd MMM yyyy')}
              {invoice.due_date && (
                <> · Due {format(parseISO(invoice.due_date), 'dd MMM yyyy')}</>
              )}
            </p>
          </div>
          <StatusBadge status={invoice.status} />
        </div>

        <div className="mt-5 grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Bill To</p>
            <Link
              href={`/customers/${invoice.customer_id}`}
              className="text-sm font-medium text-blue-600 hover:underline mt-0.5 block"
            >
              {invoice.customer_name}
            </Link>
            {invoice.customer_phone && (
              <p className="text-xs text-gray-500">{invoice.customer_phone}</p>
            )}
            {invoice.customer_address && (
              <p className="text-xs text-gray-500">{invoice.customer_address}</p>
            )}
          </div>
          <div className="sm:text-right">
            <p className="text-xs uppercase tracking-wide text-gray-500">Balance Due</p>
            <p
              className={[
                'text-2xl font-mono font-semibold mt-0.5 tabular-nums',
                balance > 0 ? 'text-red-600' : 'text-green-700',
              ].join(' ')}
            >
              {formatPKR(balance)}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <PDFDownloadLink
          document={<InvoicePDF invoice={invoice} />}
          fileName={`${invoice.invoice_number}.pdf`}
        >
          {(props) => {
            const isLoading = 'loading' in props ? props.loading : false;
            return (
              <PDFButton
                label={isLoading ? 'Generating…' : 'Print PDF'}
                disabled={isLoading}
              />
            );
          }}
        </PDFDownloadLink>

        <button
          type="button"
          disabled
          title="SMS / WhatsApp coming in Piece 10"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-500 bg-white opacity-50 cursor-not-allowed"
        >
          <MessageSquare size={14} />
          Send (Piece 10)
        </button>

        {canMarkPaid && (
          <button
            type="button"
            onClick={onMarkPaid}
            disabled={acting !== null}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle2 size={14} />
            {acting === 'mark-paid' ? 'Recording…' : `Mark Paid (${formatPKR(balance)})`}
          </button>
        )}

        {canReturn && (
          <Link
            href={`/invoices/${invoice.id}/return`}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <RotateCcw size={14} />
            Process Return
          </Link>
        )}

        {canDelete && (
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            disabled={acting !== null}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-red-200 text-sm font-medium text-red-600 bg-white hover:bg-red-50 ml-auto disabled:opacity-50"
          >
            <Trash2 size={14} />
            Delete
          </button>
        )}
      </div>

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}

      {/* Items */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm min-w-[34rem]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Item</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Qty</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Rate</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {invoice.items.map((it) => (
              <tr key={it.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{it.product_name}</p>
                  {it.sku && <p className="text-xs text-gray-500">{it.sku}</p>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {it.quantity} {it.unit}
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-700">
                  {formatPKR(it.unit_price_paisa)}
                </td>
                <td className="px-4 py-3 text-right font-mono font-medium">
                  {formatPKR(it.line_total_paisa)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr>
              <td colSpan={3} className="px-4 py-2 text-right text-sm text-gray-600">Subtotal</td>
              <td className="px-4 py-2 text-right font-mono text-sm">{formatPKR(invoice.subtotal_paisa)}</td>
            </tr>
            {invoice.discount_paisa > 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right text-sm text-gray-600">Discount</td>
                <td className="px-4 py-2 text-right font-mono text-sm text-gray-600">
                  − {formatPKR(invoice.discount_paisa)}
                </td>
              </tr>
            )}
            <tr className="border-t border-gray-200">
              <td colSpan={3} className="px-4 py-3 text-right font-semibold text-gray-900">Total</td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900 text-base">
                {formatPKR(invoice.total_paisa)}
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="px-4 py-2 text-right text-sm text-gray-600">Paid</td>
              <td className="px-4 py-2 text-right font-mono text-sm">{formatPKR(invoice.paid_paisa)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="px-4 py-2 text-right font-semibold text-gray-900">Balance</td>
              <td
                className={[
                  'px-4 py-2 text-right font-mono font-semibold',
                  balance > 0 ? 'text-red-600' : 'text-gray-700',
                ].join(' ')}
              >
                {formatPKR(balance)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Payments */}
      {invoice.payments.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Payments Received</h3>
          <ul className="divide-y divide-gray-100">
            {invoice.payments.map((p) => (
              <li key={p.id} className="py-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-900">
                    {format(parseISO(p.payment_date), 'dd MMM yyyy')} ·{' '}
                    <span className="capitalize">{p.method.replace('_', ' ')}</span>
                  </p>
                  {p.reference && <p className="text-xs text-gray-500">Ref: {p.reference}</p>}
                </div>
                <p className="font-mono text-sm font-medium">{formatPKR(p.amount_paisa)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Returns */}
      {invoice.returns.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Returns</h3>
          <ul className="divide-y divide-gray-100">
            {invoice.returns.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-sm text-gray-900">{r.return_number}</p>
                  <p className="text-xs text-gray-500">{format(parseISO(r.return_date), 'dd MMM yyyy')}</p>
                </div>
                <p className="font-mono text-sm font-medium text-gray-700">
                  − {formatPKR(r.total_paisa)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Notes */}
      {invoice.notes && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1">Notes</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}

      {/* Delete modal */}
      {deleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteOpen(false); }}
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Delete invoice?</h2>
              <button
                onClick={() => setDeleteOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-700">
                Soft-delete <span className="font-mono font-semibold">{invoice.invoice_number}</span>?
                The ledger debit will remain — file a return if you also need to reverse the customer's balance.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="e.g. Duplicated entry, customer cancelled, data-entry error"
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteOpen(false)}
                  disabled={acting === 'delete'}
                  className="flex-1 h-10 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={acting === 'delete' || !deleteReason.trim()}
                  className="flex-1 h-10 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {acting === 'delete' ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PDFButton({ label, disabled }: { label: string; disabled?: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50',
        disabled ? 'opacity-50 cursor-wait' : 'cursor-pointer',
      ].join(' ')}
    >
      {disabled ? <Download size={14} /> : <Printer size={14} />}
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; text: string; label: string }> = {
    draft:           { bg: 'bg-gray-100', text: 'text-gray-600',  label: 'Draft' },
    issued:          { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Unpaid' },
    partially_paid:  { bg: 'bg-blue-50',  text: 'text-blue-700',  label: 'Partial' },
    paid:            { bg: 'bg-green-50', text: 'text-green-700', label: 'Paid' },
    cancelled:       { bg: 'bg-red-50',   text: 'text-red-700',   label: 'Cancelled' },
  };
  const c = cfg[status] ?? cfg.draft;
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}
