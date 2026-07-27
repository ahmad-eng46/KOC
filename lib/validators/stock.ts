import { z } from 'zod';
import { uuidLike } from '@/lib/validators/uuid';

export const stockMovementSchema = z.object({
  product_id: uuidLike('Select a product'),
  type: z.enum(['in', 'adjustment']),
  quantity: z.number({ error: 'Must be a number' }),
  note: z.string().max(500).optional().or(z.literal('')),
});

export type StockMovementInput = z.infer<typeof stockMovementSchema>;
