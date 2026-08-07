import { z } from 'zod';
import { uuidLike } from '@/lib/validators/uuid';

export const returnItemSchema = z
  .object({
    invoice_item_id: uuidLike('Invalid invoice item'),
    quantity: z.number({ error: 'Quantity must be a number' }).positive('Must be > 0'),
    /**
     * Refund per unit in paisa. Omitted = the invoiced price (what the
     * customer actually paid, discount included) — the RPC fills it in.
     */
    return_price_paisa: z
      .number({ error: 'Price must be a number' })
      .int('Must be whole paisa')
      .positive('Return price must be greater than 0')
      .optional(),
    is_price_overridden: z.boolean().default(false),
    override_reason: z.string().max(500).optional().or(z.literal('')),
  })
  .refine(
    (data) => !data.is_price_overridden || !!data.override_reason?.trim(),
    { message: 'Reason is required when the return price is overridden', path: ['override_reason'] },
  );

export const returnCreateSchema = z.object({
  invoice_id: uuidLike('Invalid invoice'),
  reason: z.string().min(1, 'Reason is required').max(1000),
  items: z.array(returnItemSchema).min(1, 'Select at least one item to return'),
});

export type ReturnItemInput = z.infer<typeof returnItemSchema>;
export type ReturnCreateInput = z.infer<typeof returnCreateSchema>;
