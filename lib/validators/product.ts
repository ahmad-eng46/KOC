import { z } from 'zod';
import { uuidLike } from '@/lib/validators/uuid';

export const productSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  sku: z.string().max(50).optional().or(z.literal('')),
  unit: z.string().min(1, 'Unit is required').max(50),
  sale_price_paisa: z.number().int().min(0, 'Cannot be negative'),
  purchase_price_paisa: z.number().int().min(0).nullable().optional(),
  low_stock_threshold: z.number().int().min(0).nullable().optional(),
  brand_id: uuidLike().nullable().optional(),
  is_active: z.boolean().default(true),
});

export type ProductInput = z.infer<typeof productSchema>;
