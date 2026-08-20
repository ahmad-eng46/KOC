import { can, type Permission, type Role } from '@/lib/auth/permissions';

/** true = force allow, false = force deny, null/absent = use the role default. */
export type OverrideValue = boolean | null;

export type PermissionRow = {
  permission: Permission;
  roleDefault: boolean;
  override: OverrideValue;
  effective: boolean;
};

/**
 * The whole override rule, in one place: an override wins if it exists,
 * otherwise the role decides. Pure so it can be unit-tested and shared by the
 * server check and the admin UI — the two must never disagree about what a
 * given user can do.
 */
export function resolveEffective(roleDefault: boolean, override: OverrideValue): boolean {
  return override === null || override === undefined ? roleDefault : override;
}

export function buildPermissionRow(
  role: Role,
  permission: Permission,
  override: OverrideValue,
): PermissionRow {
  const roleDefault = can(role, permission);
  return { permission, roleDefault, override, effective: resolveEffective(roleDefault, override) };
}

export function buildPermissionRows(
  role: Role,
  permissions: readonly Permission[],
  overrides: ReadonlyMap<string, boolean>,
): PermissionRow[] {
  return permissions.map((p) =>
    buildPermissionRow(role, p, overrides.has(p) ? overrides.get(p)! : null),
  );
}

export function effectivePermissionSet(
  role: Role,
  permissions: readonly Permission[],
  overrides: ReadonlyMap<string, boolean>,
): Permission[] {
  return buildPermissionRows(role, permissions, overrides)
    .filter((r) => r.effective)
    .map((r) => r.permission);
}
