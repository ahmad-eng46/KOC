import { z } from 'zod';

/** #RGB or #RRGGBB. Mirrors the CHECK constraint 0053 puts on the column. */
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const customerCategorySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(50),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  color: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || HEX_COLOR_RE.test(v), 'Enter a colour like #FF5733'),
  sort_order: z.number().int().min(0).max(9999).default(0),
  is_active: z.boolean().default(true),
});

export type CustomerCategoryInput = z.infer<typeof customerCategorySchema>;

/**
 * Quick-create from the customer form asks for a name and nothing else — the
 * whole point is that it takes seconds. Everything else has a sensible default
 * and can be filled in later under Settings.
 */
export const quickCategorySchema = customerCategorySchema.pick({ name: true });
export type QuickCategoryInput = z.infer<typeof quickCategorySchema>;

/**
 * Editing sends only what changed. Built field by field rather than with
 * .partial(), because .partial() leaves the .default() in place: parsing
 * `{ name: 'x' }` would then also emit sort_order 0 and is_active true, quietly
 * reordering the category and undoing a deactivation the user never touched.
 */
export const customerCategoryUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(50).optional(),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  color: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || HEX_COLOR_RE.test(v), 'Enter a colour like #FF5733'),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
});
export type CustomerCategoryUpdateInput = z.infer<typeof customerCategoryUpdateSchema>;

export function isHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value.trim());
}

/**
 * Fallback palette for categories with no colour of their own, picked from the
 * id so a category keeps the same colour everywhere without storing one.
 */
const FALLBACK_COLORS = [
  '#2563eb', '#16a34a', '#d97706', '#9333ea',
  '#dc2626', '#0d9488', '#4f46e5', '#ea580c',
] as const;

export function categoryColor(id: string, color: string | null | undefined): string {
  if (color && isHexColor(color)) return color.trim();
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}
