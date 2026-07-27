'use client';

import { useMemo, useState } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useAuditLog, type AuditFilters } from '@/lib/queries/reports';
import { exportAuditPdf, exportAuditExcel } from '@/lib/actions/reports';
import { ExportButtons } from './shared';

const TABLES = [
  '', 'invoices', 'invoice_items', 'payments', 'returns', 'return_items',
  'expenses', 'investments', 'loans', 'products', 'users', 'app_settings',
];

const ACTIONS = ['', 'INSERT', 'UPDATE', 'DELETE'] as const;

function todayISO() { return format(new Date(), 'yyyy-MM-dd'); }

export function AuditLogReport() {
  const [from, setFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [to, setTo] = useState(todayISO());
  const [table, setTable] = useState('');
  const [action, setAction] = useState<'' | 'INSERT' | 'UPDATE' | 'DELETE'>('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filters: AuditFilters = useMemo(() => ({
    from, to,
    table: table || undefined,
    action: action || undefined,
  }), [from, to, table, action]);

  const { data: rows = [], isLoading } = useAuditLog(filters);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? rows.filter((r) =>
          (r.user_email ?? '').toLowerCase().includes(q) ||
          r.table_name.toLowerCase().includes(q) ||
          r.row_id.toLowerCase().includes(q),
        )
      : rows;
  }, [rows, search]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <DateInput label="From" value={from} onChange={setFrom} />
          <DateInput label="To" value={to} onChange={setTo} />
          <Select label="Table" value={table} onChange={setTable} options={TABLES} placeholder="All tables" />
          <Select label="Action" value={action} onChange={(v) => setAction(v as typeof action)} options={ACTIONS} placeholder="All actions" />
          <div className="flex-1 min-w-48 max-w-sm">
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Email, table, row id…"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <ExportButtons onExportPdf={() => exportAuditPdf(filters)} onExportExcel={() => exportAuditExcel(filters)} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" /></div>
      ) : (
        <>
          <p className="text-xs text-gray-500">Showing {filtered.length} of latest 500 events.</p>
          <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full text-sm min-w-[34rem]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3" />
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Time</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Table</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Row</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-gray-400">No audit events match.</td></tr>}
                {filtered.map((r) => {
                  const isExp = expanded.has(r.id);
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 align-top">
                      <td className="px-3 py-2.5">
                        <button onClick={() => toggle(r.id)} className="p-0.5 rounded text-gray-400 hover:text-gray-700">
                          {isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-xs tabular-nums">{format(parseISO(r.at), 'dd MMM HH:mm:ss')}</td>
                      <td className="px-4 py-2.5 text-xs">{r.user_email ?? <span className="text-gray-400">system</span>}</td>
                      <td className="px-4 py-2.5 text-xs font-mono">{r.table_name}</td>
                      <td className="px-4 py-2.5">
                        <ActionBadge action={r.action} />
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-gray-500">{r.row_id.slice(0, 8)}…</td>

                      {isExp && (
                        <td colSpan={6} className="px-4 pb-4 pt-0">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            <JsonPanel label="Before" data={r.before_jsonb} />
                            <JsonPanel label="After" data={r.after_jsonb} />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function ActionBadge({ action }: { action: 'INSERT' | 'UPDATE' | 'DELETE' }) {
  const styles = {
    INSERT: 'bg-green-50 text-green-700',
    UPDATE: 'bg-blue-50 text-blue-700',
    DELETE: 'bg-red-50 text-red-700',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[action]}`}>{action}</span>;
}

function JsonPanel({ label, data }: { label: string; data: unknown }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
      <div className="px-2 py-1 text-xs font-semibold text-gray-600 border-b border-gray-200 bg-gray-100">{label}</div>
      <pre className="p-2 text-xs overflow-x-auto whitespace-pre-wrap font-mono text-gray-700 max-h-72">
        {data ? JSON.stringify(data, null, 2) : '—'}
      </pre>
    </div>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function Select({
  label, value, onChange, options, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: readonly string[]; placeholder: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o === '' ? placeholder : o}</option>
        ))}
      </select>
    </div>
  );
}
