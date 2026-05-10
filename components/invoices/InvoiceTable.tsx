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
import { format, subDays, parseISO } from 'date-fns';
import { Search, ChevronLeft, ChevronRight, Plus, Calendar, ArrowUpDown } from 'lucide-react';
import {
  useInvoices,
  type InvoiceListRow,
  type InvoiceStatus,
  type InvoiceFilters,
} from '@/lib/queries/invoices';
import { formatPKR } from '@/lib/money';

type StatusFilter = 'all' | 'paid' | 'partial' | 'unpaid';

const STATUS_TO_FILTER: Record<StatusFilter, InvoiceStatus[]> = {
  all: [],
  paid: ['paid'],
  partial: ['partially_paid'],
  unpaid: ['issued'],
};

function todayISO() {
  return format(new Date(), 'yyyy-MM-dd');
}
function thirtyDaysAgoISO() {
  return format(subDays(new Date(), 30), 'yyyy-MM-dd');
}

export function InvoiceTable() {
  const [from, setFrom] = useState(thirtyDaysAgoISO());
  const [to, setTo] = useState(todayISO());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pageIndex, setPageIndex] = useState(0);

  const filters: InvoiceFilters = useMemo(
    () => ({ from, to, statuses: STATUS_TO_FILTER[statusFilter] }),
    [from, to, statusFilter],
  );
  const { data: rows = [], isLoading } = useInvoices(filters);

  // Client-side customer search filter (within fetched window)
  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.customer_name.toLowerCase().includes(q) ||
        r.invoice_number.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const columns = useMemo(() => {
    const ch = createColumnHelper<InvoiceListRow>();
    return [
      ch.accessor('invoice_number', {
        header: 'Invoice #',
        cell: (info) => (
          <Link
            href={`/invoices/${info.row.original.id}`}
            className="font-mono text-blue-600 hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      ch.accessor('issue_date', {
        header: 'Date',
        cell: (info) => format(parseISO(info.getValue()), 'dd MMM yyyy'),
      }),
      ch.accessor('customer_name', {
        header: 'Customer',
        cell: (info) => (
          <span className="text-gray-900 font-medium">{info.getValue()}</span>
        ),
      }),
      ch.accessor('total_paisa', {
        header: () => <span className="block text-right">Total</span>,
        cell: (info) => (
          <span className="block text-right font-mono">{formatPKR(info.getValue())}</span>
        ),
      }),
      ch.accessor('paid_paisa', {
        header: () => <span className="block text-right">Paid</span>,
        cell: (info) => (
          <span className="block text-right font-mono text-gray-600">
            {formatPKR(info.getValue())}
          </span>
        ),
      }),
      ch.display({
        id: 'balance',
        header: () => <span className="block text-right">Balance</span>,
        cell: (info) => {
          const r = info.row.original;
          const balance = r.total_paisa - r.paid_paisa;
          return (
            <span
              className={`block text-right font-mono font-medium ${balance > 0 ? 'text-red-600' : 'text-gray-400'}`}
            >
              {formatPKR(balance)}
            </span>
          );
        },
      }),
      ch.accessor('status', {
        header: 'Status',
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
    ];
  }, []);

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting, pagination: { pageIndex, pageSize: 20 } },
    onSortingChange: setSorting,
    onPaginationChange: (updater) => {
      const next =
        typeof updater === 'function'
          ? updater({ pageIndex, pageSize: 20 })
          : updater;
      setPageIndex(next.pageIndex);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // Reset page on filter change
  function changeFrom(v: string) { setFrom(v); setPageIndex(0); }
  function changeTo(v: string)   { setTo(v); setPageIndex(0); }
  function changeStatus(v: StatusFilter) { setStatusFilter(v); setPageIndex(0); }
  function changeSearch(v: string) { setSearch(v); setPageIndex(0); }

  const total = filteredRows.length;
  const showing = table.getRowModel().rows.length;
  const pageCount = table.getPageCount();

  return (
    <>
      {/* Toolbar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          {/* Date range */}
          <DateInput label="From" value={from} onChange={changeFrom} />
          <DateInput label="To"   value={to}   onChange={changeTo}   />

          {/* Search */}
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => changeSearch(e.target.value)}
                placeholder="Customer or invoice #…"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <Link
            href="/invoices/new"
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shrink-0"
          >
            <Plus size={15} /> New Invoice
          </Link>
        </div>

        {/* Status pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 mr-1">Status:</span>
          {(['all', 'paid', 'partial', 'unpaid'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => changeStatus(s)}
              className={[
                'px-3 h-7 text-xs font-medium rounded-full border transition-colors capitalize',
                statusFilter === s
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 mt-4">
          <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden mt-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => (
                      <th
                        key={h.id}
                        className="text-left px-4 py-3 font-medium text-gray-600"
                      >
                        {h.column.getCanSort() ? (
                          <button
                            className="inline-flex items-center gap-1 hover:text-gray-900"
                            onClick={h.column.getToggleSortingHandler()}
                          >
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            <ArrowUpDown size={11} className="opacity-40" />
                          </button>
                        ) : (
                          flexRender(h.column.columnDef.header, h.getContext())
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-gray-100">
                {table.getRowModel().rows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length} className="text-center py-10 text-gray-400 text-sm">
                      No invoices in this date range.
                    </td>
                  </tr>
                )}
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2 mt-4">
            {table.getRowModel().rows.length === 0 && (
              <p className="text-center py-8 text-sm text-gray-400">
                No invoices in this date range.
              </p>
            )}
            {table.getRowModel().rows.map((row) => {
              const r = row.original;
              const balance = r.total_paisa - r.paid_paisa;
              return (
                <Link
                  key={r.id}
                  href={`/invoices/${r.id}`}
                  className="block bg-white rounded-2xl border border-gray-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-blue-600">{r.invoice_number}</p>
                      <p className="font-medium text-gray-900 text-sm mt-0.5 truncate">
                        {r.customer_name}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {format(parseISO(r.issue_date), 'dd MMM yyyy')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono font-medium text-gray-900">
                        {formatPKR(r.total_paisa)}
                      </p>
                      {balance > 0 ? (
                        <p className="text-xs font-mono text-red-600 mt-0.5">
                          Bal: {formatPKR(balance)}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 mt-0.5">Paid</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2">
                    <StatusBadge status={r.status} />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <span className="text-gray-500">
                Showing {showing} of {total} invoice{total === 1 ? '' : 's'}
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
    </>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
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

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const cfg: Record<InvoiceStatus, { bg: string; text: string; label: string }> = {
    draft:           { bg: 'bg-gray-100',  text: 'text-gray-600',  label: 'Draft'        },
    issued:          { bg: 'bg-amber-50',  text: 'text-amber-700', label: 'Unpaid'       },
    partially_paid:  { bg: 'bg-blue-50',   text: 'text-blue-700',  label: 'Partial'      },
    paid:            { bg: 'bg-green-50',  text: 'text-green-700', label: 'Paid'         },
    cancelled:       { bg: 'bg-red-50',    text: 'text-red-700',   label: 'Cancelled'    },
  };
  const c = cfg[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}
