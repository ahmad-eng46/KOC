-- ═══════════════════════════════════════════════════════════════
-- suppliers_update blocks the soft delete
--
-- The third table with the shape 0046 and 0047 fixed for brands and
-- locations. 0040 creates suppliers_update with USING and no WITH CHECK, so
-- Postgres copies the USING expression to WITH CHECK and applies it to the
-- NEW row; the live copy rejects a row whose deleted_at is set.
--
-- UPDATE suppliers SET deleted_at = now() therefore fails with "new row
-- violates row-level security policy" while name and notes updates succeed —
-- an admin cannot delete a supplier at all. Verified column by column against
-- the live database.
--
-- Recreated with an explicit WITH CHECK so the implicit copy cannot diverge
-- from the intent again. The intent is unchanged from 0040: admin/accountant
-- may write suppliers in a business they belong to, and may not move one into
-- a business they do not belong to.
--
-- No unassignment trigger here, unlike 0046/0047. stock_purchases.supplier_id
-- is NOT NULL ON DELETE RESTRICT, and deleteSupplier() already refuses while
-- the account is not square — purchase history must stay resolvable, so a
-- supplier's rows are never orphaned the way a brand's or a location's are.
--
-- Down:
--   DROP POLICY IF EXISTS suppliers_update ON public.suppliers;  -- then recreate from 0040
--
-- Re-runnable.
-- ═══════════════════════════════════════════════════════════════

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
