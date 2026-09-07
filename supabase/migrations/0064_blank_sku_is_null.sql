-- ═══════════════════════════════════════════════════════════════
-- A blank SKU is absent, not an empty string
--
-- idx_products_sku is UNIQUE (business_id, sku) WHERE sku IS NOT NULL. An
-- empty string is not null, so it goes in the index like any other value:
-- the first product saved without a SKU stores '', and every product saved
-- without one after that fails on a duplicate key.
--
-- The symptom is that adding products works once and then stops, with a
-- constraint name for an error, on a field the form marks optional.
--
-- lib/actions/product.ts now sends NULL for a blank SKU. This clears the rows
-- already stored, so the trap is gone rather than merely stepped around.
--
-- At most one row per business can be affected — a second would have been
-- refused by the very index this is about — so there is nothing to
-- de-duplicate here.
--
-- Down:
--   UPDATE public.products SET sku = '' WHERE sku IS NULL;
--   (pointless: it restores the bug.)
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_fixed INT;
BEGIN
  UPDATE public.products SET sku = NULL WHERE TRIM(COALESCE(sku, '')) = '';
  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  RAISE NOTICE '0064 applied: % product(s) had a blank SKU stored as text.', v_fixed;
END;
$$;

-- Same shape, same trap: suppliers and customers carry optional codes too.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'sku'
  ) THEN
    UPDATE public.suppliers SET sku = NULL WHERE TRIM(COALESCE(sku, '')) = '';
  END IF;
END;
$$;
