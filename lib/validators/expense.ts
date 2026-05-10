import { z } from 'zod';

export const expenseTypes = ['business', 'home'] as const;
export type ExpenseType = (typeof expenseTypes)[number];

export const expenseCategories = [
  'Rent',
  'Utilities',
  'Salary',
  'Transport',
  'Food',
  'Office Supplies',
  'Maintenance',
  'Other',
] as const;
export type ExpenseCategory = (typeof expenseCategories)[number];

export const expenseCreateSchema = z.object({
  type: z.enum(expenseTypes),
  category: z.string().min(1, 'Category is required').max(100),
  description: z.string().max(500).optional().or(z.literal('')),
  amount_paisa: z
    .number({ error: 'Amount must be a number' })
    .int('Must be whole paisa')
    .positive('Amount must be > 0'),
  expense_date: z.string().min(1, 'Date is required'),
  receipt_url: z.string().max(500).nullable().optional(),
});

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
