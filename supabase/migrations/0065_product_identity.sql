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
