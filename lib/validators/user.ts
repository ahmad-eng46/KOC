import { z } from 'zod';

export const userRoles = ['admin', 'accountant', 'staff', 'viewer'] as const;
export type UserRole = (typeof userRoles)[number];

const phoneRegex = /^(\+92|0)?[0-9]{10,11}$/;

export const userCreateSchema = z.object({
  email: z.email('Invalid email').max(255),
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(200),
  phone: z.string().regex(phoneRegex, 'Enter a valid Pakistani phone').optional().or(z.literal('')),
  role: z.enum(userRoles),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  businessIds: z.array(z.string().uuid()).default([]),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  fullName: z.string().min(2).max(200).optional(),
  phone: z.string().regex(phoneRegex, 'Enter a valid Pakistani phone').optional().or(z.literal('')),
  role: z.enum(userRoles).optional(),
  isActive: z.boolean().optional(),
  businessIds: z.array(z.string().uuid()).optional(),
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const passwordResetSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

export const ownPasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128),
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'New password must differ from current',
    path: ['newPassword'],
  });
export type OwnPasswordChangeInput = z.infer<typeof ownPasswordChangeSchema>;

export const ownProfileSchema = z.object({
  fullName: z.string().min(2).max(200).optional(),
  phone: z.string().regex(phoneRegex, 'Enter a valid Pakistani phone').optional().or(z.literal('')),
});
export type OwnProfileInput = z.infer<typeof ownProfileSchema>;

export const softDeleteSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(500),
});
export type SoftDeleteInput = z.infer<typeof softDeleteSchema>;
