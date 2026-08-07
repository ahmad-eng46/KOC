'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import {
  supplierSchema,
  stockPurchaseSchema,
  supplierPaymentSchema,
  type SupplierInput,
  type StockPurchaseInput,
  type SupplierPaymentInput,
} from '@/lib/validators/suppliers';

type CreateResult = { ok: true; id: string } | { ok: false; error: string };
type SimpleResult = { ok: true } | { ok: false; error: string };

// Every action re-validates with zod and re-checks the role on the server.
// RLS is the second layer; neither is trusted alone.

export async function createSupplier(input: SupplierInput): Promise<CreateResult> {
  const session = await getSession();
  if (!session || !can(session.role, 'suppliers.create')) {
    return { ok: false, error: 'Insufficient permissions.' };
  }

  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      business_id: businessId,
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Insert failed.' };

  revalidatePath('/suppliers');
  return { ok: true, id: data.id };
}

export async function updateSupplier(
  id: string,
  input: SupplierInput,
): Promise<CreateResult> {
  const session = await getSession();
  if (!session || !can(session.role, 'suppliers.update')) {
    return { ok: false, error: 'Insufficient permissions.' };
  }

  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('suppliers')
    .update({
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
    })
    .eq('id', id)
    .eq('business_id', businessId)
    .is('deleted_at', null);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/suppliers');
  revalidatePath(`/suppliers/${id}`);
  return { ok: true, id };
}

/**
 * Soft delete only — a supplier with purchase history must stay resolvable.
 * Refuses while the account is not square, otherwise the outstanding amount
 * silently vanishes from the balance view.
 */
export async function deleteSupplier(id: string): Promise<SimpleResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Only admins can delete suppliers.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();

  const { data: balance } = await supabase
    .from('supplier_balance_view')
    .select('balance_due_paisa')
    .eq('supplier_id', id)
    .eq('business_id', businessId)
    .maybeSingle();

  const outstanding = Number(balance?.balance_due_paisa ?? 0);
  if (outstanding !== 0) {
    return {
      ok: false,
      error:
        outstanding > 0
          ? 'This supplier still has an outstanding balance. Settle it before deleting.'
          : 'This supplier is in credit. Resolve the overpayment before deleting.',
    };
  }

  const { error } = await supabase
    .from('suppliers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', businessId)
    .is('deleted_at', null);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/suppliers');
  return { ok: true };
}

/**
 * Record a stock purchase. Delegates to create_stock_purchase_atomic() so the
 * purchase row, the 'in' stock movement and the product's new cost either all
 * land or none do. total_paisa is computed inside the RPC, never here.
 */
export async function createStockPurchase(
  input: StockPurchaseInput,
): Promise<CreateResult> {
  const session = await getSession();
  if (!session || !can(session.role, 'purchases.create')) {
    return { ok: false, error: 'Insufficient permissions.' };
  }

  const parsed = stockPurchaseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('create_stock_purchase_atomic', {
    p_input: {
      business_id: businessId,
      supplier_id: parsed.data.supplier_id,
      product_id: parsed.data.product_id,
      quantity: parsed.data.quantity,
      unit_price_paisa: parsed.data.unit_price_paisa,
      purchase_date: parsed.data.purchase_date,
      notes: parsed.data.notes || null,
    },
  });

  if (error) return { ok: false, error: error.message };
  if (typeof data !== 'string') {
    return { ok: false, error: 'Purchase was not created.' };
  }

  revalidatePath('/suppliers');
  revalidatePath(`/suppliers/${parsed.data.supplier_id}`);
  revalidatePath('/stock');
  revalidatePath('/products');
  revalidatePath(`/products/${parsed.data.product_id}`);
  return { ok: true, id: data };
}

export async function createSupplierPayment(
  input: SupplierPaymentInput,
): Promise<CreateResult> {
  const session = await getSession();
  if (!session || !can(session.role, 'supplier_payments.create')) {
    return { ok: false, error: 'Insufficient permissions.' };
  }

  const parsed = supplierPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();

  // Defence in depth: RLS would also reject a foreign supplier_id, but a
  // clear error beats a policy violation surfacing as a raw Postgres message.
  const { data: supplier, error: supErr } = await supabase
    .from('suppliers')
    .select('id')
    .eq('id', parsed.data.supplier_id)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .single();

  if (supErr || !supplier) {
    return { ok: false, error: 'Supplier not found in this business.' };
  }

  const { data, error } = await supabase
    .from('supplier_payments')
    .insert({
      business_id: businessId,
      supplier_id: parsed.data.supplier_id,
      amount_paisa: parsed.data.amount_paisa,
      payment_date: parsed.data.payment_date,
      payment_method: parsed.data.payment_method,
      reference: parsed.data.reference || null,
      notes: parsed.data.notes || null,
      created_by: session.id,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Insert failed.' };

  revalidatePath('/suppliers');
  revalidatePath(`/suppliers/${parsed.data.supplier_id}`);
  return { ok: true, id: data.id };
}
