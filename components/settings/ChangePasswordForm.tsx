'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Eye, EyeOff, LogOut } from 'lucide-react';
import { firstPasswordSchema, type FirstPasswordInput } from '@/lib/validators/user';
import { changeOwnPassword } from '@/lib/actions/user';
import { createClient } from '@/lib/supabase/client';
import { scorePassword, STRENGTH_LABEL, STRENGTH_STYLE } from '@/lib/password-strength';

type Props = { mandatory: boolean };

export function ChangePasswordForm({ mandatory }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [show, setShow] = useState<Record<'current' | 'next' | 'confirm', boolean>>({
    current: false, next: false, confirm: false,
  });

  const {
    register, handleSubmit, control,
    formState: { errors, isSubmitting },
  } = useForm<FirstPasswordInput>({ resolver: zodResolver(firstPasswordSchema) });

  const nextPassword = useWatch({ control, name: 'newPassword' });
  const strength = scorePassword(nextPassword ?? '');

  async function onSubmit(values: FirstPasswordInput) {
    setServerError(null);
    const r = await changeOwnPassword(values.currentPassword, values.newPassword);
    if (!r.ok) {
      setServerError(r.error);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const toggle = (k: 'current' | 'next' | 'confirm') =>
    setShow((s) => ({ ...s, [k]: !s[k] }));

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-6">
        <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
          <Lock size={20} className="text-blue-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Set Your Password</h1>
        <p className="text-sm text-gray-500 mt-1.5">
          {mandatory
            ? 'Your admin created your account with a temporary password. Set your own to continue.'
            : 'Choose a new password for your account.'}
        </p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5"
      >
        <PasswordField
          id="currentPassword"
          label={mandatory ? 'Temporary Password' : 'Current Password'}
          autoComplete="current-password"
          visible={show.current}
          onToggle={() => toggle('current')}
          error={errors.currentPassword?.message}
          {...register('currentPassword')}
        />

        <div>
          <PasswordField
            id="newPassword"
            label="New Password"
            autoComplete="new-password"
            visible={show.next}
            onToggle={() => toggle('next')}
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          {strength !== null && (
            <div className="mt-2">
              <div className="flex gap-1" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={[
                      'h-1 flex-1 rounded-full',
                      i <= strength ? STRENGTH_STYLE[strength].bar : 'bg-gray-200',
                    ].join(' ')}
                  />
                ))}
              </div>
              <p className={['mt-1 text-xs', STRENGTH_STYLE[strength].text].join(' ')}>
                {STRENGTH_LABEL[strength]}
              </p>
            </div>
          )}
        </div>

        <PasswordField
          id="confirmPassword"
          label="Confirm Password"
          autoComplete="new-password"
          visible={show.confirm}
          onToggle={() => toggle('confirm')}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <p className="text-xs text-gray-500">Password must be at least 8 characters.</p>

        {serverError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
            <p className="text-sm text-red-700">{serverError}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-11 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Setting password…' : 'Set Password'}
        </button>
      </form>

      {/* No skip. Signing out is the only other way off this page — someone who
          cannot remember the temporary password needs their admin, not a bypass. */}
      <button
        onClick={signOut}
        className="mt-4 mx-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 h-11 px-3"
      >
        <LogOut size={13} /> Sign out
      </button>
    </div>
  );
}

type FieldProps = {
  id: string;
  label: string;
  autoComplete: string;
  visible: boolean;
  onToggle: () => void;
  error?: string;
  name: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  onBlur: React.FocusEventHandler<HTMLInputElement>;
};

const PasswordField = function PasswordField({
  id, label, autoComplete, visible, onToggle, error, ...field
}: FieldProps & { ref?: React.Ref<HTMLInputElement> }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          className="w-full h-11 pl-3 pr-11 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="••••••••"
          {...field}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-0 top-0 h-11 w-11 flex items-center justify-center text-gray-400 hover:text-gray-600"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};
