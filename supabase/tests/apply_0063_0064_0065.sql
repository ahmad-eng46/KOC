-- ═══════════════════════════════════════════════════════════════
-- 0063 + 0064 + 0065, concatenated for the Supabase SQL editor.
--
-- Paste this WHOLE file and run it once. It is the three migration files
-- joined in order, verbatim — not a rewrite, so there is no second copy to
-- drift from supabase/migrations/.
--
-- What each one fixes:
--   0063  Invoices (and other pages) missing from the staff sidebar
--   0064  a second product with a blank SKU refusing to save
--   0065  invoice line items showing "—" instead of the product name
--
-- Safe to run more than once: all three are re-runnable end to end.
--
-- Click into the editor and make sure NOTHING is selected before you hit Run.
-- The editor runs your selection when there is one, and a fragment of this
-- will fail in confusing places.
--
-- The Results pane shows only the LAST statement, so a successful run ends
-- with the schema-cache reload below and no rows. That is correct.
-- Run supabase/tests/status.sql afterwards to see what landed.
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
-- ##  Tell PostgREST about the new view
-- ###########################################################
--
-- Supabase's API layer serves what is in its schema cache. A view created a
-- moment ago is not in it until the cache reloads, and until then the app gets
--   "Could not find the table 'public.product_identity' in the schema cache"
-- even though the view is right there. Supabase usually reloads on its own
-- within a few seconds; this asks for it immediately.
NOTIFY pgrst, 'reload schema';
