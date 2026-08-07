'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Plus, ChevronRight, Trash2 } from 'lucide-react';
import { useSuppliers, useSupplierBalances, useDeleteSupplier } from '@/lib/queries/suppliers';
import { formatPKR } from '@/lib/money';
import { useToast } from '@/components/ui/Toast';

type Props = {
  canCreate: boolean;
  canDelete: boolean;
  /** Staff/viewer get NULL money from the view; hide the columns entirely. */
  canSeeMoney: boolean;
};

/**
 * Balance colouring: we are the payer here, so RED = we owe the supplier
 * money (a liability), GREEN = we overpaid and hold credit. This is the
 * mirror image of the customer table's convention.
 */
function BalanceCell({ paisa }: { paisa: number | null }) {
  if (paisa === null) return <span className="text-gray-400">—</span>;
  if (paisa === 0) return <span className="text-gray-500">Rs. 0.00</span>;
  const weOwe = paisa > 0;
  return (
    <span className={weOwe ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
      {weOwe ? '' : '+'}
      {formatPKR(Math.abs(paisa))}
    </span>
  );
}

export function SupplierTable({ canCreate, canDelete, canSeeMoney }: Props) {
  const { data: suppliers = [], isLoading } = useSuppliers();
  const { data: balances = [] } = useSupplierBalances();
  const deleteMutation = useDeleteSupplier();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');

  const balanceById = new Map(balances.map((b) => [b.supplier_id, b]));

  const filtered = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.phone ?? '').includes(search),
  );

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete ${name}?`)) return;
    const result = await deleteMutation.mutateAsync(id);
    if (!result.ok) showToast(result.error ?? 'Could not delete supplier.', 'error');
    else showToast(`Supplier "${name}" deleted.`);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {canCreate && (
          <Link
            href="/suppliers/new"
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shrink-0"
          >
            <Plus size={15} />
            Add Supplier
          </Link>
        )}
      </div>

      {/* Table — desktop */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
              {canSeeMoney && (
                <>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Purchased</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Paid</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Balance Due</th>
                </>
              )}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={canSeeMoney ? 6 : 3}
                  className="text-center py-10 text-gray-400 text-sm"
                >
                  {search ? 'No suppliers match your search.' : 'No suppliers yet.'}
                </td>
              </tr>
            )}
            {filtered.map((s) => {
              const b = balanceById.get(s.id);
              return (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/suppliers/${s.id}`} className="hover:text-blue-600">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{s.phone ?? '—'}</td>
                  {canSeeMoney && (
                    <>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">
                        {b?.total_purchased_paisa === null || b === undefined
                          ? '—'
                          : formatPKR(b.total_purchased_paisa ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">
                        {b?.total_paid_paisa === null || b === undefined
                          ? '—'
                          : formatPKR(b.total_paid_paisa ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        <BalanceCell paisa={b?.balance_due_paisa ?? 0} />
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/suppliers/${s.id}`}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                      >
                        <ChevronRight size={15} />
                      </Link>
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(s.id, s.name)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cards — mobile */}
      <div className="md:hidden space-y-2">
        {filtered.map((s) => {
          const b = balanceById.get(s.id);
          return (
            <Link
              key={s.id}
              href={`/suppliers/${s.id}`}
              className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 px-4 py-3 min-h-[60px]"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">{s.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.phone ?? '—'}</p>
              </div>
              {canSeeMoney && (
                <div className="text-right shrink-0 ml-3">
                  <p className="text-sm font-mono">
                    <BalanceCell paisa={b?.balance_due_paisa ?? 0} />
                  </p>
                  {(b?.balance_due_paisa ?? 0) > 0 && (
                    <p className="text-[10px] font-semibold text-red-500">WE OWE</p>
                  )}
                </div>
              )}
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center py-8 text-sm text-gray-400">
            {search ? 'No suppliers match your search.' : 'No suppliers yet.'}
          </p>
        )}
      </div>
    </div>
  );
}
