import { z } from 'zod';

export const paymentMethods = ['cash', 'bank_transfer', 'cheque', 'online'] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const paymentCreateSchema = z.object({
  customer_id: z.string().uuid('Select a customer'),
  amount_paisa: z
    .number({ error: 'Amount must be a number' })
    .int('Must be a whole number in paisa')
    .positive('Amount must be greater than 0'),
  payment_date: z.string().min(1, 'Date is required'),
  method: z.enum(paymentMethods),
  reference: z.string().max(200).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
  invoice_id: z.string().uuid().nullable().optional(),
});

export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;
