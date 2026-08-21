'use client';

import { useMemo } from 'react';
import { Check, Lock, RotateCcw, CheckSquare, Square, Info } from 'lucide-react';
import { CATEGORY_LABELS, type PageCategory, type PageDefinition } from '@/lib/auth/page-access-rules';
import { roleDefault, isLockedFor } from '@/lib/auth/page-access-rules';
import type { Role } from '@/lib/auth/permissions';

const CATEGORY_ORDER: PageCategory[] = ['main', 'reports', 'settings', 'actions'];

export type ChecklistState = Record<string, boolean>;

/** The role's defaults as a plain map — what "Reset to Role Default" restores. */
export function defaultsForRole(pages: PageDefinition[], role: Role): ChecklistState {
  const out: ChecklistState = {};
  for (const page of pages) {
    out[page.key] = isLockedFor(page, role) ? false : roleDefault(page, role);
  }
  return out;
}

type Props = {
  pages: PageDefinition[];
  role: Role;
  value: ChecklistState;
  onChange: (next: ChecklistState) => void;
  /** Keys the permission system already denies, shown but not selectable. */
  blockedKeys?: Set<string>;
  disabled?: boolean;
};

/**
 * The admin's page checklist. Grouped by area, with the role's defaults
 * pre-filled and every departure visible at a glance.
 */
export function PageAccessChecklist({
  pages, role, value, onChange, blockedKeys, disabled,
}: Props) {
  const isAdminUser = role === 'admin';
  const defaults = useMemo(() => defaultsForRole(pages, role), [pages, role]);

  /**
   * Rows that differ from the role's default are marked and stay marked. A
   * brief flash on role change was the first attempt; a standing marker is
   * better — it answers "what did I customise on this user?" at any point,
   * not only in the second after the role changed.
   */
  const customised = useMemo(
    () => new Set(pages.filter((p) => value[p.key] !== defaults[p.key]).map((p) => p.key)),
    [pages, value, defaults],
  );

  const byCategory = useMemo(() => {
    const out = new Map<PageCategory, PageDefinition[]>();
    for (const page of [...pages].sort((a, b) => a.sort_order - b.sort_order)) {
      out.set(page.category, [...(out.get(page.category) ?? []), page]);
    }
    return out;
  }, [pages]);

  function setAll(next: boolean) {
    const out: ChecklistState = {};
    for (const page of pages) {
      out[page.key] = isLockedFor(page, role) || blockedKeys?.has(page.key) ? false : next;
    }
    onChange(out);
  }

  function toggle(page: PageDefinition) {
    if (isLockedFor(page, role) || blockedKeys?.has(page.key)) return;
    onChange({ ...value, [page.key]: !value[page.key] });
  }

  const allowedCount = pages.filter((p) => (isAdminUser ? true : value[p.key])).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Page Access</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {isAdminUser
              ? 'Admin has full access to all pages.'
              : 'Choose which pages this user can see'}
          </p>
        </div>
        <span className="text-xs text-gray-500 tabular-nums">
          {allowedCount} of {pages.length} allowed
        </span>
      </div>

      {isAdminUser ? (
        <p className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-2.5 text-sm text-blue-800 flex items-start gap-2">
          <Info size={15} className="shrink-0 mt-0.5" />
          Admin users always see every page. To restrict access, change their role first.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <QuickAction onClick={() => setAll(true)} disabled={disabled} icon={CheckSquare}>
            Select All
          </QuickAction>
          <QuickAction onClick={() => setAll(false)} disabled={disabled} icon={Square}>
            Select None
          </QuickAction>
          <QuickAction onClick={() => onChange(defaults)} disabled={disabled} icon={RotateCcw}>
            Reset to Role Default
          </QuickAction>
        </div>
      )}

      {CATEGORY_ORDER.map((category) => {
        const items = byCategory.get(category);
        if (!items || items.length === 0) return null;

        return (
          <div key={category} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <h4 className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
              {CATEGORY_LABELS[category]}
            </h4>
            <ul className="divide-y divide-gray-100">
              {items.map((page) => {
                const locked = isLockedFor(page, role);
                const blocked = blockedKeys?.has(page.key) ?? false;
                const checked = isAdminUser || (value[page.key] ?? false);

                return (
                  <li key={page.key}>
                    <button
                      type="button"
                      onClick={() => toggle(page)}
                      disabled={disabled || isAdminUser || locked || blocked}
                      className={[
                        'w-full flex items-center gap-3 px-4 min-h-11 py-2.5 text-left',
                        'disabled:cursor-default hover:bg-gray-50 disabled:hover:bg-transparent',
                        customised.has(page.key) ? 'bg-blue-50/60' : '',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'w-5 h-5 rounded border flex items-center justify-center shrink-0',
                          checked
                            ? 'bg-green-600 border-green-600 text-white'
                            : 'bg-white border-gray-300',
                        ].join(' ')}
                        aria-hidden
                      >
                        {checked && <Check size={13} strokeWidth={3} />}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-gray-900 truncate">{page.label}</span>
                        {!locked && !blocked && customised.has(page.key) && (
                          <span className="block text-xs text-blue-700">
                            Changed from the {role} default
                          </span>
                        )}
                        {locked && (
                          <span className="block text-xs text-gray-500">
                            Enforced by the database — cannot be changed
                          </span>
                        )}
                        {!locked && blocked && (
                          <span className="block text-xs text-amber-700">
                            This user&apos;s role does not allow the underlying action
                          </span>
                        )}
                      </span>

                      {(locked || blocked) && (
                        <Lock size={14} className="text-gray-400 shrink-0" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function QuickAction({
  onClick, disabled, icon: Icon, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 h-11 sm:h-9 px-3 rounded-xl border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      <Icon size={14} />
      {children}
    </button>
  );
}
