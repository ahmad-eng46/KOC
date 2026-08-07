'use client';

import { useSupplierBalance } from '@/lib/queries/suppliers';
import { SupplierBalanceCard } from './SupplierBalanceCard';
import { SupplierDetailTabs } from './SupplierDetailTabs';
import type { Supplier } from '@/lib/queries/suppliers';

type Props = {
  supplier: Supplier;
  canEdit: boolean;
  canCreatePurchase: boolean;
  canCreatePayment: boolean;
  canSeeMoney: boolean;
};

/**
 * Client shell for the detail page: the supplier row arrives from the server
 * component, the balance is a live query so it refreshes after every
 * purchase/payment recorded in the tabs below it.
 */
export function SupplierDetailView({
  supplier,
  canEdit,
  canCreatePurchase,
  canCreatePayment,
  canSeeMoney,
}: Props) {
  const { data: balance } = useSupplierBalance(supplier.id);

  return (
    <div className="space-y-4">
      {canSeeMoney && <SupplierBalanceCard balance={balance ?? null} />}
      <SupplierDetailTabs
        supplier={supplier}
        canEdit={canEdit}
        canCreatePurchase={canCreatePurchase}
        canCreatePayment={canCreatePayment}
        canSeeMoney={canSeeMoney}
      />
    </div>
  );
}
