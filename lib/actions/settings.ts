'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';
import { setSetting, SETTING_KEYS } from '@/lib/settings';

type SettingsInput = {
  business_name: string;
  business_address: string;
  business_phone: string;
  home_expense_in_pnl: boolean;
  defaulter_days: number;
};

type Result = { ok: true } | { ok: false; error: string };

export async function saveSettings(input: SettingsInput): Promise<Result> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Only admins can change settings.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  // Validate
  if (!input.business_name.trim()) return { ok: false, error: 'Business name is required.' };
  if (input.defaulter_days < 1 || input.defaulter_days > 365) {
    return { ok: false, error: 'Defaulter days must be 1-365.' };
  }

  const supabase = await createServerClient();

  // 1. Update business name in businesses table (single source of truth for switcher etc.)
  const { error: nameErr } = await supabase
    .from('businesses')
    .update({ name: input.business_name.trim() })
    .eq('id', businessId);
  if (nameErr) return { ok: false, error: nameErr.message };

  // 2. Upsert each app_settings row
  const settings: Array<{ key: string; value: string | number | boolean }> = [
    { key: SETTING_KEYS.business_address, value: input.business_address.trim() },
    { key: SETTING_KEYS.business_phone, value: input.business_phone.trim() },
    { key: SETTING_KEYS.home_expense_in_pnl, value: input.home_expense_in_pnl },
    { key: SETTING_KEYS.defaulter_days, value: input.defaulter_days },
  ];

  for (const s of settings) {
    const r = await setSetting(s.key, s.value);
    if (!r.ok) return r;
  }

  revalidatePath('/settings');
  revalidatePath('/', 'layout'); // refresh business name in header / switcher
  return { ok: true };
}
