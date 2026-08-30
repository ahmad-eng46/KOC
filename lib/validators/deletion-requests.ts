import { z } from 'zod';
import { uuidLike } from '@/lib/validators/uuid';

/**
 * Every entity the app can soft-delete. Kept in step with
 * public.deletable_entities, which 0062 made the foreign key for
 * deletion_requests.entity_type — a type that passes zod but is not registered
 * would surface as a database error the user cannot act on.
 */
export const deletableEntities = [
  'invoice', 'customer', 'product', 'expense', 'payment', 'return',
  'supplier', 'stock_purchase', 'supplier_payment', 'brand', 'location',
  'customer_category', 'expense_asset', 'expense_sub_type',
] as const;

export type DeletableEntity = (typeof deletableEntities)[number];

export const ENTITY_LABELS: Record<DeletableEntity, string> = {
  invoice: 'Invoice',
  customer: 'Customer',
  product: 'Product',
  expense: 'Expense',
  payment: 'Payment',
  return: 'Return',
  supplier: 'Supplier',
  stock_purchase: 'Stock Purchase',
  supplier_payment: 'Supplier Payment',
  brand: 'Brand',
  location: 'Location',
  customer_category: 'Customer Category',
  expense_asset: 'Expense Item',
  expense_sub_type: 'Expense Type',
};

/** Where "View Item" goes, or null when the entity has no page of its own. */
const ENTITY_ROUTES: Partial<Record<DeletableEntity, (id: string) => string>> = {
  invoice: (id) => `/invoices/${id}`,
  customer: (id) => `/customers/${id}`,
  product: (id) => `/products/${id}`,
  supplier: (id) => `/suppliers/${id}`,
  payment: () => '/payments',
  expense: () => '/expenses',
  brand: () => '/settings/brands',
  location: () => '/locations',
  customer_category: () => '/settings/customer-categories',
};

export function entityHref(type: DeletableEntity, id: string): string | null {
  const route = ENTITY_ROUTES[type];
  return route ? route(id) : null;
}

export const createDeletionRequestSchema = z.object({
  entity_type: z.enum(deletableEntities),
  entity_id: uuidLike('Select an item to delete'),
  /**
   * Optional. 0054 required five characters on the reasoning that a reason is
   * the point of the exercise; in practice that produces "dup" and "asked to".
   * A blank field the admin can see is blank tells them more than a sentence
   * written to satisfy a validator.
   */
  reason: z
    .string()
    .trim()
    .max(500, 'Keep the reason under 500 characters')
    .optional()
    .or(z.literal('')),
});
export type CreateDeletionRequestInput = z.infer<typeof createDeletionRequestSchema>;

export const resolveDeletionRequestSchema = z
  .object({
    request_id: uuidLike(),
    action: z.enum(['approve', 'reject']),
    /** Optional on both actions — an approval can carry a note too. */
    review_note: z.string().trim().max(500).optional(),
    /**
     * Set once the admin has seen the "modified since requested" warning. The
     * server refuses a stale approval without it, so the warning cannot be
     * skipped by a client that does not render it.
     */
    acknowledge_modified: z.boolean().optional(),
  })
;
export type ResolveDeletionRequestInput = z.infer<typeof resolveDeletionRequestSchema>;

export type DeletionRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export const STATUS_LABELS: Record<DeletionRequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const STATUS_STYLES: Record<DeletionRequestStatus, string> = {
  pending: 'bg-orange-50 text-orange-700 border-orange-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
};
