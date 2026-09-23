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
  location_id: uuidLike().nullable().optional(),
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

/**
 * What an edit is allowed to change — everything except the balance.
 *
 * updateCustomer used to validate against customerSchema and hand the whole
 * result to .update(), which meant every customer edit wrote
 * opening_balance_paisa. That was survivable only because 0075 left the column
 * at 0 everywhere and the form happened to round-trip the value: a call that
 * arrived without the field would have zod's .default(0) fill it, and the
 * customer's opening balance would vanish from the balance with no ledger
 * entry and no audit row behind it.
 *
 * Omitting the field here makes the column unreachable from the edit path
 * rather than merely unused by it. A balance changes by posting an entry
 * (0075/0080), and that is now the only way it can change at all.
 */
export const customerUpdateSchema = customerSchema.omit({
  opening_balance_paisa: true,
});

export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
