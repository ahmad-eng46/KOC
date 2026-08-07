import { z } from 'zod';
import { uuidLike } from '@/lib/validators/uuid';

export const brandTypes = ['multinational', 'local_dealer'] as const;
export type BrandType = (typeof brandTypes)[number];

export const BRAND_TYPE_LABELS: Record<BrandType, string> = {
  multinational: 'Company / Brand',
  local_dealer: 'Local Dealer',
};

// Same shape customerSchema accepts: 03XX…, 3XX… (10–11 digits) or +92….
const PK_PHONE_RE = /^(\+92|0)?[0-9]{10,11}$/;

export const brandSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  brand_type: z.enum(brandTypes).default('multinational'),
  contact_person: z.string().trim().max(100).optional().or(z.literal('')),
  phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine(
      (v) => !v || PK_PHONE_RE.test(v.replace(/[\s-]/g, '')),
      'Enter a valid Pakistani phone number',
    ),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  sort_order: z.number().int().min(0).max(9999).default(0),
});

export type BrandInput = z.infer<typeof brandSchema>;

export const assignBrandSchema = z.object({
  product_id: uuidLike('Select a product'),
  brand_id: uuidLike('Select a brand').nullable(), // null = unassign
});

export type AssignBrandInput = z.infer<typeof assignBrandSchema>;

export const bulkAssignBrandSchema = z.object({
  product_ids: z.array(uuidLike()).min(1, 'Select at least one product').max(200),
  brand_id: uuidLike('Select a brand'),
});

export type BulkAssignBrandInput = z.infer<typeof bulkAssignBrandSchema>;
