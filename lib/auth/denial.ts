import { PERMISSION_LABELS, ROLE_LABELS, type Permission, type Role } from '@/lib/auth/permissions';

/**
 * Why a redirect to /unauthorized happened. Carried in the URL because the
 * redirect crosses a request boundary — a thrown reason would be lost, and a
 * page that cannot say which check rejected you is only marginally better than
 * the 404 it replaces.
 */
export type DenialReason = 'role' | 'page' | 'permission';

export type DenialInput = {
  reason?: DenialReason;
  /** Comma-separated roles for 'role', a permission key for 'permission'. */
  required?: string | null;
  path?: string | null;
  pageKey?: string | null;
};

export type Denial = {
  summary: string;
  check: string;
  needed: string | null;
  page: string | null;
};

export function buildDenialQuery(input: DenialInput): string {
  const params = new URLSearchParams();
  if (input.reason) params.set('reason', input.reason);
  if (input.required) params.set('required', input.required);
  if (input.path) params.set('path', input.path);
  if (input.pageKey) params.set('page', input.pageKey);
  const query = params.toString();
  return query ? `/unauthorized?${query}` : '/unauthorized';
}

function roleList(required: string): string {
  return required
    .split(',')
    .map((r) => ROLE_LABELS[r.trim() as Role] ?? r.trim())
    .filter(Boolean)
    .join(', ');
}

/** Pure, so the copy can be unit-tested and the page stays a dumb renderer. */
export function describeDenial(input: DenialInput): Denial {
  const page = input.path || null;

  switch (input.reason) {
    case 'role':
      return {
        summary: 'This page is limited to certain roles, and yours is not one of them.',
        check: 'Role check on the page (requireRole)',
        needed: input.required ? `Role: ${roleList(input.required)}` : null,
        page,
      };
    case 'permission':
      return {
        summary: 'Your account is missing the permission this action needs.',
        check: 'Permission check (currentUserCan)',
        needed: input.required
          ? `Permission: ${PERMISSION_LABELS[input.required as Permission] ?? input.required}`
          : null,
        page,
      };
    case 'page':
      return {
        summary:
          'Your admin has this page switched off for your account. It is a per-user setting, not a bug.',
        check: 'Page access map (Settings → Users → Page Access)',
        needed: input.pageKey ? `Page key: ${input.pageKey}` : null,
        page,
      };
    default:
      return {
        summary: 'A permission check rejected this request.',
        check: 'Unknown — the redirect did not say which',
        needed: null,
        page,
      };
  }
}
