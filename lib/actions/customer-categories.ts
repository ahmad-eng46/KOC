'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';
import { logActivity } from '@/lib/actions/activity-log';
import { softDeleteEntity } from '@/lib/actions/soft-delete';
import {
  customerCategorySchema,
  customerCategoryUpdateSchema,
  type CustomerCategoryInput,
  type CustomerCategoryUpdateInput,
} from '@/lib/validators/customer-categories';

type CreateResult = { ok: true; id: string; name: string } | { ok: false; error: string };
type SimpleResult = { ok: true } | { ok: false; error: string };
type DeleteResult = { ok: true; uncategorised: number } | { ok: false; error: string };

const REVALIDATE = ['/customers', '/customers/new', '/settings/customer-categories'];

function revalidateAll() {
  for (const p of REVALIDATE) revalidatePath(p);
}

async function requireManager(): Promise<SimpleResult> {
  const session = await getSession();
  if (!session || !['admin', 'accountant'].includes(session.role)) {
    return { ok: false, error: 'Insufficient permissions.' };
  }
  return { ok: true };
}

/** Postgres codes the UI should never show raw. */
function writeError(error: { code?: string; message: string }, name: string): string {
  if (error.code === '23505') return `A category named "${name}" already exists.`;
  if (error.code === '23514') return 'Enter a colour like #FF5733.';
  if (error.code === '42501') return 'You do not have permission to manage categories.';
  return error.message;
}

// ─────────────────────────────────────────────
// 1. createCustomerCategory
//    Returns { id, name } — the customer form needs the id to select the new
//    category the moment it exists, which is the whole point of quick-create.
// ─────────────────────────────────────────────
export async function createCustomerCategory(
  input: CustomerCategoryInput,
): Promise<CreateResult> {
  const gate = await requireManager();
  if (!gate.ok) return gate;

  const parsed = customerCategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();

  // sort_order 0 would bury a new category above every existing one, since the
  // list sorts ascending. Unspecified means "last", not "first".
  let sortOrder = data.sort_order;
  if (!sortOrder) {
    const { data: last } = await supabase
      .from('customer_categories')
      .select('sort_order')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = ((last as { sort_order: number } | null)?.sort_order ?? 0) + 1;
  }

  const { data: created, error } = await supabase
    .from('customer_categories')
    .insert({
      business_id: businessId,
      name: data.name,
      description: data.description || null,
      color: data.color || null,
      sort_order: sortOrder,
      is_active: data.is_active,
    })
    .select('id, name')
    .single();

  if (error || !created) {
    return { ok: false, error: writeError(error ?? { message: 'Insert failed.' }, data.name) };
  }

  const row = created as { id: string; name: string };

  await logActivity({
    action: 'customer.created',
    entityType: 'customer_category',
    entityId: row.id,
    description: `Added customer category ${row.name}`,
    metadata: { name: row.name },
  });

  revalidateAll();
  return { ok: true, id: row.id, name: row.name };
}

// ─────────────────────────────────────────────
// 2. updateCustomerCategory
// ─────────────────────────────────────────────
export async function updateCustomerCategory(
  id: string,
  input: CustomerCategoryUpdateInput,
): Promise<SimpleResult> {
  const gate = await requireManager();
  if (!gate.ok) return gate;

  const parsed = customerCategoryUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description || null;
  if (data.color !== undefined) updates.color = data.color || null;
  if (data.sort_order !== undefined) updates.sort_order = data.sort_order;
  if (data.is_active !== undefined) updates.is_active = data.is_active;
  if (Object.keys(updates).length === 0) return { ok: true };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('customer_categories')
    .update(updates)
    .eq('id', id)
    .eq('business_id', businessId)
    .is('deleted_at', null);

  if (error) return { ok: false, error: writeError(error, data.name ?? '') };

  revalidateAll();
  return { ok: true };
}

// ─────────────────────────────────────────────
// 3. deleteCustomerCategory — soft delete, admin only
//    Customers filed under it become uncategorised. The count is returned so
//    the UI can say what actually happened rather than guessing.
// ─────────────────────────────────────────────
export async function deleteCustomerCategory(id: string): Promise<DeleteResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Admin only.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();

  const { data: category } = await supabase
    .from('customer_categories')
    .select('name')
    .eq('id', id)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!category) return { ok: false, error: 'Category not found.' };

  // Detach first. If the soft delete then fails, customers are merely
  // uncategorised — recoverable. The other order would leave rows pointing at a
  // category no read can see, which looks like data loss.
  const { data: detached, error: detachError } = await supabase
    .from('customers')
    .update({ category_id: null })
    .eq('business_id', businessId)
    .eq('category_id', id)
    .is('deleted_at', null)
    .select('id');

  if (detachError) return { ok: false, error: detachError.message };

  const deleted = await softDeleteEntity('customer_category', id, businessId);
  if (!deleted.ok) return { ok: false, error: deleted.error };

  const uncategorised = (detached ?? []).length;
  const name = (category as { name: string }).name;

  await logActivity({
    action: 'customer.updated',
    entityType: 'customer_category',
    entityId: id,
    description: `Deleted customer category ${name}${
      uncategorised > 0 ? ` — ${uncategorised} customer${uncategorised === 1 ? '' : 's'} uncategorised` : ''
    }`,
    metadata: { name, uncategorised },
  });

  revalidateAll();
  return { ok: true, uncategorised };
}

// ─────────────────────────────────────────────
// 4. countCustomersInCategory — for the delete warning
// ─────────────────────────────────────────────
export async function countCustomersInCategory(
  id: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { count, error } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('category_id', id)
    .is('deleted_at', null);

  if (error) return { ok: false, error: error.message };
  return { ok: true, count: count ?? 0 };
}
