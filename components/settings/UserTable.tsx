'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import {
  Plus, Search, MoreVertical, Pencil, Key, Power, Trash2, RotateCcw,
  Clock, ScrollText, X as XIcon, Copy, CheckCircle2,
} from 'lucide-react';
import {
  useUsers, useCreateUser, useUpdateUser, useResetUserPassword,
  useSoftDeleteUser, useRestoreUser, useLoginHistory,
} from '@/lib/queries/users';
import { userRoles, type UserRole } from '@/lib/validators/user';
import type { UserListRow } from '@/lib/actions/user';
import { UserForm, type UserFormValues } from './UserForm';
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/DropdownMenu';

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin', accountant: 'Accountant', staff: 'Staff', viewer: 'Viewer',
};

type Props = { currentUserId: string };

export function UserTable({ currentUserId }: Props) {
  const router = useRouter();
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled' | 'deleted'>('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserListRow | null>(null);
  const [resetTarget, setResetTarget] = useState<UserListRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserListRow | null>(null);
  const [historyTarget, setHistoryTarget] = useState<UserListRow | null>(null);

  const { data: rows = [], isLoading } = useUsers(includeDeleted);
  const createMut = useCreateUser();
  const updateMut = useUpdateUser();
  const resetMut = useResetUserPassword();
  const deleteMut = useSoftDeleteUser();
  const restoreMut = useRestoreUser();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => roleFilter === 'all' || r.role === roleFilter)
      .filter((r) => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'deleted') return !!r.deleted_at;
        if (statusFilter === 'active') return !r.deleted_at && r.is_active;
        return !r.deleted_at && !r.is_active;
      })
      .filter((r) => !q || r.full_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
  }, [rows, search, roleFilter, statusFilter]);

  // ── Create ──
  const [createdPassword, setCreatedPassword] = useState<{ email: string; password: string } | null>(null);

  async function handleCreate(values: UserFormValues) {
    const r = await createMut.mutateAsync({
      email: values.email, fullName: values.fullName, phone: values.phone || undefined,
      role: values.role, password: values.password, businessIds: values.businessIds,
    });
    if (!r.ok) return;
    setCreatedPassword({ email: values.email, password: values.password });
    setCreateOpen(false);
  }

  // ── Edit ──
  async function handleEdit(values: UserFormValues) {
    if (!editTarget) return;
    const r = await updateMut.mutateAsync({
      id: editTarget.id,
      input: {
        fullName: values.fullName,
        phone: values.phone || '',
        role: editTarget.id === currentUserId ? undefined : values.role,
        isActive: values.isActive,
        businessIds: values.businessIds,
      },
    });
    if (r.ok) setEditTarget(null);
  }

  return (
    <>
      {/* Toolbar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or email…"
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox" checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            Show deleted
          </label>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 ml-auto"
          >
            <Plus size={15} /> Add User
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500">Role:</span>
          {(['all', ...userRoles] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r as typeof roleFilter)}
              className={[
                'px-3 h-7 text-xs font-medium rounded-full border capitalize',
                roleFilter === r ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {r === 'all' ? 'All' : ROLE_LABEL[r as UserRole]}
            </button>
          ))}
          <span className="text-xs font-medium text-gray-500 ml-3">Status:</span>
          {(['all', 'active', 'disabled', 'deleted'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={[
                'px-3 h-7 text-xs font-medium rounded-full border capitalize',
                statusFilter === s ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
              ].join(' ')}
              disabled={s === 'deleted' && !includeDeleted}
              title={s === 'deleted' && !includeDeleted ? 'Enable "Show deleted" first' : undefined}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 mt-4">
          <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden mt-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Businesses</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Last Login</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">No users match.</td></tr>
                )}
                {filtered.map((u) => (
                  <tr key={u.id} className={[
                    'hover:bg-gray-50',
                    u.deleted_at ? 'opacity-60' : '',
                    u.id === currentUserId ? 'bg-blue-50/30' : '',
                  ].join(' ')}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{u.full_name}</span>
                      {u.id === currentUserId && <span className="ml-1.5 text-xs text-blue-600">(you)</span>}
                      {u.phone && <p className="text-xs text-gray-500">{u.phone}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs font-mono">{u.email}</td>
                    <td className="px-4 py-3">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.businesses.length === 0 ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          u.businesses.slice(0, 3).map((b) => (
                            <span key={b.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
                              {b.name}
                            </span>
                          ))
                        )}
                        {u.businesses.length > 3 && (
                          <span className="text-xs text-gray-500">+{u.businesses.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge user={u} /></td>
                    <td className="px-4 py-3 text-xs text-gray-500 tabular-nums">
                      {u.last_login_at ? format(parseISO(u.last_login_at), 'dd MMM yyyy HH:mm') : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <KebabMenu
                        user={u}
                        isSelf={u.id === currentUserId}
                        onEdit={() => setEditTarget(u)}
                        onReset={() => setResetTarget(u)}
                        onToggleActive={() => updateMut.mutate({ id: u.id, input: { isActive: !u.is_active } })}
                        onDelete={() => setDeleteTarget(u)}
                        onRestore={() => restoreMut.mutate(u.id)}
                        onHistory={() => setHistoryTarget(u)}
                        onAudit={() => router.push(`/reports/audit?userId=${u.id}`)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-2 mt-4">
            {filtered.length === 0 && (
              <p className="text-center py-8 text-sm text-gray-400">No users match.</p>
            )}
            {filtered.map((u) => (
              <div key={u.id} className={['bg-white rounded-2xl border border-gray-200 p-4', u.deleted_at ? 'opacity-60' : ''].join(' ')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">
                      {u.full_name}{u.id === currentUserId && <span className="ml-1.5 text-xs text-blue-600">(you)</span>}
                    </p>
                    <p className="text-xs text-gray-500 truncate font-mono">{u.email}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <RoleBadge role={u.role} />
                      <StatusBadge user={u} />
                    </div>
                  </div>
                  <KebabMenu
                    user={u} isSelf={u.id === currentUserId}
                    onEdit={() => setEditTarget(u)} onReset={() => setResetTarget(u)}
                    onToggleActive={() => updateMut.mutate({ id: u.id, input: { isActive: !u.is_active } })}
                    onDelete={() => setDeleteTarget(u)} onRestore={() => restoreMut.mutate(u.id)}
                    onHistory={() => setHistoryTarget(u)}
                    onAudit={() => router.push(`/reports/audit?userId=${u.id}`)}
                  />
                </div>
              </div>
            ))}
          </div>

          {(() => {
            // Surface errors from any of the three mutations:
            //  - thrown errors (network etc.)             → mutation.error.message
            //  - server-action {ok:false} return values   → mutation.data.error
            // The latter is what last-admin invariants and self-protection checks return.
            const msg =
              (updateMut.data && !updateMut.data.ok ? updateMut.data.error : null) ??
              (deleteMut.data && !deleteMut.data.ok ? deleteMut.data.error : null) ??
              (restoreMut.data && !restoreMut.data.ok ? restoreMut.data.error : null) ??
              updateMut.error?.message ??
              deleteMut.error?.message ??
              restoreMut.error?.message ??
              null;
            return (
              <p className="text-xs text-gray-400 mt-3">
                {filtered.length} user{filtered.length === 1 ? '' : 's'}
                {msg && <span className="ml-2 text-red-600">· {msg}</span>}
              </p>
            );
          })()}
        </>
      )}

      {/* Modals */}
      {createOpen && (
        <Modal title="Add User" onClose={() => setCreateOpen(false)}>
          <UserForm
            mode="create"
            busy={createMut.isPending}
            serverError={createMut.data && !createMut.data.ok ? createMut.data.error : null}
            onCancel={() => setCreateOpen(false)}
            onSubmit={handleCreate}
          />
        </Modal>
      )}

      {editTarget && (
        <Modal title={`Edit ${editTarget.full_name}`} onClose={() => setEditTarget(null)}>
          <UserForm
            mode="edit"
            initial={editTarget}
            busy={updateMut.isPending}
            serverError={updateMut.data && !updateMut.data.ok ? updateMut.data.error : null}
            onCancel={() => setEditTarget(null)}
            onSubmit={handleEdit}
          />
          {editTarget.id === currentUserId && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
              You&apos;re editing your own profile. You can&apos;t change your own role here — ask another admin.
            </p>
          )}
        </Modal>
      )}

      {resetTarget && (
        <ResetPasswordModal
          user={resetTarget}
          busy={resetMut.isPending}
          error={resetMut.data && !resetMut.data.ok ? resetMut.data.error : null}
          onClose={() => { setResetTarget(null); resetMut.reset(); }}
          onSubmit={async (pwd) => {
            const r = await resetMut.mutateAsync({ id: resetTarget.id, newPassword: pwd });
            if (r.ok) {
              setCreatedPassword({ email: resetTarget.email, password: pwd });
              setResetTarget(null);
            }
          }}
        />
      )}

      {createdPassword && (
        <PasswordRevealDialog
          email={createdPassword.email}
          password={createdPassword.password}
          onClose={() => setCreatedPassword(null)}
        />
      )}

      {deleteTarget && (
        <DeleteUserDialog
          user={deleteTarget}
          busy={deleteMut.isPending}
          error={deleteMut.data && !deleteMut.data.ok ? deleteMut.data.error : null}
          onClose={() => { setDeleteTarget(null); deleteMut.reset(); }}
          onSubmit={async (reason) => {
            const r = await deleteMut.mutateAsync({ id: deleteTarget.id, reason });
            if (r.ok) setDeleteTarget(null);
          }}
        />
      )}

      {historyTarget && (
        <LoginHistoryModal user={historyTarget} onClose={() => setHistoryTarget(null)} />
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// Kebab menu — on the shared DropdownMenu:
//  - portal + fixed positioning, so the table wrapper's overflow-hidden
//    can't clip it and it flips upward near the viewport bottom
//  - no onBlur close (the old onBlur+120ms timeout unmounted the panel
//    between mousedown and mouseup, so every action's onClick was dead)
// ─────────────────────────────────────────────
function KebabMenu({
  user, isSelf, onEdit, onReset, onToggleActive, onDelete, onRestore, onHistory, onAudit,
}: {
  user: UserListRow; isSelf: boolean;
  onEdit: () => void; onReset: () => void; onToggleActive: () => void;
  onDelete: () => void; onRestore: () => void; onHistory: () => void; onAudit: () => void;
}) {
  const isDeleted = !!user.deleted_at;

  return (
    <DropdownMenu trigger={<MoreVertical size={14} />} triggerLabel={`Actions for ${user.full_name}`}>
      {(close) => (
        <>
          {!isDeleted && (
            <>
              <DropdownMenuItem icon={Pencil} onClick={onEdit} close={close}>Edit user</DropdownMenuItem>
              <DropdownMenuItem icon={Key} onClick={onReset} close={close}>Reset password</DropdownMenuItem>
              <DropdownMenuItem
                icon={Power} onClick={onToggleActive} close={close}
                disabled={isSelf} hint={isSelf ? 'Cannot disable self' : undefined}
              >
                {user.is_active ? 'Disable' : 'Enable'}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem icon={Clock} onClick={onHistory} close={close}>Login history</DropdownMenuItem>
          <DropdownMenuItem icon={ScrollText} onClick={onAudit} close={close}>View audit log</DropdownMenuItem>
          {!isDeleted && (
            <DropdownMenuItem
              icon={Trash2} onClick={onDelete} close={close}
              disabled={isSelf} danger hint={isSelf ? 'Cannot delete self' : undefined}
            >
              Delete user
            </DropdownMenuItem>
          )}
          {isDeleted && (
            <DropdownMenuItem icon={RotateCcw} onClick={onRestore} close={close}>Restore user</DropdownMenuItem>
          )}
        </>
      )}
    </DropdownMenu>
  );
}

// ─────────────────────────────────────────────
// Reset password modal
// ─────────────────────────────────────────────
function ResetPasswordModal({
  user, busy, error, onClose, onSubmit,
}: {
  user: UserListRow; busy?: boolean; error?: string | null;
  onClose: () => void; onSubmit: (pwd: string) => Promise<void>;
}) {
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const v = pwd.length < 8 ? 'Password must be at least 8 characters'
    : pwd !== confirm ? 'Passwords do not match' : null;

  return (
    <Modal title={`Reset password for ${user.full_name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          The user&apos;s existing sessions will be signed out immediately. You&apos;ll see the new password once after success.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              className="w-full h-11 px-3 pr-10 rounded-xl border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button type="button" onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-gray-400 hover:text-gray-700">
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm</label>
          <input
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {(v || error) && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3"><p className="text-sm text-red-700">{v ?? error}</p></div>
        )}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} disabled={busy} className="flex-1 h-11 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button
            disabled={!!v || busy}
            onClick={() => onSubmit(pwd)}
            className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Resetting…' : 'Reset Password'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Password reveal dialog (used after create + reset)
// ─────────────────────────────────────────────
function PasswordRevealDialog({
  email, password, onClose,
}: { email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal title="Password set" onClose={acknowledged ? onClose : undefined}>
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">Share this password securely now.</p>
          <p className="text-xs text-amber-700 mt-1">
            It cannot be retrieved later. If you forget to share it, reset the password again.
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Email</p>
          <p className="text-sm font-mono mt-0.5">{email}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Password</p>
          <div className="flex items-center gap-2 mt-1">
            <code className="flex-1 px-3 py-2 rounded-lg bg-gray-100 font-mono text-sm break-all">{password}</code>
            <button
              onClick={copy}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              {copied ? <><CheckCircle2 size={14} className="text-green-600" /> Copied</> : <><Copy size={14} /> Copy</>}
            </button>
          </div>
        </div>
        <label className="flex items-start gap-2 cursor-pointer pt-2 border-t border-gray-100">
          <input
            type="checkbox" checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm text-gray-700">I&apos;ve shared this password securely with the user.</span>
        </label>
        <button
          disabled={!acknowledged}
          onClick={onClose}
          className="w-full h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Delete dialog
// ─────────────────────────────────────────────
function DeleteUserDialog({
  user, busy, error, onClose, onSubmit,
}: {
  user: UserListRow; busy?: boolean; error?: string | null;
  onClose: () => void; onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal title={`Delete ${user.full_name}?`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-gray-700">
          Soft-deletes the user and bans them from signing in. All their existing data
          (invoices, payments, audit history) is preserved.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason <span className="text-red-500">*</span></label>
          <textarea
            value={reason} onChange={(e) => setReason(e.target.value)}
            rows={3} placeholder="e.g. Employee left the company"
            className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3"><p className="text-sm text-red-700">{error}</p></div>}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} disabled={busy} className="flex-1 h-11 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button
            disabled={!reason.trim() || busy}
            onClick={() => onSubmit(reason)}
            className="flex-1 h-11 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Login history modal
// ─────────────────────────────────────────────
function LoginHistoryModal({ user, onClose }: { user: UserListRow; onClose: () => void }) {
  const { data: history = [], isLoading } = useLoginHistory(user.id);
  return (
    <Modal title={`Login history — ${user.full_name}`} onClose={onClose} width="max-w-2xl">
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : history.length === 0 ? (
        <p className="text-sm text-gray-500">No login history available.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {history.map((h) => (
            <li key={h.session_id} className="py-2.5 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-gray-900 tabular-nums">
                  {format(parseISO(h.signed_in_at), 'dd MMM yyyy HH:mm:ss')}
                </p>
                {h.user_agent && <p className="text-xs text-gray-500 truncate max-w-xs" title={h.user_agent}>{h.user_agent}</p>}
              </div>
              <p className="text-xs font-mono text-gray-500 shrink-0">{h.ip ?? '—'}</p>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Shared modal shell
// ─────────────────────────────────────────────
function Modal({
  title, children, onClose, width,
}: {
  title: string; children: React.ReactNode;
  onClose?: () => void; width?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={(e) => { if (onClose && e.target === e.currentTarget) onClose(); }}
    >
      <div className={['w-full bg-white rounded-2xl shadow-xl my-4', width ?? 'max-w-md'].join(' ')}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
              <XIcon size={18} />
            </button>
          )}
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  const styles: Record<UserRole, string> = {
    admin:      'bg-purple-50 text-purple-700',
    accountant: 'bg-blue-50   text-blue-700',
    staff:      'bg-amber-50  text-amber-700',
    viewer:     'bg-gray-100  text-gray-600',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${styles[role]}`}>{role}</span>;
}

function StatusBadge({ user }: { user: UserListRow }) {
  if (user.deleted_at) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">Deleted</span>;
  }
  if (!user.is_active) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Disabled</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">Active</span>;
}

// helper icons re-imported for ResetPasswordModal
import { Eye, EyeOff } from 'lucide-react';
