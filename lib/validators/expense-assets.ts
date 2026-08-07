import { z } from 'zod';
import { expenseCategories, type ExpenseCategory } from '@/lib/validators/expense';

/**
 * Transport and Maintenance share assets and sub-types: a car's petrol
 * (Transport) and its oil change (Maintenance) belong to the same vehicle.
 * Mirrors public.expense_category_group() in migration 0043 — keep in sync.
 */
export function expenseCategoryGroup(category: string): string[] {
  return category === 'Transport' || category === 'Maintenance'
    ? ['Transport', 'Maintenance']
    : [category];
}

/** Asset sub-classification chips offered per category. Free-text elsewhere. */
export const ASSET_TYPES_BY_CATEGORY: Partial<Record<ExpenseCategory, string[]>> = {
  Transport: ['car', 'bike', 'truck', 'rickshaw'],
  Maintenance: ['car', 'bike', 'truck', 'rickshaw'],
  Rent: ['shop', 'warehouse', 'office'],
};

export const fuelTypes = ['petrol', 'diesel', 'cng'] as const;

/**
 * details is schemaless on purpose (JSONB), but what the app writes is still
 * validated: known keys typed, unknown keys allowed through.
 */
const detailsSchema = z
  .object({
    plate: z.string().max(20).optional(),
    make: z.string().max(50).optional(),
    model: z.string().max(50).optional(),
    year: z.number().int().min(1950).max(2100).optional(),
    fuel_type: z.enum(fuelTypes).optional(),
    address: z.string().max(300).optional(),
    landlord: z.string().max(100).optional(),
  })
  .loose();

export const expenseAssetSchema = z.object({
  category: z.enum(expenseCategories),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  asset_type: z.string().max(30).optional().or(z.literal('')),
  details: detailsSchema.optional(),
});

export type ExpenseAssetInput = z.infer<typeof expenseAssetSchema>;

export const expenseSubTypeSchema = z.object({
  category: z.enum(expenseCategories),
  name: z.string().min(1, 'Name is required').max(100),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

export type ExpenseSubTypeInput = z.infer<typeof expenseSubTypeSchema>;
