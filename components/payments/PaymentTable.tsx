'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { format, parseISO, subDays } from 'date-fns';
import { Search, ChevronLeft, ChevronRight, Plus, Calendar, Trash2, X as XIcon } from 'lucide-react';
import {
  usePayments,
  useDeletePayment,
  type PaymentListRow,
  type PaymentFilters,
} from '@/lib/queries/payments';
import { paymentMethods, type PaymentMethod } from '@/lib/validators/payment';
import { formatPKR } from '@/lib/money';
import type { Role } from '@/lib/auth/permissions';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  online: 'Online',
};

type Props = { role: Role };

function todayISO() { return format(new Date(), 'yyyy-MM-dd'); }
function thirtyDaysAgoISO() { return format(subDays(new Date(), 30), 'yyyy-MM-dd'); }

export function PaymentTable({ role }: Props) {
  const [from, setFrom] = useState(thirtyDaysAgoISO());
  const [to, setTo] = useState(todayISO());
  const [methodFilters, setMethodFilters] = useState<PaymentMethod[]>([]);
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<PaymentListRow | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const filters: PaymentFilters = useMemo(
    () => ({ from, to, methods: methodFilters }),
    [from, to, methodFilters],
  );
  const { data: rows = [], isLoading } = usePayments(filters);
  const deleteMutation = useDeletePayment();

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.customer_name.toLowerCase().includes(q) ||
        (r.reference ?? '').toLowerCase().includes(q) ||
        (r.invoice_number ?? '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totalAmount = useMemo(
    () => filteredRows.reduce((sum, r) => sum + r.amount_paisa, 0),
    [filteredRows],
  );

  const canDelete = role === 'admin';

  const columns = useMemo(() => {
    const ch = createColumnHelper<PaymentListRow>();
    return [
      ch.accessor('payment_date', {
        header: 'Date',
        cell: (info) => format(parseISO(info.getValue()), 'dd MMM yyyy'),
      }),
      ch.accessor('customer_name', {
        header: 'Customer',
        cell: (info) => (
          <Link
            href={`/customers/${info.row.original.customer_id}`}
            className="text-blue-600 hover:underline font-medium"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      ch.accessor('amount_paisa', {
        header: () => <span className="block text-right">Amount</span>,
        cell: (info) => (
          <span className="block text-right font-mono font-medium text-gray-900">
            {formatPKR(info.getValue())}
          </span>
        ),
      }),
      ch.accessor('method', {
        header: 'Method',
        cell: (info) => <span className="capitalize">{METHOD_LABELS[info.getValue()]}</span>,
      }),
      ch.accessor('reference', {
        header: 'Reference',
        cell: (info) => (
          <span className="font-mono text-xs text-gray-500">{info.getValue() ?? '—'}</span>
        ),
      }),
      ch.accessor('invoice_number', {
        header: 'Invoice',
        cell: (info) => {
          const r = info.row.original;
          return r.invoice_id ? (
            <Link
              href={`/invoices/${r.invoice_id}`}
              className="font-mono text-xs text-blue-600 hover:underline"
            >
              {r.invoice_number}
            </Link>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          );
        },
      }),
      ch.display({
        id: 'actions',
        header: () => '',
        cell: (info) =>
          canDelete ? (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setDeleteTarget(info.row.original);
                  setDeleteReason('');
                }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                title="Delete payment"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : null,
      }),
    ];
  }, [canDelete]);

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting, pagination: { pageIndex, pageSize: 20 } },
    onSortingChange: setSorting,
    onPaginationChange: (updater) => {
      const next =
        typeof updater === 'function' ? updater({ pageIndex, pageSize: 20 }) : updater;
      setPageIndex(next.pageIndex);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  function toggleMethod(m: PaymentMethod) {
    setPageIndex(0);
    setMethodFilters((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
  }

  async function confirmDelete() {
    if (!deleteTarget || !deleteReason.trim()) return;
    await deleteMutation.mutateAsync({ id: deleteTarget.id, reason: deleteReason });
    setDeleteTarget(null);
    setDeleteReason('');
  }

  const total = filteredRows.length;
  const pageCount = table.getPageCount();

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <DateInput label="From" value={from} onChange={(v) => { setFrom(v); setPageIndex(0); }} />
          <DateInput label="To" value={to} onChange={(v) => { setTo(v); setPageIndex(0); }} />
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPageIndex(0); }}
                placeholder="Customer, reference, invoice…"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <Link
            href="/payments/new"
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shrink-0"
          >
            <Plus size={15} /> New Payment
          </Link>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 mr-1">Method:</span>
          {paymentMethods.map((m) => (
            <button
              key={m}
              onClick={() => toggleMethod(m)}
              className={[
                'px-3 h-7 text-xs font-medium rounded-full border transition-colors',
                methodFilters.includes(m)
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {METHOD_LABELS[m]}
            </button>
          ))}
          {methodFilters.length > 0 && (
            <button
              onClick={() => setMethodFilters([])}
              className="px-2 h-7 text-xs text-gray-500 hover:text-gray-900"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 mt-4">
          <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden mt-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => (
                      <th key={h.id} className="text-left px-4 py-3 font-medium text-gray-600">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-gray-100">
                {table.getRowModel().rows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length} className="text-center py-10 text-gray-400 text-sm">
                      No payments in this date range.
                    </td>
                  </tr>
                )}
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {filteredRows.length > 0 && (
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={2} className="px-4 py-2 text-right text-xs text-gray-500">Total in range</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold text-gray-900">
                      {formatPKR(totalAmount)}
                    </td>
                    <td colSpan={canDelete ? 4 : 3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-2 mt-4">
            {table.getRowModel().rows.length === 0 && (
              <p className="text-center py-8 text-sm text-gray-400">
                No payments in this date range.
              </p>
            )}
            {table.getRowModel().rows.map((row) => {
              const r = row.original;
              return (
                <div key={r.id} className="bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/customers/${r.customer_id}`}
                        className="font-medium text-gray-900 text-sm truncate block hover:text-blue-600"
                      >
                        {r.customer_name}
                      </Link>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {format(parseISO(r.payment_date), 'dd MMM yyyy')} · {METHOD_LABELS[r.method]}
                      </p>
                      {r.reference && (
                        <p className="text-xs font-mono text-gray-400 mt-0.5">{r.reference}</p>
                      )}
                      {r.invoice_id && r.invoice_number && (
                        <Link
                          href={`/invoices/${r.invoice_id}`}
                          className="text-xs font-mono text-blue-600 hover:underline mt-0.5 inline-block"
                        >
                          {r.invoice_number}
                        </Link>
                      )}
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <p className="text-sm font-mono font-medium text-gray-900">
                        {formatPKR(r.amount_paisa)}
                      </p>
                      {canDelete && (
                        <button
                          onClick={() => { setDeleteTarget(r); setDeleteReason(''); }}
                          className="p-1 rounded text-gray-400 hover:text-red-600"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredRows.length > 0 && (
              <div className="text-right text-xs text-gray-500 px-1 pt-1">
                Total: <span className="font-mono font-semibold text-gray-900">{formatPKR(totalAmount)}</span>
              </div>
            )}
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <span className="text-gray-500">
                {total} payment{total === 1 ? '' : 's'}
              </span>
              {pageCount > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className="p-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs text-gray-600 tabular-nums">
                    Page {pageIndex + 1} / {pageCount}
                  </span>
                  <button
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className="p-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Delete dialog */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Delete payment?</h2>
              <button
                onClick={() => setDeleteTarget(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <XIcon size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-700">
                Soft-delete the {METHOD_LABELS[deleteTarget.method]} payment of{' '}
                <span className="font-mono font-semibold">{formatPKR(deleteTarget.amount_paisa)}</span>{' '}
                from <span className="font-medium">{deleteTarget.customer_name}</span>?
              </p>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Note: the ledger credit will remain. Use an offsetting adjustment if you also need to undo the customer's balance.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="e.g. Recorded in wrong customer, duplicated entry"
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleteMutation.isPending}
                  className="flex-1 h-10 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={deleteMutation.isPending || !deleteReason.trim()}
                  className="flex-1 h-10 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DateInput({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="relative">
        <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 pl-9 pr-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}
