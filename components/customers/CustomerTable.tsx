'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Plus, Trash2, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { useCustomers, useDeleteCustomer } from '@/lib/queries/customers';
import { formatPKR } from '@/lib/money';

export function CustomerTable() {
  const { data: customers = [], isLoading } = useCustomers();
  const deleteMutation = useDeleteCustomer();
  const [search, setSearch] = useState('');

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? '').includes(search),
  );

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
            placeholder="Search customers…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Link
          href="/customers/new"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shrink-0"
        >
          <Plus size={15} />
          Add Customer
        </Link>
      </div>

      {/* Table — desktop */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Balance</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-400 text-sm">
                  {search ? 'No customers match your search.' : 'No customers yet.'}
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">
                  <Link href={`/customers/${c.id}`} className="hover:text-blue-600">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {c.customer_categories?.name ?? '—'}
                </td>
                <td className="px-4 py-3 text-gray-500">{c.phone ?? '—'}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatPKR(c.opening_balance_paisa)}
                </td>
                <td className="px-4 py-3">
                  {c.is_defaulter ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
                      Defaulter
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/customers/${c.id}`}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                    >
                      <ChevronRight size={15} />
                    </Link>
                    <button
                      onClick={() => {
                        if (confirm(`Delete ${c.name}?`)) deleteMutation.mutate(c.id);
                      }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards — mobile */}
      <div className="md:hidden space-y-2">
        {filtered.map((c) => (
          <Link
            key={c.id}
            href={`/customers/${c.id}`}
            className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 px-4 py-3"
          >
            <div>
              <p className="font-medium text-gray-900 text-sm">{c.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {c.phone ?? '—'} · {c.customer_categories?.name ?? 'No category'}
              </p>
            </div>
            <div className="text-right shrink-0 ml-3">
              <p className="text-sm font-mono text-gray-700">
                {formatPKR(c.opening_balance_paisa)}
              </p>
              {c.is_defaulter && (
                <span className="text-[10px] font-semibold text-red-600">DEFAULTER</span>
              )}
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <p className="text-center py-8 text-sm text-gray-400">
            {search ? 'No customers match your search.' : 'No customers yet.'}
          </p>
        )}
      </div>
    </div>
  );
}
