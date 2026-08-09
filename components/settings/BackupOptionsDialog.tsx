'use client';

import { useRef, useState } from 'react';
import { X, FileSpreadsheet, RefreshCw } from 'lucide-react';
import {
  BACKUP_SECTIONS, DEFAULT_BACKUP_OPTIONS, LARGE_SECTIONS, RANGE_LABEL,
  RANGE_PRESETS, SECTION_LABEL, backupOptionsSchema,
  type BackupOptions, type BackupSection, type RangePreset,
} from '@/lib/backup/options';

type Props = {
  running: boolean;
  onCancel: () => void;
  onGenerate: (options: BackupOptions) => void;
};

/**
 * Picks what goes into the workbook before it is built. Everything is on by
 * default except the three sheets that grow with transaction volume, which an
 * owner rarely wants and which are what make a backup slow.
 */
export function BackupOptionsDialog({ running, onCancel, onGenerate }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [sections, setSections] = useState<Set<BackupSection>>(
    new Set(DEFAULT_BACKUP_OPTIONS.sections),
  );
  const [preset, setPreset] = useState<RangePreset>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  function toggle(section: BackupSection) {
    setSections((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  function submit() {
    const options: BackupOptions = {
      sections: BACKUP_SECTIONS.filter((s) => sections.has(s)),
      range: {
        preset,
        from: preset === 'custom' ? from || null : null,
        to: preset === 'custom' ? to || null : null,
      },
    };
    const parsed = backupOptionsSchema.safeParse(options);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError(null);
    onGenerate(parsed.data);
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current && !running) onCancel();
      }}
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 inline-flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-blue-600" />
            Generate Backup
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={running}
            aria-label="Close"
            className="w-11 h-11 -mr-2 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-50 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-2">What to include</legend>
            <div className="space-y-1">
              {BACKUP_SECTIONS.map((section) => (
                <label
                  key={section}
                  className="flex items-center gap-3 min-h-[44px] px-3 rounded-xl hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={sections.has(section)}
                    onChange={() => toggle(section)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-900">
                    {SECTION_LABEL[section]}
                    {LARGE_SECTIONS.includes(section) && (
                      <span className="text-xs text-gray-500"> (large)</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-2">Date range</legend>
            <div className="space-y-1">
              {RANGE_PRESETS.map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-3 min-h-[44px] px-3 rounded-xl hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="backup-range"
                    checked={preset === option}
                    onChange={() => setPreset(option)}
                    className="w-4 h-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-900">{RANGE_LABEL[option]}</span>
                </label>
              ))}
            </div>

            {preset === 'custom' && (
              <div className="grid grid-cols-2 gap-2 mt-2 px-3">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-label="From date"
                  className="h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  aria-label="To date"
                  className="h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <p className="text-xs text-gray-500 mt-2 px-3">
              The range narrows the invoice, payment, expense and return sheets. Customer
              balances, stock and the Summary stay all-time.
            </p>
          </fieldset>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onCancel}
            disabled={running}
            className="h-11 px-4 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={running}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {running ? <RefreshCw size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
            {running ? 'Generating…' : 'Generate Backup'}
          </button>
        </div>
      </div>
    </div>
  );
}
