'use client';

import { useState, useTransition } from 'react';
import { Calendar, FileSpreadsheet, FileText } from 'lucide-react';
import { format, startOfDay, startOfWeek, startOfMonth, startOfYear } from 'date-fns';
import { downloadBase64 } from '@/lib/reports/download';

export type DatePreset = 'today' | 'week' | 'month' | 'year' | 'custom';

export type DateRange = { from: string; to: string };

export function todayISO(): string { return format(new Date(), 'yyyy-MM-dd'); }

export function rangeForPreset(preset: DatePreset): DateRange {
  const now = new Date();
  const to = todayISO();
  switch (preset) {
    case 'today':  return { from: format(startOfDay(now), 'yyyy-MM-dd'), to };
    case 'week':   return { from: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'), to };
    case 'month':  return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to };
    case 'year':   return { from: format(startOfYear(now), 'yyyy-MM-dd'), to };
    case 'custom': return { from: to, to };
  }
}

type FilterBarProps = {
  preset: DatePreset;
  range: DateRange;
  onPresetChange: (p: DatePreset) => void;
  onRangeChange: (r: DateRange) => void;
  extras?: React.ReactNode;
};

export function FilterBar({ preset, range, onPresetChange, onRangeChange, extras }: FilterBarProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-500 mr-1">Period:</span>
        {(['today', 'week', 'month', 'year', 'custom'] as DatePreset[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              onPresetChange(p);
              if (p !== 'custom') onRangeChange(rangeForPreset(p));
            }}
            className={[
              'px-3 h-7 text-xs font-medium rounded-full border capitalize',
              preset === p
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
            ].join(' ')}
          >
            {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p === 'year' ? 'This Year' : 'Custom'}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="flex flex-wrap items-end gap-3">
          <DateInput label="From" value={range.from} onChange={(v) => onRangeChange({ ...range, from: v })} />
          <DateInput label="To" value={range.to} onChange={(v) => onRangeChange({ ...range, to: v })} />
        </div>
      )}

      {extras}
    </div>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
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

export function KPICard({
  label, value, sub, accent,
}: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">{label}</p>
      <p className={`text-xl font-mono font-semibold mt-1 tabular-nums ${accent ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

type ExportButtonsProps = {
  onExportPdf: () => Promise<{ ok: true; base64: string; filename: string } | { ok: false; error: string }>;
  onExportExcel: () => Promise<{ ok: true; base64: string; filename: string } | { ok: false; error: string }>;
};

export function ExportButtons({ onExportPdf, onExportExcel }: ExportButtonsProps) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<'pdf' | 'excel' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function run(kind: 'pdf' | 'excel') {
    setBusy(kind);
    setErr(null);
    startTransition(async () => {
      const fn = kind === 'pdf' ? onExportPdf : onExportExcel;
      const result = await fn();
      if (!result.ok) {
        setErr(result.error);
      } else {
        const mime = kind === 'pdf' ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        downloadBase64(result.base64, result.filename, mime);
      }
      setBusy(null);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => run('pdf')}
        disabled={pending}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
      >
        <FileText size={14} />
        {busy === 'pdf' ? 'Generating…' : 'PDF'}
      </button>
      <button
        type="button"
        onClick={() => run('excel')}
        disabled={pending}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
      >
        <FileSpreadsheet size={14} />
        {busy === 'excel' ? 'Generating…' : 'Excel'}
      </button>
      {err && <span className="text-xs text-red-600 ml-2">{err}</span>}
    </div>
  );
}
