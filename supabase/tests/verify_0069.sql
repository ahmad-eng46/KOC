-- ═══════════════════════════════════════════════════════════════
-- Verify 0069 — correct the rate on a recorded purchase
--
-- Run AFTER applying supabase/migrations/0069_correct_purchase_rate.sql.
--
-- Every query here only READS. The function itself is deliberately not called:
-- calling it would change a real purchase and move a supplier's balance, so
-- exercise it from the app (product page -> Purchase History -> pencil) and
-- come back here to see what it recorded.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. Is 0069 applied? Catalogue only, so this cannot error.
-- ─────────────────────────────────────────────
SELECT
  CASE
    WHEN to_regprocedure(
      'public.correct_stock_purchase_rate(uuid, uuid, bigint, boolean)') IS NULL
      THEN 'NOT APPLIED  ->  run supabase/migrations/0069_correct_purchase_rate.sql'
    ELSE 'PASS  correct_stock_purchase_rate exists'
  END AS check_0069_applied;

-- ─────────────────────────────────────────────
-- 2. It must be SECURITY DEFINER. Accountants may correct a rate but hold no
--    write on products, so the product-cost sync depends on definer rights.
--    No row means 0069 is not applied.
-- ─────────────────────────────────────────────
SELECT
  CASE WHEN p.prosecdef
       THEN 'PASS  SECURITY DEFINER, so the cost sync can run for accountants'
       ELSE 'FAIL  invoker rights — the product cost sync will silently do nothing'
  END AS check_0069_security
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'correct_stock_purchase_rate';

-- ─────────────────────────────────────────────
-- 3. Signed-in users may execute it.
--
--    Guarded on to_regprocedure first. has_function_privilege() given a TEXT
--    signature RAISES 42883 when the function is absent rather than returning
--    NULL, so asking it directly makes this check fail loudly for the one
--    reason it is meant to report calmly: 0069 not applied yet. Passing the
--    oid instead returns NULL for a missing function.
-- ─────────────────────────────────────────────
SELECT
  CASE
    WHEN to_regprocedure(
      'public.correct_stock_purchase_rate(uuid, uuid, bigint, boolean)') IS NULL
      THEN 'NOT APPLIED  ->  run supabase/migrations/0069_correct_purchase_rate.sql'
    WHEN has_function_privilege(
      'authenticated',
      to_regprocedure('public.correct_stock_purchase_rate(uuid, uuid, bigint, boolean)')::oid,
      'EXECUTE')
      THEN 'PASS  authenticated may execute'
    ELSE 'FAIL  authenticated cannot execute'
  END AS check_grant;

-- ─────────────────────────────────────────────
-- 4. The invariant the function protects.
--    stock_purchases_total_matches_inputs CHECKs that
--    total_paisa = ROUND(quantity * unit_price_paisa). Any row breaking it
--    would mean something wrote the columns independently.
-- ─────────────────────────────────────────────
SELECT
  CASE WHEN COUNT(*) = 0
       THEN 'PASS  every purchase total matches quantity x rate'
       ELSE 'FAIL  ' || COUNT(*) || ' purchase rows are internally inconsistent'
  END AS check_totals_consistent
FROM public.stock_purchases
WHERE deleted_at IS NULL
  AND total_paisa <> ROUND(quantity * unit_price_paisa)::BIGINT;

-- ─────────────────────────────────────────────
-- 5. No negative rates or totals got through.
-- ─────────────────────────────────────────────
SELECT
  CASE WHEN COUNT(*) = 0
       THEN 'PASS  no negative purchase rates'
       ELSE 'FAIL  ' || COUNT(*) || ' rows with a negative rate or total'
  END AS check_no_negatives
FROM public.stock_purchases
WHERE unit_price_paisa < 0 OR total_paisa < 0;

-- ─────────────────────────────────────────────
-- 6. Corrections made so far, newest first.
--    Empty until you use the pencil in Purchase History.
-- ─────────────────────────────────────────────
SELECT
  al.created_at,
  u.full_name                                                        AS corrected_by,
  u.role,
  ROUND((al.metadata ->> 'old_unit_price_paisa')::NUMERIC / 100, 2)  AS old_rate,
  ROUND((al.metadata ->> 'new_unit_price_paisa')::NUMERIC / 100, 2)  AS new_rate,
  ROUND((al.metadata ->> 'old_total_paisa')::NUMERIC / 100, 2)       AS old_total,
  ROUND((al.metadata ->> 'new_total_paisa')::NUMERIC / 100, 2)       AS new_total,
  (al.metadata ->> 'product_cost_synced')::BOOLEAN                   AS cost_synced
FROM public.activity_log al
LEFT JOIN public.users u ON u.id = al.user_id
WHERE al.action = 'purchase.rate_corrected'
ORDER BY al.created_at DESC
LIMIT 30;

-- ─────────────────────────────────────────────
-- 7. Cross-check one correction against the row it changed.
--    The purchase's current rate must equal the new_rate that was logged.
-- ─────────────────────────────────────────────
SELECT
  p.name                                     AS product,
  s.name                                     AS supplier,
  sp.purchase_date,
  ROUND(sp.unit_price_paisa / 100.0, 2)      AS rate_now,
  ROUND((al.metadata ->> 'new_unit_price_paisa')::NUMERIC / 100, 2) AS rate_logged,
  CASE WHEN sp.unit_price_paisa
            = (al.metadata ->> 'new_unit_price_paisa')::BIGINT
       THEN 'PASS  row matches the log'
       ELSE 'CHECK  corrected again since, or a mismatch'
  END AS verdict
FROM public.activity_log al
JOIN public.stock_purchases sp ON sp.id = (al.metadata ->> 'purchase_id')::UUID
JOIN public.products  p ON p.id = sp.product_id
JOIN public.suppliers s ON s.id = sp.supplier_id
WHERE al.action = 'purchase.rate_corrected'
ORDER BY al.created_at DESC
LIMIT 10;

-- ─────────────────────────────────────────────
-- 8. The product cost sync. For each product, its newest purchase rate should
--    equal products.purchase_price_paisa — that is what recording and
--    correcting a purchase both maintain. A mismatch is not necessarily wrong
--    (an admin may set the cost by hand on the product form), so this is
--    informational rather than PASS/FAIL.
-- ─────────────────────────────────────────────
SELECT
  p.name                                          AS product,
  ROUND(p.purchase_price_paisa / 100.0, 2)        AS product_cost,
  ROUND(latest.unit_price_paisa / 100.0, 2)       AS newest_purchase_rate,
  latest.purchase_date,
  CASE WHEN p.purchase_price_paisa = latest.unit_price_paisa
       THEN 'in step' ELSE 'differs — set by hand, or sync was declined'
  END AS note
FROM public.products p
JOIN LATERAL (
  SELECT sp.unit_price_paisa, sp.purchase_date
    FROM public.stock_purchases sp
   WHERE sp.product_id = p.id
     AND sp.deleted_at IS NULL
   ORDER BY sp.purchase_date DESC, sp.created_at DESC
   LIMIT 1
) latest ON TRUE
WHERE p.deleted_at IS NULL
ORDER BY latest.purchase_date DESC
LIMIT 20;

-- ─────────────────────────────────────────────
-- 9. Supplier payables as they stand. Derived on read (SUM of purchase totals
--    − SUM of payments), so a corrected rate shows here immediately with
--    nothing to reconcile.
--
--    Computed from the base tables rather than supplier_balance_view: that
--    view returns NULL unless user_role() is admin or accountant, and the SQL
--    editor has no signed-in user, so reading it here would show only NULLs.
-- ─────────────────────────────────────────────
SELECT
  s.name                                              AS supplier,
  ROUND(COALESCE(pur.total, 0) / 100.0, 2)            AS purchased,
  ROUND(COALESCE(pay.total, 0) / 100.0, 2)            AS paid,
  ROUND((COALESCE(pur.total, 0) - COALESCE(pay.total, 0)) / 100.0, 2) AS still_owed
FROM public.suppliers s
LEFT JOIN (
  SELECT supplier_id, SUM(total_paisa)::BIGINT AS total
    FROM public.stock_purchases WHERE deleted_at IS NULL GROUP BY supplier_id
) pur ON pur.supplier_id = s.id
LEFT JOIN (
  SELECT supplier_id, SUM(amount_paisa)::BIGINT AS total
    FROM public.supplier_payments WHERE deleted_at IS NULL GROUP BY supplier_id
) pay ON pay.supplier_id = s.id
WHERE s.deleted_at IS NULL
ORDER BY (COALESCE(pur.total, 0) - COALESCE(pay.total, 0)) DESC
LIMIT 20;
