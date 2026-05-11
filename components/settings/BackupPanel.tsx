'use client';

import { useEffect, useState, useTransition } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Download, RefreshCw, FileSpreadsheet, AlertCircle,
  CheckCircle2, Clock, FileX,
} from 'lucide-react';
import { downloadBase64 } from '@/lib/reports/download';
import {
  runBackupNow, listRecentBackups, getBackupSignedUrl,
  saveBackupSchedule, type BackupHistoryRow,
} from '@/lib/actions/backup';
import {
  BACKUP_FREQUENCIES, BACKUP_DESTINATIONS,
  FREQUENCY_LABEL, DESTINATION_LABEL, DESTINATION_AVAILABLE,
  type BackupFrequency, type BackupDestination, type BackupSchedule,
} from '@/lib/backup/schedule';

type Props = { initialSchedule: BackupSchedule };

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function BackupPanel({ initialSchedule }: Props) {
  const [schedule, setSchedule] = useState<BackupSchedule>(initialSchedule);
  const [history, setHistory] = useState<BackupHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [running, startRun] = useTransition();
  const [savingSchedule, startSaveSchedule] = useTransition();
  const [scheduleSavedAt, setScheduleSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory() {
    setHistoryLoading(true);
    const r = await listRecentBackups();
    if (r.ok) setHistory(r.data);
    else setError(r.error);
    setHistoryLoading(false);
  }

  useEffect(() => { loadHistory(); }, []);

  function onBackupNow() {
    setError(null);
    startRun(async () => {
      const r = await runBackupNow();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Trigger client-side download of the freshly-generated file
      downloadBase64(r.base64, r.filename, XLSX_MIME);
      // Refresh history to show the new row
      loadHistory();
    });
  }

  function onScheduleChange(next: Partial<BackupSchedule>) {
    const updated = { ...schedule, ...next };
    setSchedule(updated);
    startSaveSchedule(async () => {
      const r = await saveBackupSchedule(updated);
      if (!r.ok) {
        setError(r.error ?? 'Failed to save schedule');
        return;
      }
      setScheduleSavedAt(new Date());
    });
  }

  function toggleDestination(d: BackupDestination) {
    const cur = schedule.destinations;
    const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d];
    onScheduleChange({ destinations: next });
  }

  async function downloadHistoryRow(id: string) {
    setError(null);
    const r = await getBackupSignedUrl(id);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    window.open(r.url, '_blank');
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* ── Manual backup ─────────────────── */}
      <Section
        title="Backup Now"
        description="Generate and download a multi-sheet .xlsx covering every major table for the active business."
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onBackupNow}
            disabled={running}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {running ? (
              <>
                <RefreshCw size={15} className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <FileSpreadsheet size={15} />
                Backup Now (Excel)
              </>
            )}
          </button>
          <p className="text-xs text-gray-500">
            File downloads to your browser AND uploads to private Storage for retention.
          </p>
        </div>
      </Section>

      {/* ── Schedule ─────────────────── */}
      <Section
        title="Schedule"
        description="Run an automatic backup on a recurring cadence. Requires the Edge Function + pg_cron to be deployed (see SETUP.md)."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Frequency</label>
            <select
              value={schedule.frequency_days}
              onChange={(e) => onScheduleChange({ frequency_days: Number(e.target.value) as BackupFrequency })}
              className="w-full sm:w-64 h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {BACKUP_FREQUENCIES.map((f) => (
                <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>
              ))}
            </select>
          </div>

          {schedule.frequency_days > 0 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Destinations</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {BACKUP_DESTINATIONS.map((d) => {
                    const enabled = schedule.destinations.includes(d);
                    const available = DESTINATION_AVAILABLE[d];
                    return (
                      <label
                        key={d}
                        className={[
                          'flex items-start gap-3 p-3 rounded-xl border cursor-pointer',
                          available ? 'bg-white border-gray-300 hover:border-blue-400' : 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed',
                        ].join(' ')}
                      >
                        <input
                          type="checkbox"
                          checked={enabled}
                          disabled={!available}
                          onChange={() => available && toggleDestination(d)}
                          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{DESTINATION_LABEL[d]}</p>
                          {!available && <p className="text-xs text-gray-500 mt-0.5">Coming soon</p>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {schedule.destinations.includes('email') && DESTINATION_AVAILABLE.email && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email recipient</label>
                  <input
                    type="email"
                    value={schedule.email_to ?? ''}
                    onChange={(e) => onScheduleChange({ email_to: e.target.value })}
                    placeholder="ops@khaliqoil.com"
                    className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </>
          )}

          {savingSchedule && <p className="text-xs text-gray-500 inline-flex items-center gap-1.5"><RefreshCw size={11} className="animate-spin" /> Saving…</p>}
          {scheduleSavedAt && !savingSchedule && (
            <p className="text-xs text-green-700 inline-flex items-center gap-1.5">
              <CheckCircle2 size={12} /> Saved at {scheduleSavedAt.toLocaleTimeString()}
            </p>
          )}
        </div>
      </Section>

      {/* ── History ─────────────────── */}
      <Section
        title="Recent Backups"
        description="Last 10 runs across manual and scheduled backups."
      >
        {historyLoading ? (
          <div className="flex items-center justify-center h-24">
            <div className="w-5 h-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500">No backups yet. Click "Backup Now" to create your first.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {history.map((h) => (
              <li key={h.id} className="py-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900 inline-flex items-center gap-1.5">
                    <StatusIcon status={h.status} />
                    {h.type.toUpperCase()}
                    <span className="text-xs text-gray-500">·</span>
                    <span className="text-xs text-gray-500 capitalize">{h.status}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 tabular-nums">
                    {format(parseISO(h.created_at), 'dd MMM yyyy HH:mm:ss')}
                    {h.file_size_bytes != null && <> · {formatSize(h.file_size_bytes)}</>}
                    {h.triggered_by_email && <> · by {h.triggered_by_email}</>}
                  </p>
                  {h.error_message && (
                    <p className="text-xs text-red-600 mt-1">{h.error_message}</p>
                  )}
                </div>
                {h.status === 'done' && h.storage_path && (
                  <button
                    type="button"
                    onClick={() => downloadHistoryRow(h.id)}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 shrink-0"
                  >
                    <Download size={14} /> Download
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex items-start gap-2">
          <AlertCircle size={15} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}

function Section({
  title, description, children,
}: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-4">{children}</div>
    </section>
  );
}

function StatusIcon({ status }: { status: BackupHistoryRow['status'] }) {
  if (status === 'done')    return <CheckCircle2 size={14} className="text-green-600" />;
  if (status === 'failed')  return <FileX size={14} className="text-red-600" />;
  if (status === 'running') return <RefreshCw size={14} className="text-blue-600 animate-spin" />;
  return <Clock size={14} className="text-gray-400" />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
