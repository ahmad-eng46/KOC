'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { updateOwnProfile } from '@/lib/actions/user';

type Props = {
  initial: { fullName: string; phone: string };
};

export function ProfileForm({ initial }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.fullName);
  const [phone, setPhone] = useState(initial.phone);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setSubmitting(true);
    const r = await updateOwnProfile({ fullName, phone });
    if (!r.ok) {
      setServerError(r.error);
      setSubmitting(false);
      return;
    }
    setSavedAt(new Date());
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
        <input
          type="text" value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
        <input
          type="tel" value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0300-1234567"
          className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <p className="text-sm text-green-700">Saved at {savedAt.toLocaleTimeString()}</p>
        </div>
      )}

      <button
        type="submit" disabled={submitting}
        className="h-11 px-6 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Save Profile'}
      </button>
    </form>
  );
}
