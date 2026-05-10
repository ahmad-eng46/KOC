import { requireRole } from '@/lib/auth/guards';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSetting, SETTING_KEYS, SETTING_DEFAULTS } from '@/lib/settings';
import { SettingsForm } from '@/components/settings/SettingsForm';

export const metadata = { title: 'Settings — KOC' };

export default async function SettingsPage() {
  await requireRole('admin');

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-sm text-gray-500">No active business.</p>
      </div>
    );
  }

  const supabase = await createServerClient();
  const { data: biz } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', businessId)
    .single();

  const [businessAddress, businessPhone, homeInPnl, defaulterDays] = await Promise.all([
    getSetting(SETTING_KEYS.business_address, SETTING_DEFAULTS.business_address),
    getSetting(SETTING_KEYS.business_phone, SETTING_DEFAULTS.business_phone),
    getSetting(SETTING_KEYS.home_expense_in_pnl, SETTING_DEFAULTS.home_expense_in_pnl),
    getSetting(SETTING_KEYS.defaulter_days, SETTING_DEFAULTS.defaulter_days),
  ]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Per-business configuration. Admin only.</p>
      </div>
      <SettingsForm
        initial={{
          business_name: biz?.name ?? '',
          business_address: businessAddress,
          business_phone: businessPhone,
          home_expense_in_pnl: homeInPnl,
          defaulter_days: defaulterDays,
        }}
      />
    </div>
  );
}
