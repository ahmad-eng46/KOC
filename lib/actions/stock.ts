'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { stockMovementSchema, type StockMovementInput } from '@/lib/validators/stock';

type ActionResult = { ok: true } | { ok: false; error: string };

export async function addStockMovement(input: StockMovementInput): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !can(session.role, 'stock.update')) {
    return { ok: false, error: 'Insufficient permissions.' };
  }

  const parsed = stockMovementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { type, quantity } = parsed.data;
  if (type === 'in' && quantity <= 0) {
    return { ok: false, error: 'Quantity must be greater than 0 for stock in.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { error } = await supabase.from('stock_movements').insert({
    business_id: businessId,
    product_id: parsed.data.product_id,
    type: parsed.data.type,
    quantity: parsed.data.quantity,
    note: parsed.data.note || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/stock');
  revalidatePath('/products');
  return { ok: true };
}
