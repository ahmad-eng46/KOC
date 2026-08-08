-- ═══════════════════════════════════════════════════════════════
-- Location deletion: make it possible, and free its customers
--
-- locations has the same two problems 0046 fixed for brands, from the same
-- copied policy shape in 0042.
--
-- 1. locations_update blocks the soft delete.
--    0042 creates the policy with USING and no WITH CHECK. Postgres copies
--    the USING expression to WITH CHECK and applies it to the NEW row; the
--    live copy rejects a row whose deleted_at is set. UPDATE locations SET
--    deleted_at = now() fails with "new row violates row-level security
--    policy" while name and sort_order updates succeed — so an admin cannot
--    delete a city at all. Verified column by column against the live
--    database. Recreated with an explicit WITH CHECK; the intent is unchanged
--    from 0042.
--
-- 2. Customers could be left pointing at a deleted location.
--    deleteLocation() used to refuse while any customer was still assigned,
--    which kept the data consistent but made deleting a city a manual chore:
--    reassign every shop first, by hand. It now frees them, matching how
--    brands behave — deleting a city sends its shops back to "No Location".
--    The trigger makes that unconditional, so no customer can reference a
--    location the app cannot see regardless of which code path deletes it.
--    Such a customer would otherwise be invisible: the Location column reads
--    "No Location" because the id resolves to nothing, but the Unassigned
--    list filters on location_id IS NULL, so it appears in neither.
--
-- Down:
--   DROP TRIGGER IF EXISTS trg_locations_soft_delete_unassign ON public.locations;
--   DROP FUNCTION IF EXISTS public.unassign_customers_on_location_delete();
--   DROP POLICY IF EXISTS locations_update ON public.locations;  -- then recreate from 0042
--   -- the backfill is not reversible: those customers had a deleted location.
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. locations_update — explicit WITH CHECK so soft delete is permitted
-- ─────────────────────────────────────────────
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

-- ─────────────────────────────────────────────
-- 2. Soft-deleting a location returns its customers to "No Location"
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unassign_customers_on_location_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- SECURITY DEFINER for the same reason as assign_customer_location() in
  -- 0042: customers UPDATE via RLS is admin/accountant-only, and this touches
  -- only location_id.
  UPDATE public.customers
     SET location_id = NULL
   WHERE location_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_locations_soft_delete_unassign ON public.locations;
CREATE TRIGGER trg_locations_soft_delete_unassign
  AFTER UPDATE OF deleted_at ON public.locations
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.unassign_customers_on_location_delete();

-- ─────────────────────────────────────────────
-- Backfill: any customer already pointing at a deleted (or missing) location
-- goes back to unassigned, which is where the UI has been showing them anyway.
-- ─────────────────────────────────────────────
UPDATE public.customers c
   SET location_id = NULL
 WHERE c.location_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM public.locations l
      WHERE l.id = c.location_id
        AND l.deleted_at IS NULL
   );

COMMENT ON FUNCTION public.unassign_customers_on_location_delete() IS
  'Soft-deleting a location returns its customers to unassigned (location_id
   NULL), so no customer can reference a location the app cannot see. The FK''s
   ON DELETE SET NULL only covers hard deletes, which locations_delete forbids.';
