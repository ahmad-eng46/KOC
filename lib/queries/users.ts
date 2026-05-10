'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listUsersWithBusinesses,
  createUser as createUserAction,
  updateUser as updateUserAction,
  resetUserPassword as resetUserPasswordAction,
  softDeleteUser as softDeleteUserAction,
  restoreUser as restoreUserAction,
  getUserLoginHistory,
  type UserListRow,
  type LoginHistoryRow,
} from '@/lib/actions/user';
import type { UserCreateInput, UserUpdateInput } from '@/lib/validators/user';

export function useUsers(includeDeleted: boolean) {
  return useQuery<UserListRow[]>({
    queryKey: ['users', includeDeleted],
    queryFn: async () => {
      const r = await listUsersWithBusinesses(includeDeleted);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
}

export function useLoginHistory(userId: string | null) {
  return useQuery<LoginHistoryRow[]>({
    queryKey: ['login-history', userId],
    enabled: !!userId,
    queryFn: async () => {
      const r = await getUserLoginHistory(userId!);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
}

function invalidateUsers(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['users'] });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UserCreateInput) => createUserAction(input),
    onSuccess: () => invalidateUsers(qc),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: UserUpdateInput }) => updateUserAction(vars.id, vars.input),
    onSuccess: () => invalidateUsers(qc),
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: (vars: { id: string; newPassword: string }) =>
      resetUserPasswordAction(vars.id, vars.newPassword),
  });
}

export function useSoftDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; reason: string }) => softDeleteUserAction(vars.id, vars.reason),
    onSuccess: () => invalidateUsers(qc),
  });
}

export function useRestoreUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreUserAction(id),
    onSuccess: () => invalidateUsers(qc),
  });
}
