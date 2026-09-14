-- ═══════════════════════════════════════════════════════════════
-- Why invoices read "Unknown item" / "Unknown customer", and whether it is fixed
--
-- Safe to run BEFORE and AFTER the migrations — nothing here writes, and every
-- existence test asks the catalogue, so none of it can error on a database
-- that has not been migrated yet.
--
-- Run it once now to see the damage, apply:
--     0065_product_identity.sql
--     0066_invoice_item_name_snapshot.sql
--     0070_customer_identity.sql
-- then run it again. Checks 4 and 5 should fall to zero.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. Which of the three are applied?
-- ─────────────────────────────────────────────
SELECT
  '0065 product_identity' AS migration,
  CASE WHEN to_regclass('public.product_identity') IS NULL
       THEN 'NOT APPLIED  ->  invoice lines cannot name a deleted product'
       ELSE 'PASS  applied' END AS status
UNION ALL
SELECT
  '0066 item name snapshot',
  CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'invoice_items'
            AND column_name = 'product_name_snapshot')
       THEN 'PASS  applied'
       ELSE 'NOT APPLIED  ->  lines carry no stored name' END
UNION ALL
SELECT
  '0070 customer_identity',
  CASE WHEN to_regclass('public.customer_identity') IS NULL
       THEN 'NOT APPLIED  ->  invoices cannot name a deleted customer'
       ELSE 'PASS  applied' END;

-- ─────────────────────────────────────────────
-- 2. The scale of it: how much history points at something deleted.
-- ─────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.invoice_items ii
     JOIN public.products p ON p.id = ii.product_id
    WHERE p.deleted_at IS NOT NULL)                       AS lines_naming_a_deleted_product,
  (SELECT COUNT(DISTINCT ii.invoice_id) FROM public.invoice_items ii
     JOIN public.products p ON p.id = ii.product_id
    WHERE p.deleted_at IS NOT NULL)                       AS invoices_affected,
  (SELECT COUNT(*) FROM public.invoices i
     JOIN public.customers c ON c.id = i.customer_id
    WHERE i.deleted_at IS NULL AND c.deleted_at IS NOT NULL) AS invoices_naming_a_deleted_customer;

-- ─────────────────────────────────────────────
-- 3. The data is not lost — prove it.
--    Every one of these names still exists on the row the invoice points at;
--    the app simply could not read it. Read straight from the base tables,
--    which the SQL editor can see and the app deliberately cannot.
-- ─────────────────────────────────────────────
SELECT
  i.invoice_number,
  i.issue_date,
  c.name                                  AS customer,
  (c.deleted_at IS NOT NULL)              AS customer_deleted,
  p.name                                  AS item,
  (p.deleted_at IS NOT NULL)              AS product_deleted,
  ii.quantity,
  ROUND(ii.unit_price_paisa / 100.0, 2)   AS rate
FROM public.invoices i
JOIN public.invoice_items ii ON ii.invoice_id = i.id
JOIN public.products  p ON p.id = ii.product_id
JOIN public.customers c ON c.id = i.customer_id
WHERE i.invoice_number = 'INV-00132'      -- change to any invoice you are looking at
ORDER BY ii.created_at;

-- ─────────────────────────────────────────────
-- 4. AFTER 0066: does every line now carry its own product name?
--
--    Run through EXECUTE rather than as a plain SELECT. product_name_snapshot
--    may not exist yet, and a statement naming a missing column fails when
--    Postgres PARSES it — no CASE or EXISTS can guard that, because the guard
--    never gets to run. Dynamic SQL is resolved only when it executes, so this
--    reports "not applied" instead of erroring.
--
--    Look for the NOTICE in the output, not a result grid.
-- ─────────────────────────────────────────────
DO $$
DECLARE
  v_missing BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'invoice_items'
       AND column_name = 'product_name_snapshot')
  THEN
    RAISE NOTICE '0066 NOT APPLIED — no invoice line carries a stored name yet.';
    RETURN;
  END IF;

  EXECUTE 'SELECT COUNT(*) FROM public.invoice_items WHERE product_name_snapshot IS NULL'
     INTO v_missing;

  IF v_missing = 0 THEN
    RAISE NOTICE 'PASS — every invoice line carries its product name.';
  ELSE
    RAISE NOTICE 'CHECK — % lines still have no stored name.', v_missing;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 5. AFTER 0065/0070: do the identity views cover the deleted rows?
--    These are what the app reads. Both must include deleted rows, or
--    history loses its names again.
-- ─────────────────────────────────────────────
SELECT
  CASE
    WHEN to_regclass('public.product_identity') IS NULL
      THEN 'NOT APPLIED  ->  0065 has not run'
    WHEN pg_get_viewdef(to_regclass('public.product_identity')) ILIKE '%deleted_at IS NULL%'
      THEN 'FAIL  product_identity filters out deleted products'
    ELSE 'PASS  product_identity includes deleted products'
  END AS check_product_identity
UNION ALL
SELECT
  CASE
    WHEN to_regclass('public.customer_identity') IS NULL
      THEN 'NOT APPLIED  ->  0070 has not run'
    WHEN pg_get_viewdef(to_regclass('public.customer_identity')) ILIKE '%deleted_at IS NULL%'
      THEN 'FAIL  customer_identity filters out deleted customers'
    ELSE 'PASS  customer_identity includes deleted customers'
  END;

-- ─────────────────────────────────────────────
-- 6. customer_identity must not leak balances.
--    It exists to label a record, not to reopen a deleted customer.
-- ─────────────────────────────────────────────
SELECT
  CASE
    WHEN to_regclass('public.customer_identity') IS NULL
      THEN 'NOT APPLIED  ->  0070 has not run'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'customer_identity'
         AND column_name LIKE '%paisa%')
      THEN 'FAIL  a money column is exposed'
    ELSE 'PASS  identity only, no money columns'
  END AS check_no_money_leak;
