import { describe, expect, it } from 'vitest';
import {
  demotionWouldRemoveLastAdmin,
  deactivationWouldRemoveLastAdmin,
  deletionWouldRemoveLastAdmin,
} from '@/lib/auth/admin-checks';

describe('demotionWouldRemoveLastAdmin', () => {
  it('blocks demotion of the only admin', () => {
    expect(demotionWouldRemoveLastAdmin(true, 'staff', 1)).toBe(true);
  });
  it('allows demotion when there are other admins', () => {
    expect(demotionWouldRemoveLastAdmin(true, 'staff', 2)).toBe(false);
    expect(demotionWouldRemoveLastAdmin(true, 'accountant', 5)).toBe(false);
  });
  it('does nothing when target is not currently admin', () => {
    expect(demotionWouldRemoveLastAdmin(false, 'viewer', 1)).toBe(false);
    expect(demotionWouldRemoveLastAdmin(false, 'admin', 1)).toBe(false);
  });
  it('allows promotion to admin even when there is only one admin', () => {
    expect(demotionWouldRemoveLastAdmin(true, 'admin', 1)).toBe(false);
  });
  it('treats zero admins (impossible state) as last-admin to be safe', () => {
    expect(demotionWouldRemoveLastAdmin(true, 'staff', 0)).toBe(true);
  });
});

describe('deactivationWouldRemoveLastAdmin', () => {
  it('blocks disabling the only active admin', () => {
    expect(deactivationWouldRemoveLastAdmin(true, true, 1)).toBe(true);
  });
  it('allows disabling when there are other admins', () => {
    expect(deactivationWouldRemoveLastAdmin(true, true, 3)).toBe(false);
  });
  it('does nothing when target is not currently admin', () => {
    expect(deactivationWouldRemoveLastAdmin(false, true, 1)).toBe(false);
  });
  it('does nothing when target is already inactive', () => {
    expect(deactivationWouldRemoveLastAdmin(true, false, 1)).toBe(false);
  });
});

describe('deletionWouldRemoveLastAdmin', () => {
  it('blocks deleting the only active admin', () => {
    expect(deletionWouldRemoveLastAdmin(true, true, 1)).toBe(true);
  });
  it('allows deleting when there are other admins', () => {
    expect(deletionWouldRemoveLastAdmin(true, true, 5)).toBe(false);
  });
  it('does nothing when target is not currently admin', () => {
    expect(deletionWouldRemoveLastAdmin(false, true, 1)).toBe(false);
  });
});
