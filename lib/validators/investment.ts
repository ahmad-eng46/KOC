import { z } from 'zod';

export const investmentCreateSchema = z.object({
  investor_name: z.string().min(1, 'Source / investor name is required').max(200),
  description: z.string().max(500).optional().or(z.literal('')),
  amount_paisa: z
    .number({ error: 'Amount must be a number' })
    .int('Must be whole paisa')
    .positive('Amount must be > 0'),
  investment_date: z.string().min(1, 'Date is required'),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export type InvestmentCreateInput = z.infer<typeof investmentCreateSchema>;
