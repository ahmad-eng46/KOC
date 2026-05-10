import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';

/**
 * Read a single per-business setting from app_settings.
 * Returns the default value if the row doesn't exist (or on read error).
 *
 * Stored value is TEXT — caller is responsible for parsing
 * (we accept boolean / number / string at this layer for ergonomics).
 */
export async function getSetting<T extends string | number | boolean>(
  key: string,
  defaultValue: T,
): Promise<T> {
  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return defaultValue;

  const supabase = await createServerClient();
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('business_id', businessId)
    .eq('key', key)
    .maybeSingle();

  if (!data) return defaultValue;
  const raw = data.value;

  if (typeof defaultValue === 'boolean') return (raw === 'true') as T;
  if (typeof defaultValue === 'number') {
    const n = Number(raw);
    return (Number.isFinite(n) ? (n as T) : defaultValue);
  }
  return raw as T;
}

/**
 * Upsert a single per-business setting. Admin only.
 * Audit trigger on app_settings (0032) records every change.
 */
export async function setSetting(
  key: string,
  value: string | number | boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Only admins can change settings.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      {
        business_id: businessId,
        key,
        value: String(value),
        updated_by: session.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'business_id,key' },
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Setting keys (typed constants — referenced from the UI + future P&L logic) ───
export const SETTING_KEYS = {
  business_address: 'business_address',
  business_phone: 'business_phone',
  home_expense_in_pnl: 'home_expense_in_pnl',
  defaulter_days: 'defaulter_days',
} as const;

export const SETTING_DEFAULTS = {
  business_address: '',
  business_phone: '',
  home_expense_in_pnl: false,
  defaulter_days: 20,
} as const;
