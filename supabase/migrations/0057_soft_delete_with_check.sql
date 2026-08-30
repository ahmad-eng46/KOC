-- ═══════════════════════════════════════════════════════════════
-- Soft delete is rejected by RLS on every remaining table
--
-- Same defect 0046 (brands), 0047 (locations) and 0049 (suppliers) each fixed
-- for one table. It is not brand/location/supplier specific, so this finishes
-- the job for the rest of the schema instead of waiting for each one to be
-- reported separately.
--
-- The mechanism, restated from 0046:
--   A FOR UPDATE policy written with USING and no WITH CHECK makes Postgres
--   copy the USING expression to WITH CHECK and apply it to the NEW row. The
--   live expressions reject a row whose deleted_at is set, so
--       UPDATE <t> SET deleted_at = now()
--   fails with "new row violates row-level security policy" while an update to
--   any other column on the same row succeeds. That asymmetry is the signature:
--   the delete button is wired correctly all the way down and still cannot
--   write.
--
-- Verified before writing this, as an admin, via PostgREST:
--   products, customers, suppliers, locations, brands  -> 403 42501
--   the same rows, updating name or is_active instead  -> 204
--
-- suppliers/locations/brands are re-asserted below because they still fail in
-- production: 0046/0047/0049 are in the repo but are evidently not applied
-- there. CREATE POLICY is not re-runnable, so each one is dropped first and
-- this migration is safe to run whether or not they ever land.
--
-- Scope: exactly the tables whose _select policy carries `deleted_at IS NULL`,
-- because that is what makes the copied WITH CHECK reject the delete.
-- investments and loans are deliberately absent — their _select does not filter
-- deleted_at, so their policies are already correct and are left untouched.
--
-- Every USING expression below is copied verbatim from the policy it replaces
-- (0017, 0043, 0044, 0047, 0049, 0053). No permission is widened or narrowed:
-- the only change is that WITH CHECK is now stated instead of inferred.
--
-- Down:
--   Recreate each policy from its source migration with USING only. That
--   restores the bug, so prefer fixing forward.
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- admin only
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS products_update ON public.products;
CREATE POLICY products_update ON public.products
  FOR UPDATE
  USING (
    public.user_has_business(business_id)
    AND public.user_role() = 'admin'
  )
  WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() = 'admin'
  );

-- ─────────────────────────────────────────────
-- admin + accountant
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS customers_update ON public.customers;
CREATE POLICY customers_update ON public.customers
  FOR UPDATE
  USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  )
  WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

DROP POLICY IF EXISTS customer_categories_update ON public.customer_categories;
CREATE POLICY customer_categories_update ON public.customer_categories
  FOR UPDATE
  USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  )
  WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

DROP POLICY IF EXISTS invoices_update ON public.invoices;
CREATE POLICY invoices_update ON public.invoices
  FOR UPDATE
  USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  )
  WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

DROP POLICY IF EXISTS returns_update ON public.returns;
CREATE POLICY returns_update ON public.returns
  FOR UPDATE
  USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  )
  WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

DROP POLICY IF EXISTS payments_update ON public.payments;
CREATE POLICY payments_update ON public.payments
  FOR UPDATE
  USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  )
  WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

DROP POLICY IF EXISTS expenses_update ON public.expenses;
CREATE POLICY expenses_update ON public.expenses
  FOR UPDATE
  USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  )
  WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

DROP POLICY IF EXISTS expense_assets_update ON public.expense_assets;
CREATE POLICY expense_assets_update ON public.expense_assets
  FOR UPDATE
  USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  )
  WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

-- ─────────────────────────────────────────────
-- Re-asserted from 0046 / 0047 / 0049 — still failing in production
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS brands_update ON public.brands;
CREATE POLICY brands_update ON public.brands
  FOR UPDATE
  USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  )
  WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

DROP POLICY IF EXISTS locations_update ON public.locations;
CREATE POLICY locations_update ON public.locations
  FOR UPDATE
  USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  )
  WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

DROP POLICY IF EXISTS suppliers_update ON public.suppliers;
CREATE POLICY suppliers_update ON public.suppliers
  FOR UPDATE
  USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  )
  WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );
