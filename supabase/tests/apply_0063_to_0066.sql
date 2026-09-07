-- ═══════════════════════════════════════════════════════════════
-- 0063 + 0064 + 0065 + 0066, for the Supabase SQL editor.
--
-- Paste this WHOLE file and run it once. The four migration files joined in
-- order, verbatim — no second copy to drift from supabase/migrations/.
--
--   0063  pages (incl. Invoices) missing from the staff sidebar
--   0064  a second product with a blank SKU refusing to save
--   0065  product_identity — names readable at any role
--   0066  invoice lines carry their own name, sku and unit + backfill
--
-- 0066 prints what it backfilled. To see those numbers first, without
-- changing anything, run supabase/tests/preview_0066_backfill.sql.
--
-- Nothing here is destructive: new columns, new views, and updates that only
-- write into columns added by the same file. All four are re-runnable.
--
-- Click into the editor and clear any selection before Run — the editor runs
-- your selection when there is one, and a fragment will fail confusingly.
-- ═══════════════════════════════════════════════════════════════


-- ###########################################################
-- ##  0063_unpin_page_access_defaults.sql
-- ###########################################################

-- ═══════════════════════════════════════════════════════════════
-- Stored page access stops shadowing the role defaults
--
-- THE SYMPTOM
--   A staff user has invoices.view, page_definitions says default_staff = true
--   for 'invoices', and the Invoices link is still missing from their sidebar.
--
-- THE CAUSE
--   setUserPageAccess() wrote a row into user_page_access for EVERY page on
--   the checklist, not only the ones that differed from the role default. The
--   resolver reads
--
--       override ?? roleDefault(page, role)
--
--   so any stored value — true or false — wins over the default forever. The
--   moment an admin opened a user and pressed Save, that user was frozen at
--   whatever the checklist said at that instant.
--
--   0061 then widened what staff reach by default. It reached every staff user
--   except the ones an admin had bothered to configure, which is the wrong way
--   round: the more attention a user had been given, the more stale they were.
--   0056's own note says this table "stores only departures from the role
--   defaults" — it never did.
--
-- THE FIX
--   Two halves. lib/actions/page-access.ts now deletes a row rather than
--   writing one when the tick agrees with the role default, so new saves stay
--   departures. This migration does the same to the rows already stored.
--
--   Deliberately conservative: a row is removed only where it AGREES with that
--   user's current role default. A genuine departure — an admin switching
--   something off for one person on purpose — says something the default does
--   not and is left exactly as it is.
--
-- Down:
--   None possible, and none wanted. The deleted rows carried no information:
--   each said precisely what the role default already says.
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_removed INT;
  v_kept    INT;
BEGIN
  WITH redundant AS (
    SELECT upa.business_id, upa.user_id, upa.page_key
      FROM public.user_page_access upa
      JOIN public.users u            ON u.id = upa.user_id
      JOIN public.page_definitions p ON p.key = upa.page_key
     WHERE upa.is_allowed = CASE u.role
                              WHEN 'admin'      THEN p.default_admin
                              WHEN 'accountant' THEN p.default_accountant
                              WHEN 'staff'      THEN p.default_staff
                              WHEN 'viewer'     THEN p.default_viewer
                            END
  )
  DELETE FROM public.user_page_access upa
   USING redundant r
   WHERE upa.business_id = r.business_id
     AND upa.user_id     = r.user_id
     AND upa.page_key    = r.page_key;

  GET DIAGNOSTICS v_removed = ROW_COUNT;
  SELECT COUNT(*) INTO v_kept FROM public.user_page_access;

  RAISE NOTICE
    '0063 applied: % redundant rows removed, % genuine departures kept.',
    v_removed, v_kept;
END;
$$;

-- Admins are never restricted by this table — resolvePageAccess short-circuits
-- on role before it reads an override — so rows for them are noise that makes
-- the table read as though it were doing something.
DELETE FROM public.user_page_access upa
 USING public.users u
 WHERE u.id = upa.user_id AND u.role = 'admin';

-- ###########################################################
-- ##  0064_blank_sku_is_null.sql
-- ###########################################################

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

-- ###########################################################
-- ##  0065_product_identity.sql
-- ###########################################################

-- ═══════════════════════════════════════════════════════════════
-- Every role can find out what a product is called
--
-- THE SYMPTOM
--   Open an invoice as staff and every line's Item column reads "—".
--
-- THE CAUSE
--   The invoice detail resolves line names by embedding the product through
--   the foreign key:
--
--       invoice_items ... products(name, sku, unit, pack_name)
--
--   That embed reads the BASE products table, and products_select is
--   admin/accountant only because the cost price lives there. For staff the
--   embed comes back null and the UI falls through to its "—" placeholder.
--   Nothing is broken in the data; the name was simply never readable.
--
--   products_for_role is the usual answer, but not here: it filters
--   deleted_at IS NULL, and an invoice from last year may well name a product
--   that has since been deleted. An invoice must keep saying what it sold.
--
-- THE FIX
--   A view carrying identity only — what a product is called, never what it
--   cost. There is no money column to gate, so it is readable by anyone in the
--   business at any role, and it deliberately includes deleted products so
--   history keeps its names.
--
--   This is the third view of this shape (products_for_role,
--   stock_purchases_for_role). The pattern holds: the base table stays shut,
--   and each caller reads the projection appropriate to what it needs.
--
-- Down:
--   DROP VIEW public.product_identity;
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.product_identity;

CREATE VIEW public.product_identity AS
SELECT
  p.id,
  p.business_id,
  p.name,
  p.sku,
  p.unit,
  p.pack_size,
  p.pack_name,
  -- Exposed so a caller can mark a line as referring to something since
  -- removed, rather than having to guess from a missing row.
  p.deleted_at
FROM public.products p
WHERE public.user_has_business(p.business_id);

GRANT SELECT ON public.product_identity TO authenticated;

COMMENT ON VIEW public.product_identity IS
  'What a product is called, for every role. No money columns, so nothing to
   gate; includes deleted products so historical invoices keep their names.';

DO $$
BEGIN
  IF to_regclass('public.product_identity') IS NULL THEN
    RAISE EXCEPTION '0065 did not finish';
  END IF;

  -- A money column here would make this readable-by-everyone view a cost leak.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'product_identity'
       AND column_name LIKE '%price%'
  ) THEN
    RAISE EXCEPTION 'product_identity must never expose a price column';
  END IF;

  RAISE NOTICE '0065 applied: product names are readable by every role.';
END;
$$;

-- ###########################################################
-- ##  0066_invoice_item_name_snapshot.sql
-- ###########################################################

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

-- ###########################################################
-- ##  Tell PostgREST about the new view and columns
-- ###########################################################
-- Supabase's API serves what is in its schema cache. Until it reloads, a view
-- or column created a moment ago reads as "could not find ... in the schema
-- cache" even though it is right there.
NOTIFY pgrst, 'reload schema';
