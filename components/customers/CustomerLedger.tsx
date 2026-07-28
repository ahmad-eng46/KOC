'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { format, parseISO, startOfMonth } from 'date-fns';
import { Calendar, Printer, Plus, Download } from 'lucide-react';
import { useCustomerLedger, type LedgerRow } from '@/lib/queries/customer-ledger';
import { formatPKR } from '@/lib/money';
import { CustomerStatementPDF } from './CustomerStatementPDF';

const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then((mod) => mod.PDFDownloadLink),
  { ssr: false, loading: () => <PDFButton label="Loading…" disabled /> },
);

type Props = {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  businessName: string;
  /** Opening date range. Defaults to the current month. */
  initialFrom?: string;
  initialTo?: string;
};

function todayISO() { return format(new Date(), 'yyyy-MM-dd'); }
function monthStartISO() { return format(startOfMonth(new Date()), 'yyyy-MM-dd'); }

const REF_LABELS: Record<LedgerRow['ref_type'], string> = {
  opening: 'Opening',
  invoice: 'Invoice',
  payment: 'Payment',
  return: 'Return',
  adjustment: 'Adjustment',
};

export function CustomerLedger({
  customerId,
  customerName,
  customerPhone,
  businessName,
  initialFrom,
  initialTo,
}: Props) {
  const [from, setFrom] = useState(initialFrom ?? monthStartISO());
  const [to, setTo] = useState(initialTo ?? todayISO());

  const { data: allRows = [], isLoading } = useCustomerLedger(customerId);

  // Filter to date range; the opening row (ref_type='opening') is special:
  // - if user's "from" is the customer's lifetime start, include it as the first row
  // - otherwise compute a "Brought Forward" representing the running_balance just before "from"
  const { broughtForward, visibleRows, closingBalance } = useMemo(() => {
    if (allRows.length === 0) {
      return { broughtForward: 0, visibleRows: [] as LedgerRow[], closingBalance: 0 };
    }

    const visible: LedgerRow[] = [];
    let lastBeforeFromBalance = 0;

    for (const r of allRows) {
      // The opening row uses customer.created_at — for ledger display we
      // include it only if explicitly within range. Otherwise its balance
      // is rolled into "Brought Forward".
      if (r.ref_type === 'opening') {
        if (r.entry_date >= from && r.entry_date <= to) {
          visible.push(r);
        } else if (r.entry_date < from) {
          lastBeforeFromBalance = r.running_balance;
        }
        continue;
      }
      if (r.entry_date < from) {
        lastBeforeFromBalance = r.running_balance;
        continue;
      }
      if (r.entry_date > to) continue;
      visible.push(r);
    }

    const closing =
      visible.length > 0
        ? visible[visible.length - 1].running_balance
        : lastBeforeFromBalance;

    return {
      broughtForward: lastBeforeFromBalance,
      visibleRows: visible,
      closingBalance: closing,
    };
  }, [allRows, from, to]);

  // For PDF generation include the brought forward as a synthetic opening row
  const pdfRows: LedgerRow[] = useMemo(() => {
    if (broughtForward !== 0 || (visibleRows[0]?.ref_type !== 'opening')) {
      const synth: LedgerRow = {
        id: 'brought-forward',
        ref_type: 'opening',
        ref_id: null,
        entry_date: from,
        created_at: from,
        description: 'Brought Forward',
        debit_paisa: broughtForward > 0 ? broughtForward : 0,
        credit_paisa: broughtForward < 0 ? Math.abs(broughtForward) : 0,
        running_balance: broughtForward,
      };
      return [synth, ...visibleRows];
    }
    return visibleRows;
  }, [broughtForward, visibleRows, from]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3">
        <DateInput label="From" value={from} onChange={setFrom} />
        <DateInput label="To" value={to} onChange={setTo} />

        <div className="flex-1" />

        <Link
          href={`/payments/new?customer=${customerId}`}
          className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={14} /> Record Payment
        </Link>

        <PDFDownloadLink
          document={
            <CustomerStatementPDF
              businessName={businessName}
              customerName={customerName}
              customerPhone={customerPhone}
              rangeFrom={from}
              rangeTo={to}
              rows={pdfRows}
              closingBalance={closingBalance}
            />
          }
          fileName={`Statement-${customerName.replace(/\s+/g, '_')}-${from}-to-${to}.pdf`}
        >
          {(props) => {
            const isLoading = 'loading' in props ? props.loading : false;
            return <PDFButton label={isLoading ? 'Generating…' : 'Print Statement'} disabled={isLoading} />;
          }}
        </PDFDownloadLink>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Ref</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Debit</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Credit</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {/* Brought Forward row */}
                {broughtForward !== 0 && (
                  <tr className="bg-gray-50/40">
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{format(parseISO(from), 'dd MMM yyyy')}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs italic">b/f</td>
                    <td className="px-4 py-2.5 text-gray-600 italic">Brought Forward</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">—</td>
                    <td className="px-4 py-2.5 text-right text-gray-400">—</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatPKR(broughtForward)}</td>
                  </tr>
                )}

                {visibleRows.length === 0 && broughtForward === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-gray-400 text-sm">
                      No ledger entries in this period.
                    </td>
                  </tr>
                )}

                {visibleRows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 tabular-nums text-gray-700">
                      {r.ref_type === 'opening' ? '—' : format(parseISO(r.entry_date), 'dd MMM yyyy')}
                    </td>
                    <td className="px-4 py-2.5">
                      <RefBadge type={r.ref_type} />
                    </td>
                    <td className="px-4 py-2.5">
                      <RefDescription row={r} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-700">
                      {r.debit_paisa > 0 ? formatPKR(r.debit_paisa) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-green-700">
                      {r.credit_paisa > 0 ? formatPKR(r.credit_paisa) : <span className="text-gray-300">—</span>}
                    </td>
                    <td
                      className={[
                        'px-4 py-2.5 text-right font-mono font-medium',
                        r.running_balance > 0 ? 'text-red-600' : 'text-gray-700',
                      ].join(' ')}
                    >
                      {formatPKR(r.running_balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                    Closing Balance
                  </td>
                  <td
                    className={[
                      'px-4 py-3 text-right font-mono font-semibold text-base',
                      closingBalance > 0 ? 'text-red-600' : 'text-gray-700',
                    ].join(' ')}
                  >
                    {closingBalance < 0
                      ? `${formatPKR(Math.abs(closingBalance))} (Cr)`
                      : formatPKR(closingBalance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-2">
            {broughtForward !== 0 && (
              <div className="bg-gray-50 rounded-2xl border border-gray-200 px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs italic text-gray-500">Brought Forward</p>
                  <p className="text-sm font-mono">{formatPKR(broughtForward)}</p>
                </div>
              </div>
            )}
            {visibleRows.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <RefBadge type={r.ref_type} />
                      {r.ref_type !== 'opening' && (
                        <span className="text-xs text-gray-500">
                          {format(parseISO(r.entry_date), 'dd MMM yyyy')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-900 mt-1">
                      <RefDescription row={r} />
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {r.debit_paisa > 0 && (
                      <p className="text-sm font-mono text-gray-700">+{formatPKR(r.debit_paisa)}</p>
                    )}
                    {r.credit_paisa > 0 && (
                      <p className="text-sm font-mono text-green-700">−{formatPKR(r.credit_paisa)}</p>
                    )}
                    <p
                      className={[
                        'text-xs font-mono mt-0.5',
                        r.running_balance > 0 ? 'text-red-600 font-medium' : 'text-gray-400',
                      ].join(' ')}
                    >
                      Bal: {formatPKR(r.running_balance)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {visibleRows.length === 0 && broughtForward === 0 && (
              <p className="text-center py-8 text-sm text-gray-400">
                No ledger entries in this period.
              </p>
            )}
            <div className="bg-gray-100 rounded-2xl border border-gray-200 px-4 py-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Closing Balance</p>
              <p
                className={[
                  'text-base font-mono font-semibold',
                  closingBalance > 0 ? 'text-red-600' : 'text-gray-700',
                ].join(' ')}
              >
                {closingBalance < 0
                  ? `${formatPKR(Math.abs(closingBalance))} (Cr)`
                  : formatPKR(closingBalance)}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RefBadge({ type }: { type: LedgerRow['ref_type'] }) {
  const styles: Record<LedgerRow['ref_type'], string> = {
    opening:    'bg-gray-100 text-gray-600',
    invoice:    'bg-amber-50 text-amber-700',
    payment:    'bg-green-50 text-green-700',
    return:     'bg-red-50 text-red-700',
    adjustment: 'bg-blue-50 text-blue-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${styles[type]}`}>
      {REF_LABELS[type]}
    </span>
  );
}

function RefDescription({ row }: { row: LedgerRow }) {
  const desc = row.description;
  if (!row.ref_id || row.ref_type === 'opening') return <span>{desc}</span>;
  if (row.ref_type === 'invoice') {
    return (
      <Link href={`/invoices/${row.ref_id}`} className="text-gray-900 hover:text-blue-600 hover:underline">
        {desc}
      </Link>
    );
  }
  // Payments / returns: no detail page yet for those — just show description
  return <span className="text-gray-900">{desc}</span>;
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

function PDFButton({ label, disabled }: { label: string; disabled?: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50',
        disabled ? 'opacity-50 cursor-wait' : 'cursor-pointer',
      ].join(' ')}
    >
      {disabled ? <Download size={14} /> : <Printer size={14} />}
      {label}
    </span>
  );
}
