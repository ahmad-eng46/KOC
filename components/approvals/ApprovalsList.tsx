'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  FileText, User, Package, Receipt, CreditCard, RotateCcw, Truck,
  Tag, MapPin, Layers, Check, X, ExternalLink, AlertTriangle,
} from 'lucide-react';
import { relativeTime } from '@/lib/activity-display';
import {
  useDeletionRequests, useResolveDeletionRequest, useCancelDeletionRequest,
} from '@/lib/queries/deletion-requests';
import {
  ENTITY_LABELS, STATUS_LABELS, STATUS_STYLES, entityHref,
  type DeletableEntity, type DeletionRequestStatus,
} from '@/lib/validators/deletion-requests';
import type { DeletionRequest } from '@/lib/actions/deletion-requests';
import { useToast } from '@/components/ui/Toast';

const ENTITY_ICONS: Record<DeletableEntity, React.ElementType> = {
  invoice: FileText, customer: User, product: Package, expense: Receipt,
  payment: CreditCard, return: RotateCcw, supplier: Truck,
  stock_purchase: Package, supplier_payment: CreditCard,
  brand: Tag, location: MapPin, customer_category: Layers,
  expense_asset: Receipt, expense_sub_type: Layers,
};

const FILTERS: Array<{ value: DeletionRequestStatus | 'all'; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

export function ApprovalsList({ isAdmin, currentUserId }: { isAdmin: boolean; currentUserId: string }) {
  const [filter, setFilter] = useState<DeletionRequestStatus | 'all'>('pending');
  const { data = [], isLoading, error } = useDeletionRequests(filter);

  const pending = data.filter((r) => r.status === 'pending');
  const resolved = data.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={[
              'shrink-0 px-3 h-11 sm:h-8 rounded-full border text-xs font-medium',
              filter === f.value
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
            ].join(' ')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-700">
            {error instanceof Error ? error.message : 'Could not load requests.'}
          </p>
        </div>
      )}

      {!isLoading && !error && data.length === 0 && (
        <p className="text-sm text-gray-400 py-10 text-center">
          {filter === 'pending' ? 'Nothing is waiting for a decision.' : 'No requests here.'}
        </p>
      )}

      {pending.length > 0 && (
        <section className="space-y-3">
          {pending.map((r) => (
            <RequestCard key={r.id} request={r} isAdmin={isAdmin} currentUserId={currentUserId} />
          ))}
        </section>
      )}

      {resolved.length > 0 && (
        <section className="space-y-3">
          {pending.length > 0 && (
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">
              Resolved
            </h2>
          )}
          {resolved.map((r) => (
            <RequestCard key={r.id} request={r} isAdmin={isAdmin} currentUserId={currentUserId} />
          ))}
        </section>
      )}
    </div>
  );
}

function RequestCard({
  request, isAdmin, currentUserId,
}: {
  request: DeletionRequest;
  isAdmin: boolean;
  currentUserId: string;
}) {
  const { showToast } = useToast();
  const resolveMut = useResolveDeletionRequest();
  const cancelMut = useCancelDeletionRequest();
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [drift, setDrift] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const Icon = ENTITY_ICONS[request.entity_type] ?? FileText;
  const href = entityHref(request.entity_type, request.entity_id);
  const isPending = request.status === 'pending';
  const isMine = request.requested_by === currentUserId;

  async function approve(acknowledgeModified = false) {
    setError(null);
    const r = await resolveMut.mutateAsync({
      request_id: request.id,
      action: 'approve',
      acknowledge_modified: acknowledgeModified,
    });
    if (!r.ok) {
      // A drift refusal is not a failure — it is the warning doing its job.
      if (r.drift?.length) {
        setDrift(r.drift);
        setError(r.error);
        return;
      }
      setError(r.error);
      showToast(r.error, 'error');
      return;
    }
    showToast(`${request.entity_display_name} deleted.`);
  }

  async function reject() {
    setError(null);
    const r = await resolveMut.mutateAsync({
      request_id: request.id,
      action: 'reject',
      review_note: rejectReason.trim() || undefined,
    });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setRejecting(false);
    showToast('Request rejected.');
  }

  async function cancel() {
    const r = await cancelMut.mutateAsync(request.id);
    if (!r.ok) {
      showToast(r.error, 'error');
      return;
    }
    showToast('Request withdrawn.');
  }

  return (
    <article className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <span className="mt-0.5 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
          <Icon size={16} className="text-gray-500" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {request.entity_display_name}
              </p>
              <p className="text-xs text-gray-500">{ENTITY_LABELS[request.entity_type]}</p>
            </div>
            <span
              className={[
                'shrink-0 px-2 py-0.5 rounded-full border text-[11px] font-semibold uppercase tracking-wide',
                STATUS_STYLES[request.status],
              ].join(' ')}
            >
              {STATUS_LABELS[request.status]}
            </span>
          </div>

          <Metadata metadata={request.entity_metadata} />

          <p className="mt-2 text-xs text-gray-500">
            Requested by <span className="font-medium text-gray-700">{request.requester_name}</span>
            {' · '}{relativeTime(request.requested_at)}
          </p>
          {request.reason ? (
            <p className="mt-1 text-sm text-gray-800 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              “{request.reason}”
            </p>
          ) : (
            <p className="mt-1 text-sm text-gray-400 italic">No reason given.</p>
          )}

          {request.status === 'rejected' && request.review_note && (
            <p className="mt-2 text-xs text-red-700">
              Rejected by {request.resolver_name ?? 'an admin'}: “{request.review_note}”
            </p>
          )}
          {request.status === 'approved' && (
            <p className="mt-2 text-xs text-green-700">
              Approved by {request.resolver_name ?? 'an admin'}
              {request.resolved_at ? ` · ${relativeTime(request.resolved_at)}` : ''}
            </p>
          )}
          {request.status === 'cancelled' && (
            <p className="mt-2 text-xs text-gray-500">Withdrawn by the requester.</p>
          )}

          {drift && (
            <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
                <AlertTriangle size={13} /> Changed since the request
              </p>
              <ul className="mt-1 text-xs text-amber-800 list-disc pl-4 space-y-0.5">
                {drift.map((d) => <li key={d}>{d}</li>)}
              </ul>
            </div>
          )}

          {error && !drift && <p className="mt-2 text-xs text-red-600">{error}</p>}

          {rejecting && (
            <div className="mt-3 space-y-2">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                autoFocus
                rows={2}
                placeholder="Why is this being kept? The requester sees this."
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setRejecting(false)}
                  className="flex-1 h-11 sm:h-9 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={reject}
                  disabled={resolveMut.isPending || rejectReason.trim().length < 3}
                  className="flex-1 h-11 sm:h-9 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {resolveMut.isPending ? 'Rejecting…' : 'Confirm reject'}
                </button>
              </div>
            </div>
          )}

          {isPending && !rejecting && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {href && (
                <Link
                  href={href}
                  className="inline-flex items-center gap-1.5 h-11 sm:h-9 px-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <ExternalLink size={14} /> View item
                </Link>
              )}

              {isAdmin && (
                <>
                  <button
                    onClick={() => setRejecting(true)}
                    disabled={resolveMut.isPending}
                    className="inline-flex items-center gap-1.5 h-11 sm:h-9 px-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 sm:ml-auto"
                  >
                    <X size={14} /> Reject
                  </button>
                  <button
                    onClick={() => approve(!!drift)}
                    disabled={resolveMut.isPending}
                    className="inline-flex items-center gap-1.5 h-11 sm:h-9 px-3 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                  >
                    <Check size={14} />
                    {resolveMut.isPending ? 'Deleting…' : drift ? 'Approve anyway' : 'Approve delete'}
                  </button>
                </>
              )}

              {!isAdmin && isMine && (
                <button
                  onClick={cancel}
                  disabled={cancelMut.isPending}
                  className="inline-flex items-center gap-1.5 h-11 sm:h-9 px-3 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 sm:ml-auto"
                >
                  <X size={14} /> {cancelMut.isPending ? 'Withdrawing…' : 'Withdraw'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/** The snapshot taken when the request was filed — what the requester saw. */
function Metadata({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata)
    .filter(([k, v]) => !k.startsWith('__') && v !== null && v !== '' && v !== undefined)
    .slice(0, 4);
  if (entries.length === 0) return null;

  return (
    <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-1.5 text-xs">
          <dt className="text-gray-400">{k.replace(/_paisa$/, '').replace(/_/g, ' ')}</dt>
          <dd className="text-gray-700">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
