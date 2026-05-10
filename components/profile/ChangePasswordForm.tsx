'use client';

import { useState } from 'react';
import { Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { changeOwnPassword } from '@/lib/actions/user';

export function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const validation =
    !current ? 'Current password is required'
      : next.length < 8 ? 'New password must be at least 8 characters'
        : next !== confirm ? 'Passwords do not match'
          : current === next ? 'New password must differ from current'
            : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validation) return;
    setServerError(null);
    setSubmitting(true);
    const r = await changeOwnPassword(current, next);
    if (!r.ok) {
      setServerError(r.error);
      setSubmitting(false);
      return;
    }
    setSavedAt(new Date());
    setCurrent(''); setNext(''); setConfirm('');
    setSubmitting(false);
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Password</label>
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full h-11 px-3 pr-10 rounded-xl border border-gray-300 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="button" onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-gray-400 hover:text-gray-700">
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
        <input
          type={show ? 'text' : 'password'}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="Min 8 characters"
          className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
        <input
          type={show ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {serverError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex items-start gap-2">
          <AlertCircle size={15} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{serverError}</p>
        </div>
      )}
      {savedAt && !serverError && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 flex items-start gap-2">
          <CheckCircle2 size={15} className="text-green-600 mt-0.5 shrink-0" />
          <p className="text-sm text-green-700">Password changed at {savedAt.toLocaleTimeString()}.</p>
        </div>
      )}

      <button
        type="submit"
        disabled={!!validation || submitting}
        title={validation ?? undefined}
        className="h-11 px-6 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Changing…' : 'Change Password'}
      </button>
    </form>
  );
}
