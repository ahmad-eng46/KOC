'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X, AlertTriangle, Clock } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import {
  useRequestDeletion, usePendingEntityIds, useEntityPreview,
} from '@/lib/queries/deletion-requests';
import type { DeletableEntity } from '@/lib/validators/deletion-requests';

export type DeleteButtonProps = {
  entityType: DeletableEntity;
  entityId: string;
  /** "Invoice #INV-00115" — shown in both the confirm and the request modal. */
  entityDisplayName: string;
  /** Whether this viewer may delete outright. Resolved from the session server-side. */
  isAdmin: boolean;
  /**
   * What an admin's Delete actually does. Left to the caller because each
   * entity's delete action has its own signature and its own consequences —
   * this component decides WHO may delete, never HOW.
   */
  onConfirmedDelete: (reason: string) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Invoices and payments already made admins type a reason before deleting,
   * and that reason is stored on the record. Keeping it means the approval
   * system does not quietly drop a field the books rely on.
   */
  requireReason?: boolean;
  /** Extra lines under the name in the confirm dialog. */
  details?: Array<{ label: string; value: string }>;
  /**
   * Consequences the deleter should see before committing — "the ledger credit
   * will remain". Requesters get these from the entity registry; admins get
   * them here, because an admin deleting outright needs the warning most.
   */
  warnings?: string[];
  /** Fired after a successful direct delete or a filed request. */
  onDone?: () => void;
  label?: string;
  /** Icon-only by default; `true` renders a labelled button. */
  withLabel?: boolean;
  className?: string;
  disabled?: boolean;
};

/**
 * The single delete control for the whole app.
 *
 * Admin sees the confirmation they always saw. Everyone else gets a request
 * form: the button stays visible and stays useful, because hiding it would
 * leave a staff member who spots a duplicate invoice with nowhere to say so.
 * Once a request is in flight the button is disabled and says why.
 */
export function DeleteButton({
  entityType, entityId, entityDisplayName, isAdmin,
  onConfirmedDelete, requireReason = false, details, warnings, onDone,
  label = 'Delete', withLabel = false, className, disabled,
}: DeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const { data: pendingIds = {} } = usePendingEntityIds(entityType);
  const pending = pendingIds[entityId];

  const blocked = !isAdmin && !!pending;
  const title = blocked
    ? `Deletion already requested by ${pending.requester} — waiting for admin approval`
    : label;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled || blocked}
        aria-label={title}
        title={title}
        className={
          className ??
          [
            'inline-flex items-center justify-center gap-1.5 rounded-lg text-red-500',
            'hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:hover:bg-transparent',
            withLabel ? 'h-11 px-3 text-sm font-medium' : 'w-11 h-11 sm:w-9 sm:h-9',
          ].join(' ')
        }
      >
        {blocked ? <Clock size={15} /> : <Trash2 size={15} />}
        {withLabel && <span>{blocked ? 'Pending approval' : label}</span>}
      </button>

      {open && (
        isAdmin ? (
          <ConfirmDeleteDialog
            entityDisplayName={entityDisplayName}
            details={details}
            warnings={warnings}
            requireReason={requireReason}
            onClose={() => setOpen(false)}
            onConfirm={onConfirmedDelete}
            onDone={onDone}
          />
        ) : (
          <RequestDeletionDialog
            entityType={entityType}
            entityId={entityId}
            entityDisplayName={entityDisplayName}
            onClose={() => setOpen(false)}
            onDone={onDone}
          />
        )
      )}
    </>
  );
}

// ─────────────────────────────────────────────
function ConfirmDeleteDialog({
  entityDisplayName, details, warnings, requireReason, onClose, onConfirm, onDone,
}: {
  entityDisplayName: string;
  details?: Array<{ label: string; value: string }>;
  warnings?: string[];
  requireReason: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<{ ok: boolean; error?: string }>;
  onDone?: () => void;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reasonMissing = requireReason && reason.trim().length < 3;

  async function go() {
    if (reasonMissing) {
      setError('Please say why this is being deleted.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await onConfirm(reason.trim());
      if (!r.ok) {
        setError(r.error ?? 'Could not delete.');
        return;
      }
      showToast(`${entityDisplayName} deleted.`);
      onDone?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Delete this?" onClose={onClose}>
      <div className="p-5 space-y-4">
        <p className="text-sm text-gray-700">
          Delete <span className="font-medium text-gray-900">{entityDisplayName}</span>? It is
          hidden rather than erased, and stays in the audit trail.
        </p>

        {details && details.length > 0 && <DetailList details={details} />}

        {warnings?.map((w) => (
          <div key={w} className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex gap-2">
            <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">{w}</p>
          </div>
        ))}

        {requireReason && (
          <div>
            <label htmlFor="admin-delete-reason" className="block text-sm font-medium text-gray-700 mb-1.5">
              Reason *
            </label>
            <textarea
              id="admin-delete-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
              rows={2}
              placeholder="Why is this being deleted?"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {error && <ErrorBox message={error} />}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 h-11 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={go}
            disabled={busy || reasonMissing}
            className="flex-1 h-11 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// ─────────────────────────────────────────────
function RequestDeletionDialog({
  entityType, entityId, entityDisplayName, onClose, onDone,
}: {
  entityType: DeletableEntity;
  entityId: string;
  entityDisplayName: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { showToast } = useToast();
  const requestMut = useRequestDeletion();
  const { data: preview } = useEntityPreview(entityType, entityId);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);

    const r = await requestMut.mutateAsync({
      entity_type: entityType,
      entity_id: entityId,
      reason: reason.trim(),
    });

    if (!r.ok) {
      setError(r.error);
      showToast(r.error, 'error');
      return;
    }
    showToast(`${preview?.displayName ?? entityDisplayName} sent for approval — not deleted.`);
    onDone?.();
    onClose();
  }

  return (
    <Sheet title="Send for approval" icon onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-4">
        <p className="text-sm text-gray-700">
          This will be <span className="font-medium">sent for approval</span>, not deleted. The
          record stays where it is and keeps working until an admin decides.
        </p>

        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
          <p className="text-sm font-medium text-gray-900">
            {preview?.displayName ?? entityDisplayName}
          </p>
          {preview?.details && preview.details.length > 0 && (
            <dl className="mt-1.5 space-y-0.5">
              {preview.details.map((d) => (
                <div key={d.label} className="flex gap-2 text-xs">
                  <dt className="text-gray-500 w-24 shrink-0">{d.label}</dt>
                  <dd className="text-gray-800 min-w-0 truncate">{d.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {preview?.warnings?.map((w) => (
          <div key={w} className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex gap-2">
            <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">{w}</p>
          </div>
        ))}

        <div>
          <label htmlFor="deletion-reason" className="block text-sm font-medium text-gray-700 mb-1.5">
            Reason <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="deletion-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
            rows={3}
            placeholder="Duplicate invoice — the customer already has INV-00114"
            className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            The admin sees this. Leave it blank if the record speaks for itself.
          </p>
        </div>

        {error && <ErrorBox message={error} />}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={requestMut.isPending}
            className="flex-1 h-11 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={requestMut.isPending}
            className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {requestMut.isPending ? 'Sending…' : 'Send for Approval'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

// ─────────────────────────────────────────────
/**
 * Portalled to <body>: delete buttons sit inside tables and sometimes inside
 * forms, and a dialog rendered in place would inherit both the clipping and,
 * in a form, the submit. React portals still propagate events through the React
 * tree, so the request form stops propagation too.
 */
function Sheet({
  title, icon, onClose, children,
}: {
  title: string;
  icon?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            {icon && <AlertTriangle size={17} className="text-amber-500" />}
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function DetailList({ details }: { details: Array<{ label: string; value: string }> }) {
  return (
    <dl className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 space-y-0.5">
      {details.map((d) => (
        <div key={d.label} className="flex gap-2 text-xs">
          <dt className="text-gray-500 w-24 shrink-0">{d.label}</dt>
          <dd className="text-gray-800 min-w-0 truncate">{d.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
      <p className="text-sm text-red-700">{message}</p>
    </div>
  );
}
