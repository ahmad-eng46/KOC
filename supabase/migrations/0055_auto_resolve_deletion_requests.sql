-- ═══════════════════════════════════════════════════════════════
-- When the record goes, the request goes with it.
--
-- An admin can delete something a staff member had already asked about. Left
-- alone, that request sits "pending" forever, pointing at a row that no longer
-- exists, and the sidebar badge never clears.
--
-- Done as a trigger rather than a line in each of the eleven delete actions,
-- because the request must resolve however the row was deleted — through the
-- app, through a future action nobody has written yet, or by hand in the SQL
-- editor. Eleven call sites is eleven chances to miss one.
--
-- Two guards worth stating:
--   * Only fires on the transition to deleted. A later UPDATE on an
--     already-deleted row does nothing.
--   * Skips when auth.uid() is NULL — a service-role delete (backup tooling,
--     a migration) has no user to record, and 0054's CHECK demands one for
--     'approved'. Without this guard the constraint would fail and take the
--     delete down with it.
--
-- Down:
--   -- drop each trg_auto_resolve_* trigger, then:
--   DROP FUNCTION IF EXISTS public.auto_resolve_deletion_requests();
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_resolve_deletion_requests()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entity_type TEXT;
BEGIN
  -- Only the moment of deletion.
  IF NEW.deleted_at IS NULL OR OLD.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Nobody to credit the decision to; leave the request pending rather than
  -- violate the resolution CHECK and roll the delete back.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_entity_type := CASE TG_TABLE_NAME
    WHEN 'invoices'            THEN 'invoice'
    WHEN 'customers'           THEN 'customer'
    WHEN 'products'            THEN 'product'
    WHEN 'expenses'            THEN 'expense'
    WHEN 'payments'            THEN 'payment'
    WHEN 'returns'             THEN 'return'
    WHEN 'suppliers'           THEN 'supplier'
    WHEN 'stock_purchases'     THEN 'stock_purchase'
    WHEN 'supplier_payments'   THEN 'supplier_payment'
    WHEN 'brands'              THEN 'brand'
    WHEN 'locations'           THEN 'location'
    WHEN 'customer_categories' THEN 'customer_category'
    WHEN 'expense_assets'      THEN 'expense_asset'
    WHEN 'expense_sub_types'   THEN 'expense_sub_type'
  END;

  IF v_entity_type IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.deletion_requests
     SET status      = 'approved',
         resolved_by = auth.uid(),
         resolved_at = NOW()
   WHERE entity_type = v_entity_type
     AND entity_id   = NEW.id
     AND status      = 'pending';

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_resolve_deletion_requests() IS
  'Marks any pending deletion request approved when its entity is soft-deleted by
   any route. Skips service-role deletes, which have no auth.uid() to record.';

-- ─────────────────────────────────────────────
-- Attach to every table the approval flow can name.
-- ─────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices', 'customers', 'products', 'expenses', 'payments', 'returns',
    'suppliers', 'stock_purchases', 'supplier_payments', 'brands', 'locations',
    'customer_categories', 'expense_assets', 'expense_sub_types'
  ] LOOP
    -- A table that does not exist yet, or has no deleted_at, is skipped rather
    -- than failing the migration.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = t AND column_name = 'deleted_at'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_auto_resolve_%I ON public.%I', t, t);
      EXECUTE format(
        'CREATE TRIGGER trg_auto_resolve_%I AFTER UPDATE OF deleted_at ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.auto_resolve_deletion_requests()', t, t);
    END IF;
  END LOOP;
END $$;
