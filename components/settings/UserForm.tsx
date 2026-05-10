'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { useBusinessStore } from '@/lib/store/business';
import { userRoles, type UserRole } from '@/lib/validators/user';
import type { UserListRow } from '@/lib/actions/user';

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  accountant: 'Accountant',
  staff: 'Staff',
  viewer: 'Viewer',
};

export type UserFormValues = {
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  password: string;
  isActive: boolean;
  businessIds: string[];
};

type Props = {
  mode: 'create' | 'edit';
  initial?: UserListRow;
  busy?: boolean;
  serverError?: string | null;
  onCancel: () => void;
  onSubmit: (values: UserFormValues) => void | Promise<void>;
};

export function UserForm({ mode, initial, busy, serverError, onCancel, onSubmit }: Props) {
  const allBusinesses = useBusinessStore((s) => s.businesses);

  const [fullName, setFullName] = useState(initial?.full_name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [role, setRole] = useState<UserRole>((initial?.role as UserRole) ?? 'staff');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [businessIds, setBusinessIds] = useState<string[]>(
    initial?.businesses.map((b) => b.id) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const isCreate = mode === 'create';
  const phoneRegex = /^(\+92|0)?[0-9]{10,11}$/;

  function toggleBusiness(id: string) {
    setBusinessIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function clientValidate(): string | null {
    if (fullName.trim().length < 2) return 'Full name must be at least 2 characters.';
    if (isCreate) {
      if (!email.includes('@')) return 'Enter a valid email.';
      if (password.length < 8) return 'Password must be at least 8 characters.';
    }
    if (phone.trim() && !phoneRegex.test(phone.trim())) return 'Enter a valid Pakistani phone.';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = clientValidate();
    if (v) {
      setError(v);
      return;
    }
    await onSubmit({
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      role,
      password,
      isActive,
      businessIds,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Full Name" required>
        <input
          ref={firstFieldRef}
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </Field>

      <Field label="Email" required={isCreate}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          readOnly={!isCreate}
          className={[
            'w-full h-11 px-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
            isCreate ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed',
          ].join(' ')}
        />
        {!isCreate && <p className="text-xs text-gray-400 mt-1">Email is immutable once a user is created.</p>}
      </Field>

      <Field label="Phone (optional)">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0300-1234567"
          className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </Field>

      <Field label="Role" required>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {userRoles.map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </select>
      </Field>

      {isCreate && (
        <Field label="Initial Password" required>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              className="w-full h-11 px-3 pr-10 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-gray-400 hover:text-gray-700"
            >
              {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            You'll be shown this password once after creation. Share it securely with the user — it can't be retrieved later.
          </p>
        </Field>
      )}

      {!isCreate && (
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span>
            <span className="block text-sm font-medium text-gray-900">Active</span>
            <span className="block text-xs text-gray-500 mt-0.5">
              Disabled users cannot sign in. Existing sessions are revoked when you disable a user.
            </span>
          </span>
        </label>
      )}

      <Field label="Business Access">
        {allBusinesses.length === 0 ? (
          <p className="text-sm text-gray-500">No businesses configured.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allBusinesses.map((b) => {
              const on = businessIds.includes(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggleBusiness(b.id)}
                  className={[
                    'inline-flex items-center gap-1.5 px-3 h-9 rounded-xl border text-sm font-medium',
                    on
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50',
                  ].join(' ')}
                >
                  {b.name}
                  {on && <X size={12} />}
                </button>
              );
            })}
          </div>
        )}
      </Field>

      {(error || serverError) && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error ?? serverError}</p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex-1 h-11 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : isCreate ? 'Create User' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
