import { z } from 'zod';
import { uuidLike } from '@/lib/validators/uuid';

export const productSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(200),
    sku: z.string().max(50).optional().or(z.literal('')),
    unit: z.string().min(1, 'Unit is required').max(50),
    sale_price_paisa: z.number().int().min(0, 'Cannot be negative'),
    purchase_price_paisa: z.number().int().min(0).nullable().optional(),
    low_stock_threshold: z.number().int().min(0).nullable().optional(),
    brand_id: uuidLike().nullable().optional(),
    /** Units in one pack. 1 = sold individually, which is the default. */
    pack_size: z
      .number({ error: 'Units per pack must be a number' })
      .int('Units per pack must be a whole number')
      .min(1, 'Units per pack must be at least 1')
      .max(100_000, 'Units per pack is too large')
      .default(1),
    /** "Box", "Packet", "Carton". Null when the product has no pack. */
    pack_name: z.string().trim().max(50).nullable().optional(),
    is_active: z.boolean().default(true),
  })
  // A "Box of 1" is not a pack, it is a confusing way to say "no pack".
  .refine((d) => !d.pack_name?.trim() || d.pack_size > 1, {
    message: 'Units per pack must be more than 1 when a pack name is set',
    path: ['pack_size'],
  })
  // The reverse would leave the UI unable to name what it is converting to.
  .refine((d) => d.pack_size === 1 || !!d.pack_name?.trim(), {
    message: 'Name the pack (Box, Packet, Carton…) or leave units per pack at 1',
    path: ['pack_name'],
  });

export type ProductInput = z.infer<typeof productSchema>;
