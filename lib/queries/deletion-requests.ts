'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBusinessStore } from '@/lib/store/business';
import {
  listDeletionRequests, getMyRequests, getPendingRequestCount,
  getPendingEntityIds, previewEntity,
  requestDeletion, resolveDeletionRequest, cancelDeletionRequest,
  type DeletionRequest,
} from '@/lib/actions/deletion-requests';
import type {
  CreateDeletionRequestInput, ResolveDeletionRequestInput,
  DeletableEntity, DeletionRequestStatus,
} from '@/lib/validators/deletion-requests';

export function useDeletionRequests(status: DeletionRequestStatus | 'all' = 'all') {
  const activeId = useBusinessStore((s) => s.activeId);
  return useQuery<DeletionRequest[]>({
    queryKey: ['deletion-requests', activeId, status],
    enabled: !!activeId,
    queryFn: async () => {
      const r = await listDeletionRequests(status);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
}

export function useMyDeletionRequests() {
  const activeId = useBusinessStore((s) => s.activeId);
  return useQuery<DeletionRequest[]>({
    queryKey: ['my-deletion-requests', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const r = await getMyRequests();
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
}

/**
 * The sidebar badge. Refetched on a minute's timer and whenever the window
 * regains focus, so an admin coming back to the tab sees the real number
 * without Realtime wiring for one integer.
 */
export function usePendingRequestCount() {
  const activeId = useBusinessStore((s) => s.activeId);
  return useQuery<number>({
    queryKey: ['pending-request-count', activeId],
    enabled: !!activeId,
    queryFn: () => getPendingRequestCount(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

/** Which rows on a list already have a request in flight. */
export function usePendingEntityIds(entityType: DeletableEntity) {
  const activeId = useBusinessStore((s) => s.activeId);
  return useQuery({
    queryKey: ['pending-entity-ids', activeId, entityType],
    enabled: !!activeId,
    queryFn: () => getPendingEntityIds(entityType),
  });
}

export function useEntityPreview(entityType: DeletableEntity, entityId: string | null) {
  return useQuery({
    queryKey: ['entity-preview', entityType, entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const r = await previewEntity(entityType, entityId!);
      if (!r.ok) throw new Error(r.error);
      return r;
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['deletion-requests'] }),
      qc.invalidateQueries({ queryKey: ['my-deletion-requests'] }),
      qc.invalidateQueries({ queryKey: ['pending-request-count'] }),
      qc.invalidateQueries({ queryKey: ['pending-entity-ids'] }),
    ]);
  };
}

export function useRequestDeletion() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateDeletionRequestInput) => requestDeletion(input),
    onSuccess: () => invalidate(),
  });
}

export function useResolveDeletionRequest() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: ResolveDeletionRequestInput) => resolveDeletionRequest(input),
    onSuccess: async () => {
      await invalidate();
      // An approval deletes a real record, so every list is now wrong.
      await qc.invalidateQueries();
    },
  });
}

export function useCancelDeletionRequest() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => cancelDeletionRequest(id),
    onSuccess: () => invalidate(),
  });
}
