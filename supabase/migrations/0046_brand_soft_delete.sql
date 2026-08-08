-- ═══════════════════════════════════════════════════════════════
-- Brand deletion: make it possible, and make it always free the products
--
-- Two problems, both only visible when an admin deletes a brand.
--
-- 1. brands_update blocks the soft delete.
--    0044 creates the policy with USING and no WITH CHECK. Postgres then
--    copies the USING expression to WITH CHECK and applies it to the NEW row.
--    The live policy's expression rejects a row whose deleted_at is set, so
--    UPDATE brands SET deleted_at = now() fails with "new row violates
--    row-level security policy" while every other column update succeeds.
--    Recreated below with an explicit WITH CHECK, so the implicit copy can
--    never diverge from the intent again. The intent is unchanged from 0044:
--    admin/accountant may write brands in a business they belong to, and may
--    not move a brand into a business they do not belong to.
--
-- 2. Products could be left pointing at a deleted brand.
--    Brands are soft-deleted, so the FK's ON DELETE SET NULL in 0044 never
--    fires — it only covers a hard DELETE, which brands_delete forbids. The
--    unassignment lived solely in deleteBrand() (lib/actions/brands.ts). A
--    brand soft-deleted by any other route — SQL editor, a future code path,
--    a restored backup — left products referencing a row the app cannot see.
--    Such a product is invisible rather than mislabelled: BrandBadge renders
--    "No brand" because the id resolves to nothing, but the Unbranded chip
--    filters on brand_id IS NULL, so it appears under no chip at all.
--    The trigger below makes the rule unconditional.
--
-- Down:
--   DROP TRIGGER IF EXISTS trg_brands_soft_delete_unassign ON public.brands;
--   DROP FUNCTION IF EXISTS public.unassign_products_on_brand_delete();
--   DROP POLICY IF EXISTS brands_update ON public.brands;  -- then recreate from 0044
--   -- the backfill is not reversible: those products had a deleted brand.
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. brands_update — explicit WITH CHECK so soft delete is permitted
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

-- ─────────────────────────────────────────────
-- 2. Soft-deleting a brand returns its products to Unbranded
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unassign_products_on_brand_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- SECURITY DEFINER: products UPDATE via RLS is admin-only and guards the
  -- price columns. This touches only brand_id — same reasoning as the
  -- assign_product_brand() functions in 0044.
  UPDATE public.products
     SET brand_id = NULL
   WHERE brand_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_brands_soft_delete_unassign ON public.brands;
CREATE TRIGGER trg_brands_soft_delete_unassign
  AFTER UPDATE OF deleted_at ON public.brands
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.unassign_products_on_brand_delete();

-- ─────────────────────────────────────────────
-- Backfill: any product already pointing at a deleted (or missing) brand
-- goes back to Unbranded, which is where the UI has been showing it anyway.
-- ─────────────────────────────────────────────
UPDATE public.products p
   SET brand_id = NULL
 WHERE p.brand_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM public.brands b
      WHERE b.id = p.brand_id
        AND b.deleted_at IS NULL
   );

COMMENT ON FUNCTION public.unassign_products_on_brand_delete() IS
  'Soft-deleting a brand returns its products to Unbranded (brand_id NULL), so
   no product can reference a brand the app cannot see. The FK''s ON DELETE SET
   NULL only covers hard deletes, which brands_delete forbids.';
