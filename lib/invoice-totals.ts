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
  /**
   * Customer held a credit before this invoice (previousBalance < 0):
   * displayed as "Credit from previous" and subtracted from Total Amount
   * Due rather than shown as a negative "Previous Balance".
   */
  hasCreditPrevious: boolean;
  /**
   * They overpaid across the whole account (balanceDue < 0): displayed as
   * a green "Credit Balance" with the absolute amount, never as a negative
   * number a customer could misread as money owed to them by mistake.
   */
  isCreditBalance: boolean;
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
  const balanceDuePaisa = totalDuePaisa - inv.paid_paisa;

  return {
    subtotalPaisa: inv.subtotal_paisa,
    discountPaisa: inv.discount_paisa,
    invoiceTotalPaisa: inv.total_paisa,
    previousBalancePaisa,
    totalDuePaisa,
    paidPaisa: inv.paid_paisa,
    balanceDuePaisa,
    showPreviousBalance: previousBalancePaisa !== 0,
    hasCreditPrevious: previousBalancePaisa < 0,
    isCreditBalance: balanceDuePaisa < 0,
  };
}
