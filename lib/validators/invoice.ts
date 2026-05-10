import { z } from 'zod';

export const invoiceItemSchema = z.object({
  product_id: z.string().uuid('Invalid product'),
  quantity: z
    .number({ error: 'Quantity must be a number' })
    .positive('Quantity must be greater than 0'),
  unit_price_paisa: z
    .number({ error: 'Rate must be a number' })
    .int('Rate must be in whole paisa')
    .min(0, 'Rate cannot be negative'),
  discount_paisa: z.number().int().min(0).default(0),
});

export const invoiceCreateSchema = z.object({
  customer_id: z.string().uuid('Select a customer'),
  issue_date: z.string().optional().or(z.literal('')),
  due_date: z.string().optional().or(z.literal('')),
  items: z.array(invoiceItemSchema).min(1, 'Add at least one item'),
  discount_type: z.enum(['none', 'fixed', 'percent']).default('none'),
  // For 'fixed' this is paisa (integer expected via setValueAs).
  // For 'percent' this is a percentage (0-100, decimals allowed).
  discount_value: z.number().min(0).default(0),
  payment_received_paisa: z.number().int().min(0).default(0),
  payment_method: z.enum(['cash', 'bank_transfer', 'cheque', 'online']).default('cash'),
  payment_reference: z.string().max(100).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;
export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;

export type DiscountType = 'none' | 'fixed' | 'percent';
