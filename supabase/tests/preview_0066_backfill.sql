-- What 0066's backfill would do. Read-only — run this before the migration.
--
-- "cannot_backfill" should be 0. invoice_items.product_id is NOT NULL
-- REFERENCES products(id) ON DELETE RESTRICT, so every line points at a
-- product row that still exists — possibly soft-deleted, but present. A
-- non-zero number means the foreign key has been bypassed somehow and is worth
-- understanding before writing anything.

SELECT
  COUNT(*)                                                  AS invoice_lines_total,
  COUNT(*) FILTER (WHERE p.id IS NOT NULL)                  AS can_backfill,
  COUNT(*) FILTER (WHERE p.id IS NULL)                      AS cannot_backfill,
  COUNT(*) FILTER (WHERE p.deleted_at IS NOT NULL)          AS product_since_deleted,
  COUNT(DISTINCT ii.product_id)                             AS distinct_products
FROM public.invoice_items ii
LEFT JOIN public.products p ON p.id = ii.product_id;

-- The lines that would stay nameless, if any.
SELECT ii.id AS invoice_item_id, ii.invoice_id, ii.product_id
FROM public.invoice_items ii
LEFT JOIN public.products p ON p.id = ii.product_id
WHERE p.id IS NULL
LIMIT 50;
