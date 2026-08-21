'use server';

import { headers } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { getActiveBusinessId } from '@/lib/business';

export type ActivityAction =
  | 'invoice.created' | 'invoice.deleted' | 'invoice.marked_paid'
  | 'payment.recorded'
  | 'product.created' | 'product.updated'
  | 'customer.created' | 'customer.updated'
  | 'expense.created'
  | 'return.processed'
  | 'stock.purchased' | 'stock.adjusted'
  | 'brand.created' | 'supplier.created' | 'location.created'
  | 'backup.downloaded'
  | 'user.login' | 'user.password_changed'
  | 'permission.changed'
  | 'deletion.requested' | 'deletion.approved' | 'deletion.rejected' | 'deletion.cancelled';

export type LogActivityParams = {
  action: ActivityAction;
  entityType: string;
  entityId?: string;
  description: string;
  metadata?: Record<string, unknown>;
};

/**
 * Append one line to the activity log. Fire-and-forget by contract: a failure
 * here must never fail the invoice, payment or expense that triggered it, so
 * everything is swallowed. A missing log line is a nuisance; a rolled-back
 * invoice because logging broke is a business problem.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const session = await getSession();
    if (!session) return;

    const businessId = await getActiveBusinessId().catch(() => null);
    if (!businessId) return;

    const h = await headers().catch(() => null);

    const supabase = await createServerClient();
    await supabase.from('activity_log').insert({
      business_id: businessId,
      user_id: session.id,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      description: params.description,
      metadata: params.metadata ?? {},
      ip_address: h?.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      user_agent: h?.get('user-agent') ?? null,
    });
  } catch {
    // Intentionally silent — see the contract above.
  }
}

// ─────────────────────────────────────────────
// Reads. RLS limits these to admin and accountant.
// ─────────────────────────────────────────────
export type ActivityEntry = {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ActivityFilters = {
  userId?: string;
  action?: string;
  /** Prefix match on the action, e.g. 'invoice' matches invoice.created. */
  actionGroup?: string;
  entityType?: string;
  entityId?: string;
  since?: string;
  limit?: number;
  offset?: number;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function listActivity(
  filters: ActivityFilters = {},
): Promise<Result<ActivityEntry[]>> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Not signed in.' };

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const supabase = await createServerClient();
  let q = supabase
    .from('activity_log')
    .select('id, user_id, action, entity_type, entity_id, description, metadata, created_at, users(full_name)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.userId) q = q.eq('user_id', filters.userId);
  if (filters.action) q = q.eq('action', filters.action);
  if (filters.actionGroup) q = q.like('action', `${filters.actionGroup}.%`);
  if (filters.entityType) q = q.eq('entity_type', filters.entityType);
  if (filters.entityId) q = q.eq('entity_id', filters.entityId);
  if (filters.since) q = q.gte('created_at', filters.since);

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  type RawUser = { full_name: string };
  type Raw = Omit<ActivityEntry, 'user_name'> & { users: RawUser | RawUser[] | null };

  const rows = (data as unknown as Raw[]).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      id: r.id,
      user_id: r.user_id,
      user_name: u?.full_name ?? 'Unknown user',
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      description: r.description,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      created_at: r.created_at,
    };
  });

  return { ok: true, data: rows };
}

/** Distinct people who appear in this business's log, for the filter dropdown. */
export async function listActivityActors(): Promise<Result<Array<{ id: string; name: string }>>> {
  const r = await listActivity({ limit: 200 });
  if (!r.ok) return r;

  const seen = new Map<string, string>();
  for (const e of r.data) if (!seen.has(e.user_id)) seen.set(e.user_id, e.user_name);
  return { ok: true, data: [...seen].map(([id, name]) => ({ id, name })) };
}
