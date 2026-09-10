-- ═══════════════════════════════════════════════════════════════
-- Verify: purchase price required, sale price optional
--
-- There is NO migration for this change — it is enforced in
-- lib/validators/product.ts and lib/actions/product.ts. This file proves the
-- schema already supports it and that the data behaves, so run it AFTER
-- clicking through the app, not before.
--
-- Paste the whole file into the Supabase SQL editor and read each result.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. Why no migration was needed.
--    Both money columns are already NOT NULL with a DEFAULT of 0.
--    Expect: two rows, both is_nullable = NO, both default 0.
-- ─────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default,
  CASE WHEN is_nullable = 'NO'
       THEN 'PASS  already NOT NULL — no migration required'
       ELSE 'FAIL  unexpectedly nullable'
  END AS verdict
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'products'
  AND column_name IN ('sale_price_paisa', 'purchase_price_paisa')
ORDER BY column_name;

-- ─────────────────────────────────────────────
-- 2. No NULL prices can exist. Expect PASS.
-- ─────────────────────────────────────────────
SELECT
  CASE WHEN COUNT(*) = 0
       THEN 'PASS  no NULL prices anywhere'
       ELSE 'FAIL  ' || COUNT(*) || ' rows with a NULL price'
  END AS null_prices
FROM public.products
WHERE sale_price_paisa IS NULL
   OR purchase_price_paisa IS NULL;

-- ─────────────────────────────────────────────
-- 3. No negative prices got through.
--    This is what "-5" used to become before parseMoneyInput: Rs. 5.
--    A negative here would mean something bypassed validation entirely.
-- ─────────────────────────────────────────────
SELECT
  CASE WHEN COUNT(*) = 0
       THEN 'PASS  no negative prices'
       ELSE 'FAIL  ' || COUNT(*) || ' rows with a negative price'
  END AS negative_prices
FROM public.products
WHERE sale_price_paisa < 0
   OR purchase_price_paisa < 0;

-- ─────────────────────────────────────────────
-- 4. Products saved with NO sale price.
--    sale_price_paisa = 0 is how "not set" is stored. The app shows these
--    as a dash, never as Rs. 0.00. After your admin test #1, the product
--    you saved without a sale price should appear here.
-- ─────────────────────────────────────────────
SELECT
  name,
  unit,
  sale_price_paisa                              AS sale_paisa,
  ROUND(purchase_price_paisa / 100.0, 2)        AS cost_rupees,
  'sale price not set'                          AS note
FROM public.products
WHERE deleted_at IS NULL
  AND sale_price_paisa = 0
ORDER BY created_at DESC;

-- ─────────────────────────────────────────────
-- 5. Products still missing a cost price.
--    Under option B a staff member may save without one; an admin is meant
--    to come back and fill it in. This is that worklist.
-- ─────────────────────────────────────────────
SELECT
  p.name,
  p.unit,
  ROUND(p.sale_price_paisa / 100.0, 2) AS sale_rupees,
  p.created_at,
  'needs a cost price' AS action_required
FROM public.products p
WHERE p.deleted_at IS NULL
  AND p.purchase_price_paisa = 0
ORDER BY p.created_at DESC;

-- ─────────────────────────────────────────────
-- 6. The admin notification trail.
--    Every product.created entry now carries purchase_price_missing.
--    A staff-created product should read true; an admin-created one false.
-- ─────────────────────────────────────────────
SELECT
  al.created_at,
  u.full_name                                  AS created_by,
  u.role                                       AS role,
  al.metadata ->> 'name'                       AS product,
  al.metadata ->> 'purchase_price_missing'     AS cost_missing
FROM public.activity_log al
JOIN public.users u ON u.id = al.user_id
WHERE al.action = 'product.created'
ORDER BY al.created_at DESC
LIMIT 20;

-- ─────────────────────────────────────────────
-- 7. Context: how much of the catalogue is live.
--    47 oil-company products were soft-deleted on 8 Sep 2026. Confirm that
--    was intended — deleted_at is recoverable, but only while you remember.
-- ─────────────────────────────────────────────
SELECT
  b.name                                              AS business,
  COUNT(*) FILTER (WHERE p.deleted_at IS NULL)        AS live,
  COUNT(*) FILTER (WHERE p.deleted_at IS NOT NULL)    AS deleted
FROM public.products p
JOIN public.businesses b ON b.id = p.business_id
GROUP BY b.name
ORDER BY b.name;



