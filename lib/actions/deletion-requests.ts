'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';
import { logActivity } from '@/lib/actions/activity-log';
import {
  createDeletionRequestSchema, resolveDeletionRequestSchema,
  type CreateDeletionRequestInput, type ResolveDeletionRequestInput,
  type DeletableEntity, type DeletionRequestStatus,
} from '@/lib/validators/deletion-requests';
import {
  ENTITY_CONFIG, NO_DELETE_ACTION, describeDrift,
  type EntityDetail,
} from '@/lib/deletion/entity-registry';
import { softDeleteInvoice } from '@/lib/actions/invoice-detail';
import { softDeletePayment } from '@/lib/actions/payment';
import { softDeleteExpense } from '@/lib/actions/expense';
import { softDeleteCustomer } from '@/lib/actions/customer';
import { softDeleteProduct } from '@/lib/actions/product';
import { deleteSupplier } from '@/lib/actions/suppliers';
import { deleteBrand } from '@/lib/actions/brands';
import { deleteLocation } from '@/lib/actions/locations';
import { deleteCustomerCategory } from '@/lib/actions/customer-categories';
import { deleteExpenseAsset, deleteExpenseSubType } from '@/lib/actions/expense-assets';

type SimpleResult = { ok: true } | { ok: false; error: string };
type RequestResult = { ok: true; id: string } | { ok: false; error: string };

const REVALIDATE = ['/approvals', '/dashboard'];
function revalidateAll() {
  for (const p of REVALIDATE) revalidatePath(p);
}

export type DeletionRequest = {
  id: string;
  entity_type: DeletableEntity;
  entity_id: string;
  entity_display_name: string;
  /** Null when the requester did not give one — it is optional since 0062. */
  reason: string | null;
  status: DeletionRequestStatus;
  requested_by: string;
  requester_name: string;
  requested_at: string;
  resolved_by: string | null;
  resolver_name: string | null;
  resolved_at: string | null;
  review_note: string | null;
  entity_metadata: Record<string, unknown>;
  /**
   * The whole row as it was when the request was filed. Null for anyone the
   * view withholds it from — a product snapshot carries its cost price.
   */
  entity_snapshot: Record<string, unknown> | null;
};

// ─────────────────────────────────────────────
// 1. requestDeletion — for everyone who is not an admin
// ─────────────────────────────────────────────
export async function requestDeletion(
  input: CreateDeletionRequestInput,
): Promise<RequestResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Not signed in.' };

  // An admin filing a request would be approving their own — and the RLS insert
  // policy refuses it anyway. Better a clear message than a policy violation.
  if (session.role === 'admin') {
    return { ok: false, error: 'Admins delete directly and do not file requests.' };
  }

  const parsed = createDeletionRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();

  // Say who already asked, rather than letting the unique index answer with a
  // constraint name. The index still guarantees it under a race.
  const { data: existing } = await supabase
    .from(REQUEST_VIEW)
    .select('requested_at, requester_name')
    .eq('business_id', businessId)
    .eq('entity_type', data.entity_type)
    .eq('entity_id', data.entity_id)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    const who = requesterName(existing);
    const when = String((existing as { requested_at?: string }).requested_at ?? '').slice(0, 10);
    return {
      ok: false,
      error: `A deletion request for this item is already pending${who ? `, from ${who}` : ''}${when ? ` on ${when}` : ''}.`,
    };
  }

  const snapshot = await snapshotEntity(supabase, businessId, data.entity_type, data.entity_id);
  if (!snapshot.ok) return snapshot;

  // Filed through the RPC, not inserted directly. The request must carry a
  // snapshot of the whole row, and the requester is precisely the person who
  // cannot read all of it — products and stock purchases hold cost prices. The
  // function takes the snapshot with elevated rights and stores it; the
  // deletion_requests_for_role view is what keeps it out of the requester's
  // hands afterwards.
  const { data: created, error } = await supabase.rpc('file_deletion_request', {
    p_entity_type: data.entity_type,
    p_entity_id: data.entity_id,
    p_business_id: businessId,
    p_display_name: snapshot.snapshot.displayName,
    p_reason: data.reason?.trim() || null,
    p_metadata: {
      ...snapshot.snapshot.metadata,
      __modified_at: snapshot.snapshot.modifiedAt,
    },
  });

  if (error || !created) {
    if (error?.message.includes('already asked')) {
      return { ok: false, error: 'A deletion request for this item is already pending.' };
    }
    if (error?.message.includes('Record not found')) {
      return { ok: false, error: 'That record no longer exists, or has already been deleted.' };
    }
    return { ok: false, error: error?.message ?? 'Could not file the request.' };
  }
  const requestId = created as unknown as string;

  await logActivity({
    action: 'deletion.requested',
    entityType: data.entity_type,
    entityId: data.entity_id,
    description: `Requested deletion of ${snapshot.snapshot.displayName}`,
    metadata: { reason: data.reason ?? null, request_id: requestId },
  });

  revalidateAll();
  return { ok: true, id: requestId };
}

// ─────────────────────────────────────────────
// 2. resolveDeletionRequest — admin only
// ─────────────────────────────────────────────
export async function resolveDeletionRequest(
  input: ResolveDeletionRequestInput,
): Promise<SimpleResult & { drift?: string[] }> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Only an admin can resolve deletion requests.' };
  }

  const parsed = resolveDeletionRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { data: req } = await supabase
    .from('deletion_requests')
    .select('id, entity_type, entity_id, entity_display_name, status, entity_metadata')
    .eq('id', data.request_id)
    .eq('business_id', businessId)
    .maybeSingle();

  if (!req) return { ok: false, error: 'Request not found.' };
  const request = req as {
    entity_type: DeletableEntity; entity_id: string;
    entity_display_name: string; status: string;
    entity_metadata: Record<string, unknown>;
  };
  if (request.status !== 'pending') {
    return { ok: false, error: `This request was already ${request.status}.` };
  }

  const now = new Date().toISOString();

  if (data.action === 'reject') {
    const { error } = await supabase
      .from('deletion_requests')
      .update({
        status: 'rejected', resolved_by: session.id, resolved_at: now,
        review_note: data.review_note ?? null,
      })
      .eq('id', data.request_id);
    if (error) return { ok: false, error: error.message };

    await logActivity({
      action: 'deletion.rejected',
      entityType: request.entity_type,
      entityId: request.entity_id,
      description: `Rejected the deletion of ${request.entity_display_name}`,
      metadata: { reason: data.review_note ?? null },
    });

    revalidateAll();
    return { ok: true };
  }

  // ── approve ──
  if (NO_DELETE_ACTION.includes(request.entity_type)) {
    return {
      ok: false,
      error: `${request.entity_display_name} cannot be deleted from the app yet, so this request cannot be approved. Reject it instead.`,
    };
  }

  // The record may have moved since the request was filed. Refuse a stale
  // approval until the admin has actually seen what changed.
  if (!data.acknowledge_modified) {
    const drift = await driftSince(supabase, businessId, request.entity_type, request.entity_id, request.entity_metadata);
    if (drift.length > 0) {
      return {
        ok: false,
        error: `${request.entity_display_name} changed after this deletion was requested. Review the changes and approve again to confirm.`,
        drift,
      };
    }
  }

  const deleted = await performDelete(request.entity_type, request.entity_id, request.entity_display_name);
  if (!deleted.ok) return deleted;

  const { error } = await supabase
    .from('deletion_requests')
    .update({ status: 'approved', resolved_by: session.id, resolved_at: now })
    .eq('id', data.request_id);
  if (error) {
    // The row is already gone; saying the approval failed would be worse than
    // saying the record could not be updated.
    return { ok: false, error: `Deleted, but the request could not be marked approved: ${error.message}` };
  }

  await logActivity({
    action: 'deletion.approved',
    entityType: request.entity_type,
    entityId: request.entity_id,
    description: `Approved the deletion of ${request.entity_display_name}`,
  });

  revalidateAll();
  return { ok: true };
}

// ─────────────────────────────────────────────
// 3. cancelDeletionRequest — the requester withdraws
// ─────────────────────────────────────────────
export async function cancelDeletionRequest(requestId: string): Promise<SimpleResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Not signed in.' };

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { data: req } = await supabase
    .from(REQUEST_VIEW)
    .select('id, requested_by, status, entity_display_name, entity_type, entity_id')
    .eq('id', requestId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (!req) return { ok: false, error: 'Request not found.' };
  const request = req as {
    requested_by: string; status: string; entity_display_name: string;
    entity_type: DeletableEntity; entity_id: string;
  };

  if (request.requested_by !== session.id) {
    return { ok: false, error: 'You can only withdraw your own requests.' };
  }
  if (request.status !== 'pending') {
    return { ok: false, error: `This request was already ${request.status}.` };
  }

  // Through the RPC, not a direct UPDATE: 0062 closed the table to requesters,
  // and an UPDATE's WHERE clause is filtered by the SELECT policy, so this
  // would match zero rows and report success. The function re-checks that the
  // request is yours and still pending.
  const { error } = await supabase.rpc('cancel_deletion_request', {
    p_request_id: requestId,
  });
  if (error) return { ok: false, error: error.message };

  await logActivity({
    action: 'deletion.cancelled',
    entityType: request.entity_type,
    entityId: request.entity_id,
    description: `Withdrew the deletion request for ${request.entity_display_name}`,
  });

  revalidateAll();
  return { ok: true };
}

// ─────────────────────────────────────────────
// 4. Reads
// ─────────────────────────────────────────────
/**
 * Read through deletion_requests_for_role, never the table. 0062 closed the
 * table to everyone but admin and accountant, because a whole-row snapshot of
 * a product contains its cost price; the view withholds the snapshot from
 * anyone who may not see one and carries the two user names as plain columns.
 */
const REQUEST_VIEW = 'deletion_requests_for_role';
const REQUEST_COLUMNS =
  'id, entity_type, entity_id, entity_display_name, reason, status, requested_by, requested_at, ' +
  'resolved_by, resolved_at, review_note, entity_metadata, entity_snapshot, ' +
  'requester_name, resolver_name';

export async function listDeletionRequests(
  status?: DeletionRequestStatus | 'all',
): Promise<{ ok: true; data: DeletionRequest[] } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Not signed in.' };

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  let q = supabase
    .from(REQUEST_VIEW)
    .select(REQUEST_COLUMNS)
    .eq('business_id', businessId)
    .order('requested_at', { ascending: false })
    .limit(200);

  if (status && status !== 'all') q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: ((data ?? []) as unknown as Array<Record<string, unknown>>).map(toRequest) };
}

/** The badge. RLS already limits non-admins to their own rows. */
export async function getPendingRequestCount(): Promise<number> {
  const session = await getSession();
  if (!session) return 0;

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return 0;

  const supabase = await createServerClient();
  const { count } = await supabase
    .from(REQUEST_VIEW)
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'pending');

  return count ?? 0;
}

export async function getMyRequests(): Promise<
  { ok: true; data: DeletionRequest[] } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Not signed in.' };

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from(REQUEST_VIEW)
    .select(REQUEST_COLUMNS)
    .eq('business_id', businessId)
    .eq('requested_by', session.id)
    .order('requested_at', { ascending: false })
    .limit(100);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: ((data ?? []) as unknown as Array<Record<string, unknown>>).map(toRequest) };
}

/**
 * Which of these entities already have a pending request, so lists can mark
 * them without a query per row.
 */
export async function getPendingEntityIds(
  entityType: DeletableEntity,
): Promise<Record<string, { requester: string; requestedAt: string }>> {
  const session = await getSession();
  if (!session) return {};

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return {};

  const supabase = await createServerClient();
  const { data } = await supabase
    .from(REQUEST_VIEW)
    .select('entity_id, requested_at, requester_name')
    .eq('business_id', businessId)
    .eq('entity_type', entityType)
    .eq('status', 'pending');

  const out: Record<string, { requester: string; requestedAt: string }> = {};
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    out[String(row.entity_id)] = {
      requester: requesterName(row) ?? 'someone',
      requestedAt: String(row.requested_at ?? ''),
    };
  }
  return out;
}

/** What the request modal shows before anything is filed. */
export async function previewEntity(
  entityType: DeletableEntity,
  entityId: string,
): Promise<
  | { ok: true; displayName: string; details: EntityDetail[]; warnings: string[] }
  | { ok: false; error: string }
> {
  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const snap = await snapshotEntity(supabase, businessId, entityType, entityId);
  if (!snap.ok) return snap;
  return {
    ok: true,
    displayName: snap.snapshot.displayName,
    details: snap.snapshot.details,
    warnings: snap.snapshot.warnings,
  };
}

// ─────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────
type Client = Awaited<ReturnType<typeof createServerClient>>;

function requesterName(row: Record<string, unknown>): string | null {
  if (typeof row.requester_name === 'string') return row.requester_name;
  if (typeof row.resolver_name === 'string' && !('requester_name' in row)) return null;
  const v = row.users ?? row.requester;
  if (!v) return null;
  const obj = Array.isArray(v) ? v[0] : v;
  return (obj as { full_name?: string })?.full_name ?? null;
}

function toRequest(row: Record<string, unknown>): DeletionRequest {
  return {
    id: String(row.id),
    entity_type: row.entity_type as DeletableEntity,
    entity_id: String(row.entity_id),
    entity_display_name: String(row.entity_display_name),
    reason: row.reason ? String(row.reason) : null,
    status: row.status as DeletionRequestStatus,
    requested_by: String(row.requested_by),
    requester_name: row.requester_name ? String(row.requester_name) : 'Unknown user',
    requested_at: String(row.requested_at),
    resolved_by: row.resolved_by ? String(row.resolved_by) : null,
    resolver_name: row.resolver_name ? String(row.resolver_name) : null,
    resolved_at: row.resolved_at ? String(row.resolved_at) : null,
    review_note: row.review_note ? String(row.review_note) : null,
    entity_metadata: (row.entity_metadata ?? {}) as Record<string, unknown>,
    entity_snapshot: (row.entity_snapshot ?? null) as Record<string, unknown> | null,
  };
}

async function snapshotEntity(
  supabase: Client,
  businessId: string,
  entityType: DeletableEntity,
  entityId: string,
): Promise<
  | { ok: true; snapshot: { displayName: string; details: EntityDetail[]; warnings: string[]; metadata: Record<string, unknown>; modifiedAt: string | null } }
  | { ok: false; error: string }
> {
  const config = ENTITY_CONFIG[entityType];
  // Scoped to the business as well as the id (iron rule #2). RLS would catch a
  // cross-business id too, but an id from another business must read as "not
  // found" here rather than depending on the policy to say so.
  const { data, error } = await supabase
    .from(config.readTable ?? config.table)
    .select(config.columns)
    .eq('id', entityId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: `${config.label} not found.` };

  const row = data as unknown as Record<string, unknown>;
  if (config.softDeletes && row.deleted_at) {
    return { ok: false, error: `${config.label} has already been deleted.` };
  }

  const described = config.describe(row);
  return {
    ok: true,
    snapshot: {
      ...described,
      modifiedAt: row.updated_at ? String(row.updated_at) : null,
    },
  };
}

async function driftSince(
  supabase: Client,
  businessId: string,
  entityType: DeletableEntity,
  entityId: string,
  snapshot: Record<string, unknown>,
): Promise<string[]> {
  const fresh = await snapshotEntity(supabase, businessId, entityType, entityId);
  if (!fresh.ok) return [];

  const before = { ...snapshot };
  const recordedModified = before.__modified_at;
  delete before.__modified_at;

  const changed = describeDrift(before, fresh.snapshot.metadata);
  if (changed.length > 0) return changed;

  // Nothing the snapshot tracks moved, but the row's own timestamp did — say so
  // rather than claiming nothing changed.
  const nowModified = fresh.snapshot.modifiedAt;
  if (recordedModified && nowModified && String(recordedModified) !== nowModified) {
    return [`last modified ${String(nowModified).slice(0, 16).replace('T', ' ')}`];
  }
  return [];
}

/**
 * Runs the app's own delete action for the entity. Deliberately delegates
 * rather than writing deleted_at here: invoices restore stock, categories
 * detach customers, brands unassign products. Re-implementing any of that
 * would be a second, quietly diverging copy of the delete rules.
 */
async function performDelete(
  entityType: DeletableEntity,
  entityId: string,
  displayName: string,
): Promise<SimpleResult> {
  const via = `Approved deletion request: ${displayName}`;

  switch (entityType) {
    case 'invoice': return toSimple(await softDeleteInvoice(entityId, via));
    case 'payment': return toSimple(await softDeletePayment(entityId, via));
    case 'expense': return toSimple(await softDeleteExpense(entityId));
    case 'customer': return toSimple(await softDeleteCustomer(entityId));
    case 'product': return toSimple(await softDeleteProduct(entityId));
    case 'supplier': return toSimple(await deleteSupplier(entityId));
    case 'brand': return toSimple(await deleteBrand(entityId));
    case 'location': return toSimple(await deleteLocation(entityId));
    case 'customer_category': return toSimple(await deleteCustomerCategory(entityId));
    case 'expense_asset': return toSimple(await deleteExpenseAsset(entityId));
    case 'expense_sub_type': return toSimple(await deleteExpenseSubType(entityId));
    default:
      return { ok: false, error: `${displayName} cannot be deleted from the app yet.` };
  }
}

function toSimple(result: { ok: boolean; error?: string }): SimpleResult {
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Delete failed.' };
}
