'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { saveSettings } from '@/lib/actions/settings';

type Props = {
  initial: {
    business_name: string;
    business_address: string;
    business_phone: string;
    home_expense_in_pnl: boolean;
    defaulter_days: number;
  };
};

export function SettingsForm({ initial }: Props) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState(initial.business_name);
  const [businessAddress, setBusinessAddress] = useState(initial.business_address);
  const [businessPhone, setBusinessPhone] = useState(initial.business_phone);
  const [homeInPnl, setHomeInPnl] = useState(initial.home_expense_in_pnl);
  const [defaulterDays, setDefaulterDays] = useState(String(initial.defaulter_days));

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setSubmitting(true);

    const days = parseInt(defaulterDays, 10);
    if (isNaN(days)) {
      setServerError('Defaulter days must be a number.');
      setSubmitting(false);
      return;
    }

    const r = await saveSettings({
      business_name: businessName,
      business_address: businessAddress,
      business_phone: businessPhone,
      home_expense_in_pnl: homeInPnl,
      defaulter_days: days,
    });

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
    <form className="max-w-2xl space-y-8" onSubmit={onSubmit}>
      {/* General */}
      <Section title="General" description="Display info shown on invoices, statements, and the business switcher.">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Business Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
          <textarea
            value={businessAddress}
            onChange={(e) => setBusinessAddress(e.target.value)}
            rows={2}
            placeholder="GT Road, Lahore"
            className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
          <input
            type="tel"
            value={businessPhone}
            onChange={(e) => setBusinessPhone(e.target.value)}
            placeholder="0300-1234567"
            className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </Section>

      {/* P&L */}
      <Section title="Profit & Loss" description="Affects how the P&L report (Piece 9) treats home expenses.">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={homeInPnl}
            onChange={(e) => setHomeInPnl(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span>
            <span className="block text-sm font-medium text-gray-900">Include home expenses in P&L</span>
            <span className="block text-xs text-gray-500 mt-0.5">
              When OFF, "home" expenses are excluded from net profit. Each new home expense already
              defaults to "exclude from P&L" at the row level.
            </span>
          </span>
        </label>
      </Section>

      {/* Defaulters */}
      <Section title="Defaulters" description="Customers go on the defaulter list after this many days of inactivity.">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Days of inactivity before defaulter
          </label>
          <input
            type="number"
            min={1}
            max={365}
            value={defaulterDays}
            onChange={(e) => setDefaulterDays(e.target.value)}
            className="w-32 h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </Section>

      {serverError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex items-start gap-2">
          <AlertCircle size={15} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{serverError}</p>
        </div>
      )}

      {savedAt && !serverError && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 flex items-start gap-2">
          <CheckCircle2 size={15} className="text-green-600 mt-0.5 shrink-0" />
          <p className="text-sm text-green-700">
            Saved at {savedAt.toLocaleTimeString()}
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="h-11 px-6 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {submitting ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <CheckCircle2 size={15} />
              Save Settings
            </>
          )}
        </button>
      </div>
    </form>
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
      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
        {children}
      </div>
    </section>
  );
}
