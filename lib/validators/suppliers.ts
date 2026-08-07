import { z } from 'zod';
import { uuidLike } from '@/lib/validators/uuid';
import { paymentMethods } from '@/lib/validators/payment';

/**
 * stock_purchases.quantity is NUMERIC(12,3) — this business buys in litres.
 * Anything finer than 3dp would be silently rounded by Postgres, so reject it
 * here instead of letting the stored value disagree with what was typed.
 */
const QUANTITY_SCALE = 3;

const SCALE_FACTOR = 10 ** QUANTITY_SCALE;

const quantity = z
  .number({ error: 'Quantity must be a number' })
  .positive('Quantity must be greater than 0')
  .max(999_999_999, 'Quantity is too large')
  .refine(
    (n) => Math.abs(n * SCALE_FACTOR - Math.round(n * SCALE_FACTOR)) < 1e-6,
    `At most ${QUANTITY_SCALE} decimal places`,
  );

export const supplierSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  phone: z
    .string()
    .regex(/^(\+92|0)?[0-9]{10,11}$/, 'Enter a valid Pakistani phone number')
    .optional()
    .or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export type SupplierInput = z.infer<typeof supplierSchema>;

export const stockPurchaseSchema = z.object({
  supplier_id: uuidLike('Select a supplier'),
  product_id: uuidLike('Select a product'),
  quantity,
  unit_price_paisa: z
    .number({ error: 'Unit price must be a number' })
    .int('Must be a whole number in paisa')
    .positive('Unit price must be greater than 0'),
  purchase_date: z.string().min(1, 'Purchase date is required'),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export type StockPurchaseInput = z.infer<typeof stockPurchaseSchema>;

export const supplierPaymentSchema = z.object({
  supplier_id: uuidLike('Select a supplier'),
  amount_paisa: z
    .number({ error: 'Amount must be a number' })
    .int('Must be a whole number in paisa')
    .positive('Amount must be greater than 0'),
  payment_date: z.string().min(1, 'Payment date is required'),
  payment_method: z.enum(paymentMethods),
  reference: z.string().max(200).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;

export { paymentMethods };
export type SupplierPaymentMethod = (typeof paymentMethods)[number];

export const PAYMENT_METHOD_LABELS: Record<SupplierPaymentMethod, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  online: 'Online',
};
