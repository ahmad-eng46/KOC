'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getPermissionMatrix,
  setPermissionOverride as setOverrideAction,
  removePermissionOverride as removeOverrideAction,
  type PermissionMatrix,
} from '@/lib/actions/permissions';

export function usePermissionMatrix(userId: string | null) {
  return useQuery<PermissionMatrix>({
    queryKey: ['permission-matrix', userId],
    enabled: !!userId,
    queryFn: async () => {
      const r = await getPermissionMatrix(userId!);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, userId: string) {
  qc.invalidateQueries({ queryKey: ['permission-matrix', userId] });
}

export function useSetPermissionOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; permission: string; granted: boolean; notes?: string }) =>
      setOverrideAction(v.userId, v.permission, v.granted, v.notes),
    onSuccess: (_r, v) => invalidate(qc, v.userId),
  });
}

export function useRemovePermissionOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; permission: string }) =>
      removeOverrideAction(v.userId, v.permission),
    onSuccess: (_r, v) => invalidate(qc, v.userId),
  });
}
