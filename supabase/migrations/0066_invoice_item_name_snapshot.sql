-- ═══════════════════════════════════════════════════════════════
-- An invoice line remembers what it sold
--
-- WHY, beyond the bug that prompted it
--   A line's description was only ever obtainable by joining back to products.
--   That makes the description of a past sale depend on the present state of
--   the catalogue, which is wrong in three separate ways:
--
--     * rename a product and every invoice ever issued silently rewrites
--       itself to the new name;
--     * soft-delete one — which the approval flow in 0054/0062 exists to do —
--       and products_select's `deleted_at IS NULL` blanks it out, for admins
--       too;
--     * a role that may not read products (staff, viewer — the cost price
--       lives on that table) gets NULL from the join and no error at all.
--
--   The third is what was reported. All three have the same answer: an invoice
--   line is a historical record and should carry its own description, the way
--   it already carries its own price. unit_price_paisa has been a snapshot
--   since the beginning, and purchase_price_at_sale_paisa says so in its name.
--   The description was the odd one out.
--
-- WHAT IS SNAPSHOT
--   name, sku and unit. All three are shown on the same line and all three
--   blank out together, so snapshotting only the name would leave "3" where
--   "3 Litre" belongs. Rate needs nothing: unit_price_paisa is already the
--   price at the time of sale. pack_size_snapshot (0050) already does this for
--   packs, and is the naming this follows.
--
-- HOW IT IS FILLED
--   A BEFORE INSERT trigger, not an edit to create_invoice_atomic. The RPC is
--   one insert path today; a trigger covers it, anything written by hand, and
--   whatever is added next, without a second copy of the rule. It fills only
--   what the caller left null, so an explicit value always wins.
--
-- BACKFILL
--   invoice_items.product_id is NOT NULL REFERENCES products(id) ON DELETE
--   RESTRICT, so every existing line points at a product row that still
--   exists — soft-deleted, perhaps, but present. Every row is therefore
--   backfillable, and the DO block below reports it rather than assuming it.
--   Run supabase/tests/preview_0066_backfill.sql first to see the numbers
--   without changing anything.
--
--   Nothing here is destructive: three new nullable columns and an UPDATE that
--   only ever writes into them.
--
-- Down:
--   DROP TRIGGER trg_invoice_items_snapshot ON public.invoice_items;
--   DROP FUNCTION public.fill_invoice_item_snapshot();
--   ALTER TABLE public.invoice_items
--     DROP COLUMN product_name_snapshot,
--     DROP COLUMN product_sku_snapshot,
--     DROP COLUMN product_unit_snapshot;
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. The columns
-- ─────────────────────────────────────────────
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS product_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS product_sku_snapshot  TEXT,
  ADD COLUMN IF NOT EXISTS product_unit_snapshot TEXT;

COMMENT ON COLUMN public.invoice_items.product_name_snapshot IS
  'What the product was called when this line was sold. Read this in preference
   to joining products: a rename, a soft delete, or a role that cannot read the
   products table all make that join the wrong answer.';

-- ─────────────────────────────────────────────
-- 2. Fill it on the way in
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fill_invoice_item_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only what the caller left blank. An explicit snapshot is a deliberate
  -- statement about what was sold and is never second-guessed here.
  IF NEW.product_name_snapshot IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.name, p.sku, p.unit
    INTO NEW.product_name_snapshot, NEW.product_sku_snapshot, NEW.product_unit_snapshot
    FROM public.products p
   WHERE p.id = NEW.product_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fill_invoice_item_snapshot() IS
  'Stamps an invoice line with the product name, sku and unit at time of sale.';

DROP TRIGGER IF EXISTS trg_invoice_items_snapshot ON public.invoice_items;
CREATE TRIGGER trg_invoice_items_snapshot
  BEFORE INSERT ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.fill_invoice_item_snapshot();

-- ─────────────────────────────────────────────
-- 3. Backfill, with the numbers stated
-- ─────────────────────────────────────────────
DO $$
DECLARE
  v_before  INT;
  v_filled  INT;
  v_orphan  INT;
BEGIN
  SELECT COUNT(*) INTO v_before
    FROM public.invoice_items WHERE product_name_snapshot IS NULL;

  UPDATE public.invoice_items ii
     SET product_name_snapshot = p.name,
         product_sku_snapshot  = p.sku,
         product_unit_snapshot = p.unit
    FROM public.products p
   WHERE p.id = ii.product_id
     AND ii.product_name_snapshot IS NULL;

  GET DIAGNOSTICS v_filled = ROW_COUNT;

  SELECT COUNT(*) INTO v_orphan
    FROM public.invoice_items WHERE product_name_snapshot IS NULL;

  RAISE NOTICE '0066: % lines needed a name, % filled, % left.',
    v_before, v_filled, v_orphan;

  IF v_orphan > 0 THEN
    -- Should be unreachable: product_id is NOT NULL with ON DELETE RESTRICT,
    -- so the product row cannot have gone away. Said out loud rather than
    -- passed over, because if it ever happens the FK has been bypassed.
    RAISE WARNING
      '% invoice line(s) still have no name — their product_id points at no product row.',
      v_orphan;
  END IF;
END;
$$;
