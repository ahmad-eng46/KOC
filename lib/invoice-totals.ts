import type { Money } from '@/lib/money';

export type InvoiceTotals = {
  subtotalPaisa: Money;
  discountPaisa: Money;
  /** This invoice alone. */
  invoiceTotalPaisa: Money;
  /** Customer balance before this invoice was posted. */
  previousBalancePaisa: Money;
  /** invoiceTotal + previousBalance */
  totalDuePaisa: Money;
  /** Payments recorded against this invoice only. */
  paidPaisa: Money;
  /** totalDue − paid: what the customer actually still owes. */
  balanceDuePaisa: Money;
  /**
   * When false the customer has no prior position, so the PDF renders the
   * historical simple view (no Previous Balance / Total Due rows).
   */
  showPreviousBalance: boolean;
};

type Input = {
  subtotal_paisa: Money;
  discount_paisa: Money;
  total_paisa: Money;
  paid_paisa: Money;
  previous_balance_paisa: Money | null;
};

/**
 * All arithmetic stays in integer paisa; formatting happens at the edge.
 *
 * A null previous balance means "not available" (RPC returned nothing) and is
 * treated as zero so the PDF degrades to the simple view rather than printing
 * a wrong number.
 */
export function computeInvoiceTotals(inv: Input): InvoiceTotals {
  const previousBalancePaisa = inv.previous_balance_paisa ?? 0;
  const totalDuePaisa = inv.total_paisa + previousBalancePaisa;

  return {
    subtotalPaisa: inv.subtotal_paisa,
    discountPaisa: inv.discount_paisa,
    invoiceTotalPaisa: inv.total_paisa,
    previousBalancePaisa,
    totalDuePaisa,
    paidPaisa: inv.paid_paisa,
    balanceDuePaisa: totalDuePaisa - inv.paid_paisa,
    showPreviousBalance: previousBalancePaisa !== 0,
  };
}
