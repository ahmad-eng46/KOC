'use client';

import { useState } from 'react';
import { Check, X, Lock, Info } from 'lucide-react';
import {
  PERMISSION_GROUPS, PERMISSION_LABELS, UNOVERRIDABLE,
  COST_PRICE_LABEL, roleAllowsCostPrice, type Permission, type Role,
} from '@/lib/auth/permissions';
import {
  usePermissionMatrix, useSetPermissionOverride, useRemovePermissionOverride,
} from '@/lib/queries/permissions';
import type { PermissionRow } from '@/lib/auth/effective';

type Choice = 'default' | 'grant' | 'deny';

function choiceOf(row: PermissionRow): Choice {
  if (row.override === null) return 'default';
  return row.override ? 'grant' : 'deny';
}

type Props = { userId: string; userName: string };

export function PermissionMatrix({ userId, userName }: Props) {
  const { data, isLoading, error } = usePermissionMatrix(userId);
  const setMut = useSetPermissionOverride();
  const removeMut = useRemovePermissionOverride();
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function apply(permission: Permission, choice: Choice) {
    setPending(permission);
    setActionError(null);
    const r =
      choice === 'default'
        ? await removeMut.mutateAsync({ userId, permission })
        : await setMut.mutateAsync({ userId, permission, granted: choice === 'grant' });
    if (!r.ok) setActionError(r.error);
    setPending(null);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-4">
        <p className="text-sm text-red-700">
          {error instanceof Error ? error.message : 'Could not load permissions.'}
        </p>
      </div>
    );
  }

  const byPermission = new Map(data.rows.map((r) => [r.permission, r]));
  const overrideCount = data.rows.filter((r) => r.override !== null).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600">
          Base role: <span className="font-medium text-gray-900 capitalize">{data.role}</span>
        </span>
        {overrideCount > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
            {overrideCount} override{overrideCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500 flex items-start gap-1.5">
        <Info size={13} className="shrink-0 mt-0.5" />
        <span>
          Every permission starts at the role default. <strong>Grant</strong> gives {userName} access
          the role does not include; <strong>Deny</strong> takes away access the role does include.
        </span>
      </p>

      {actionError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5">
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}

      {PERMISSION_GROUPS.map((group) => (
        <section key={group.label} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <h3 className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {group.label}
          </h3>
          <ul className="divide-y divide-gray-100">
            {group.permissions.map((p) => {
              const row = byPermission.get(p);
              if (!row) return null;
              return (
                <PermissionItem
                  key={p}
                  row={row}
                  label={PERMISSION_LABELS[p]}
                  locked={(UNOVERRIDABLE as readonly string[]).includes(p)}
                  busy={pending === p}
                  userName={userName}
                  onChange={(c) => apply(p, c)}
                />
              );
            })}

            {group.label === 'Products & Stock' && <CostPriceRow role={data.role} />}
          </ul>
        </section>
      ))}
    </div>
  );
}

function PermissionItem({
  row, label, locked, busy, userName, onChange,
}: {
  row: PermissionRow;
  label: string;
  locked: boolean;
  busy: boolean;
  userName: string;
  onChange: (choice: Choice) => void;
}) {
  const current = choiceOf(row);

  function handle(next: Choice) {
    if (next === current) return;
    if (next === 'grant' && !row.roleDefault) {
      const ok = window.confirm(
        `Grant "${label}" to ${userName}? Their role does not normally include this.`,
      );
      if (!ok) return;
    }
    onChange(next);
  }

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="flex-1 min-w-0 text-sm text-gray-800">{label}</span>

      <span className="hidden sm:flex items-center gap-1 w-24 shrink-0 text-xs text-gray-500">
        {row.roleDefault ? 'Allowed' : 'Denied'}
      </span>

      <EffectMark allowed={row.effective} />

      {locked ? (
        <span
          title="Role change only — this permission cannot be granted individually"
          className="inline-flex items-center gap-1 h-11 sm:h-9 px-3 rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-500 shrink-0"
        >
          <Lock size={12} /> Locked
        </span>
      ) : (
        <select
          value={current}
          disabled={busy}
          onChange={(e) => handle(e.target.value as Choice)}
          aria-label={`Override for ${label}`}
          className={[
            'h-11 sm:h-9 px-2 rounded-xl border text-xs font-medium shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50',
            current === 'grant' ? 'border-blue-300 bg-blue-50 text-blue-700'
              : current === 'deny' ? 'border-orange-300 bg-orange-50 text-orange-700'
                : 'border-gray-300 bg-white text-gray-600',
          ].join(' ')}
        >
          <option value="default">Default</option>
          <option value="grant">Grant</option>
          <option value="deny">Deny</option>
        </select>
      )}
    </li>
  );
}

function EffectMark({ allowed }: { allowed: boolean }) {
  return allowed ? (
    <Check size={16} className="text-green-600 shrink-0" aria-label="Allowed" />
  ) : (
    <X size={16} className="text-red-500 shrink-0" aria-label="Denied" />
  );
}

/**
 * Cost prices are hidden by the products_for_role view using user_role(), so an
 * application-level grant would be a lie — the database would still return NULL.
 * Shown, locked, with the reason.
 */
function CostPriceRow({ role }: { role: Role }) {
  const allowed = roleAllowsCostPrice(role);
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 bg-gray-50/60">
      <span className="flex-1 min-w-0 text-sm text-gray-800">
        {COST_PRICE_LABEL}
        <span className="block text-xs text-gray-500">Enforced by the database, not by this screen</span>
      </span>
      <span className="hidden sm:flex items-center gap-1 w-24 shrink-0 text-xs text-gray-500">
        {allowed ? 'Allowed' : 'Denied'}
      </span>
      <EffectMark allowed={allowed} />
      <span
        title="products_for_role returns NULL cost prices for staff and viewer. Change the role, not this switch."
        className="inline-flex items-center gap-1 h-11 sm:h-9 px-3 rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-500 shrink-0"
      >
        <Lock size={12} /> Locked
      </span>
    </li>
  );
}
