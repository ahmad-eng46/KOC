import { z } from 'zod';
import { uuidLike } from '@/lib/validators/uuid';

export const customerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  phone: z
    .string()
    .regex(/^(\+92|0)?[0-9]{10,11}$/, 'Enter a valid Pakistani phone number')
    .optional()
    .or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
  category_id: uuidLike().nullable().optional(),
  opening_balance_paisa: z
    .number()
    .int('Must be a whole number in paisa')
    .min(0, 'Cannot be negative')
    .default(0),
  credit_limit_paisa: z
    .number()
    .int()
    .min(0)
    .nullable()
    .optional(),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export type CustomerInput = z.infer<typeof customerSchema>;
