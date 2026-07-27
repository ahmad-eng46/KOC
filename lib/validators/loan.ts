import { z } from 'zod';
import { uuidLike } from '@/lib/validators/uuid';

// Schema column is 'direction' with values 'given' | 'taken'.
// We expose 'taken' as the matching value for the spec's "received".
export const loanDirections = ['given', 'taken'] as const;
export type LoanDirection = (typeof loanDirections)[number];

export const loanCreateSchema = z.object({
  direction: z.enum(loanDirections),
  party_name: z.string().min(1, 'Party name is required').max(200),
  party_customer_id: uuidLike().nullable().optional(),
  principal_paisa: z
    .number({ error: 'Amount must be a number' })
    .int('Must be whole paisa')
    .positive('Amount must be > 0'),
  loan_date: z.string().min(1, 'Date is required'),
  due_date: z.string().optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export type LoanCreateInput = z.infer<typeof loanCreateSchema>;
