import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { describeDenial, type DenialReason } from '@/lib/auth/denial';

export const metadata = { title: 'Not Allowed — KOC' };

type Props = {
  searchParams: Promise<{ reason?: string; required?: string; path?: string; page?: string }>;
};

export default async function UnauthorizedPage({ searchParams }: Props) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  const denial = describeDenial({
    reason: params.reason as DenialReason | undefined,
    required: params.required ?? null,
    path: params.path ?? null,
    pageKey: params.page ?? null,
  });

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-2xl bg-white border border-gray-200 p-6 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
          <ShieldAlert size={22} className="text-amber-600" />
        </div>

        <h1 className="mt-4 text-xl font-semibold text-gray-900">You don&apos;t have access</h1>
        <p className="mt-1.5 text-sm text-gray-500">{denial.summary}</p>

        <dl className="mt-5 text-left rounded-xl bg-gray-50 border border-gray-200 divide-y divide-gray-200">
          <Row label="Signed in as" value={session?.full_name ?? 'Not signed in'} />
          <Row label="Your role" value={session ? ROLE_LABELS[session.role] : '—'} />
          {denial.page && <Row label="Page" value={denial.page} />}
          <Row label="Check that failed" value={denial.check} />
          {denial.needed && <Row label="Needed" value={denial.needed} />}
        </dl>

        <p className="mt-4 text-xs text-gray-500">
          If you should be able to do this, send your admin the two lines above — that is
          enough for them to find the right switch.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <Link
            href="/dashboard"
            className="h-11 rounded-xl bg-blue-600 text-white text-sm font-medium flex items-center justify-center hover:bg-blue-700"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/profile"
            className="h-11 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 flex items-center justify-center hover:bg-gray-50"
          >
            View my profile
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-3.5 py-2.5">
      <dt className="w-32 shrink-0 text-xs text-gray-500">{label}</dt>
      <dd className="text-xs font-medium text-gray-900 break-all">{value}</dd>
    </div>
  );
}
