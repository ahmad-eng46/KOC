import { z } from 'zod';
import { uuidLike } from '@/lib/validators/uuid';
import { hasPack, isPackWord } from '@/lib/units';

/**
 * Money arrives as integer paisa. These reject the two things a number input
 * can still produce once the string has been parsed: NaN from unparseable
 * text, and a negative from a typed minus sign.
 */
const moneyPaisa = (label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .refine(Number.isFinite, { message: `${label} must be a number` })
    .int(`${label} must be a whole number of paisa`)
    .min(0, `${label} cannot be negative`);

const baseProduct = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  sku: z.string().max(50).optional().or(z.literal('')),
  unit: z.string().min(1, 'Unit is required').max(50),
  /**
   * Optional. The column is NOT NULL DEFAULT 0, so "no sale price" is stored
   * as 0 and read back as "not set" — see SALE_PRICE_UNSET. A product this
   * business sells for nothing does not exist, so the two never collide.
   */
  sale_price_paisa: moneyPaisa('Sale price').default(0),
  /**
   * Required for anyone who can see it — see productSchemaFor. Left nullable
   * in the base shape because staff genuinely cannot supply it: the database
   * hides the column from them (iron rule #3), so demanding it here would
   * make the form unsatisfiable for the role it was meant to serve.
   */
  purchase_price_paisa: moneyPaisa('Purchase price').nullable().optional(),
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
});

/** Stored value meaning "nobody has set a sale price yet". */
export const SALE_PRICE_UNSET = 0;

/** True when the product has no usable sale price to bill from. */
export function salePriceIsUnset(paisa: number | null | undefined): boolean {
  return paisa == null || paisa === SALE_PRICE_UNSET;
}

function withPackRules(schema: typeof baseProduct) {
  return schema
    // A "Box of 1" is not a pack, it is a confusing way to say "no pack".
    .refine((d) => !d.pack_name?.trim() || d.pack_size > 1, {
      message: 'Units per pack must be more than 1 when a pack name is set',
      path: ['pack_size'],
    })
    // The reverse would leave the UI unable to name what it is converting to.
    .refine((d) => d.pack_size === 1 || !!d.pack_name?.trim(), {
      message: 'Name the pack (Box, Packet, Carton…) or leave units per pack at 1',
      path: ['pack_name'],
    })
    // "1 Box = 12 Box" is unreadable and makes the pack price ambiguous, but it
    // saved cleanly until now because both lists offered the same words.
    .refine(
      (d) => !d.pack_name?.trim()
        || d.pack_name.trim().toLowerCase() !== d.unit.trim().toLowerCase(),
      {
        message: 'The pack and the unit cannot both be called the same thing',
        path: ['pack_name'],
      },
    )
    // A pack of cartons means the unit is really the carton's contents.
    .refine((d) => !hasPack(d.pack_size) || !isPackWord(d.unit), {
      message: 'Use what is inside the pack here (Piece, Litre, KG), not another container',
      path: ['unit'],
    });
}

/**
 * The rule depends on who is saving.
 *
 * Purchase price is what the books are built on, so it is required — but only
 * of the roles that can actually see the field. Staff may add a product
 * without it and an admin completes it later; the alternative was either
 * showing staff a cost price the database refuses to return, or taking product
 * creation away from them entirely.
 *
 * The same function runs in the form and in the server action, so the two can
 * never drift (iron rule #7 — the server is the authority, but there is only
 * one rule to be authoritative about).
 */
export function productSchemaFor(canSeeCostPrice: boolean) {
  const schema = withPackRules(baseProduct);
  if (!canSeeCostPrice) return schema;

  return schema.refine((d) => d.purchase_price_paisa != null, {
    message: 'Purchase price is required',
    path: ['purchase_price_paisa'],
  });
}

/** The permissive shape. Prefer productSchemaFor where the role is known. */
export const productSchema = withPackRules(baseProduct);

export type ProductInput = z.infer<typeof baseProduct>;
