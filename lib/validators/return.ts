import { z } from 'zod';
import { uuidLike } from '@/lib/validators/uuid';

export const returnItemSchema = z.object({
  invoice_item_id: uuidLike('Invalid invoice item'),
  quantity: z.number({ error: 'Quantity must be a number' }).positive('Must be > 0'),
});

export const returnCreateSchema = z.object({
  invoice_id: uuidLike('Invalid invoice'),
  reason: z.string().min(1, 'Reason is required').max(1000),
  items: z.array(returnItemSchema).min(1, 'Select at least one item to return'),
});

export type ReturnItemInput = z.infer<typeof returnItemSchema>;
export type ReturnCreateInput = z.infer<typeof returnCreateSchema>;
