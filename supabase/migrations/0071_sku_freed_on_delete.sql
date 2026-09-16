-- ═══════════════════════════════════════════════════════════════
-- Deleting a product releases its SKU
--
-- THE SYMPTOM
--   Creating a product fails with
--       duplicate key value violates unique constraint "idx_products_sku"
--   and no product on screen has that SKU, because the one holding it was
--   deleted and is invisible everywhere in the app.
--
-- THE CAUSE
--   idx_products_sku is UNIQUE (business_id, sku) WHERE sku IS NOT NULL. The
--   predicate says nothing about deleted_at, so a soft-deleted product keeps
--   owning its SKU for ever. After a catalogue clear-out that is dozens of
--   codes that cannot be reused and cannot be seen.
--
-- THE FIX
--   Add AND deleted_at IS NULL to the predicate. Uniqueness then means what
--   the owner assumes it means: no two LIVE products in a business share a SKU.
--
-- WHAT THIS ALLOWS, DELIBERATELY
--   A live product and a deleted one may now share a SKU. Nothing in the app
--   keys on SKU — it is a label, printed on lists and exports and never joined
--   or looked up — so history stays readable and no report changes. Verified
--   before writing this: the only SKU references in the codebase are an Excel
--   column header and the product form field.
--
--   The trade-off lands on a future restore: restoring a product whose SKU has
--   since been taken would now violate the index. restoreProduct handles that
--   by clearing the SKU rather than failing, and says so.
--
-- CONCURRENTLY is deliberately not used: it cannot run inside the transaction
-- the Supabase SQL editor wraps a migration in, and this table is small.
--
-- Down:
--   DROP INDEX IF EXISTS public.idx_products_sku;
--   CREATE UNIQUE INDEX idx_products_sku ON public.products (business_id, sku)
--     WHERE sku IS NOT NULL;
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- Any live duplicates would make the new index impossible to build. There
-- should be none — the old index forbade them — but say so rather than let
-- CREATE fail with a bare duplicate-key message.
DO $$
DECLARE
  v_dupes INT;
BEGIN
  SELECT COUNT(*) INTO v_dupes FROM (
    SELECT business_id, sku
      FROM public.products
     WHERE sku IS NOT NULL AND deleted_at IS NULL
     GROUP BY business_id, sku
    HAVING COUNT(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE EXCEPTION
      '% SKU(s) are already shared by two live products. Resolve those first.',
      v_dupes;
  END IF;

  RAISE NOTICE '0071: no live SKU collisions, safe to re-index.';
END $$;

DROP INDEX IF EXISTS public.idx_products_sku;

CREATE UNIQUE INDEX idx_products_sku
  ON public.products (business_id, sku)
  WHERE sku IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX public.idx_products_sku IS
  'One SKU per live product per business. Deleted products are excluded on
   purpose so deleting a product releases its code for reuse; nothing in the
   app keys on SKU, so a live and a deleted product sharing one is harmless.';
