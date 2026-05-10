import { format, parseISO } from 'date-fns';
import { requireAuth } from '@/lib/auth/guards';
import { createServerClient } from '@/lib/supabase/server';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { ChangePasswordForm } from '@/components/profile/ChangePasswordForm';

export const metadata = { title: 'My Profile — KOC' };

export default async function ProfilePage() {
  const { user, profile } = await requireAuth();

  const supabase = await createServerClient();
  const [meRes, ubRes] = await Promise.all([
    supabase.from('users').select('full_name, phone, last_login_at, email').eq('id', user.id).single(),
    supabase
      .from('user_businesses')
      .select('businesses(id, name)')
      .eq('user_id', user.id),
  ]);

  type RawBiz = { id: string; name: string };
  type RawUB = { businesses: RawBiz | RawBiz[] | null };
  const businesses = ((ubRes.data as unknown as RawUB[]) ?? [])
    .map((ub) => (Array.isArray(ub.businesses) ? ub.businesses[0] : ub.businesses))
    .filter((b): b is RawBiz => !!b);

  const me = meRes.data;

  return (
    <div className="p-4 md:p-6 space-y-8 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Update your details and password</p>
      </div>

      <Section title="Profile" description="Visible to other users in audit logs and reports.">
        <ProfileForm initial={{ fullName: me?.full_name ?? '', phone: me?.phone ?? '' }} />
      </Section>

      <Section title="Account" description="Read-only — only an admin can change these.">
        <div className="space-y-2 text-sm">
          <Row label="Email" value={me?.email ?? user.email ?? ''} mono />
          <Row label="Role" value={profile.role} capitalize />
          <Row
            label="Last Login"
            value={me?.last_login_at ? format(parseISO(me.last_login_at), 'dd MMM yyyy HH:mm') : 'No record'}
          />
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Business Access</p>
            <div className="flex flex-wrap gap-1.5">
              {businesses.length === 0 ? (
                <span className="text-sm text-gray-400">None</span>
              ) : (
                businesses.map((b) => (
                  <span key={b.id} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                    {b.name}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Change Password" description="Sign in again on other devices after changing.">
        <ChangePasswordForm />
      </Section>
    </div>
  );
}

function Section({
  title, description, children,
}: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-4">{children}</div>
    </section>
  );
}

function Row({ label, value, mono, capitalize }: { label: string; value: string; mono?: boolean; capitalize?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b border-gray-100 last:border-0 py-2">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={['text-gray-900', mono ? 'font-mono text-xs' : '', capitalize ? 'capitalize' : ''].join(' ')}>
        {value}
      </span>
    </div>
  );
}
