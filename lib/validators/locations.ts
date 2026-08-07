import { z } from 'zod';
import { uuidLike } from '@/lib/validators/uuid';

export const locationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  short_code: z
    .string()
    .max(5, 'At most 5 characters')
    .regex(/^[A-Z0-9]*$/, 'Uppercase letters and digits only')
    .optional()
    .or(z.literal('')),
  sort_order: z
    .number({ error: 'Must be a number' })
    .int('Must be a whole number')
    .min(0)
    .max(9999)
    .optional(),
});

export type LocationInput = z.infer<typeof locationSchema>;

export const assignLocationSchema = z.object({
  customer_id: uuidLike('Select a customer'),
  // null unassigns — "no city route" is a legitimate state
  location_id: uuidLike('Select a location').nullable(),
});

export type AssignLocationInput = z.infer<typeof assignLocationSchema>;

export const bulkAssignLocationSchema = z.object({
  customer_ids: z
    .array(uuidLike())
    .min(1, 'Select at least one customer')
    .max(1000, 'Too many customers at once'),
  location_id: uuidLike('Select a location').nullable(),
});

export type BulkAssignLocationInput = z.infer<typeof bulkAssignLocationSchema>;

export const balanceFilters = ['all', 'has_dues', 'no_dues', 'overpaid'] as const;
export type BalanceFilter = (typeof balanceFilters)[number];

export const locationFilterSchema = z.object({
  location_id: uuidLike().optional(),
  balance_filter: z.enum(balanceFilters).optional(),
  min_balance_paisa: z.number().int().optional(),
  max_balance_paisa: z.number().int().optional(),
});

export type LocationFilterInput = z.infer<typeof locationFilterSchema>;

export const BALANCE_FILTER_LABELS: Record<BalanceFilter, string> = {
  all: 'All',
  has_dues: 'Has Dues',
  no_dues: 'Cleared',
  overpaid: 'Overpaid',
};
