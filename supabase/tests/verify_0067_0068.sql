-- ═══════════════════════════════════════════════════════════════
-- Verify 0067 (last sold rates) and 0068 (rate override notice)
--
-- ORDER MATTERS. Apply the migrations FIRST, then run this:
--   1. supabase/migrations/0067_last_sold_rates.sql
--   2. supabase/migrations/0068_rate_override_notice.sql
--   3. this file
--
-- PART A is safe to run at any time — it only inspects the catalogue, so it
-- tells you what is applied without ever erroring.
--
-- PART B calls the function, so it can only run once 0067 is applied. Postgres
-- resolves function names when it parses a statement, not when it runs it, so
-- there is no way to make those queries skip themselves. Run Part A first; if
-- it says the function is missing, apply 0067 and come back.
-- ═══════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════
-- PART A — always safe to run
-- ═══════════════════════════════════════════════════════════════

-- 1. Is 0067 applied? Asked of the catalogue, so this cannot error.
SELECT
  CASE
    WHEN to_regprocedure('public.last_sold_rates(uuid[], uuid)') IS NULL
      THEN 'NOT APPLIED  ->  run supabase/migrations/0067_last_sold_rates.sql first'
    ELSE 'PASS  last_sold_rates exists'
  END AS check_0067_applied;

-- 2. It must run as the caller, not as definer, so RLS still scopes it to the
--    caller's business. No rows here means 0067 is not applied yet.
SELECT
  CASE WHEN p.prosecdef
       THEN 'FAIL  is SECURITY DEFINER — it must run as the caller so RLS applies'
       ELSE 'PASS  invoker rights, RLS applies'
  END AS check_0067_security
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'last_sold_rates';

-- 3. Is 0068 applied? The view exists either way (0059 created it), so this is
--    safe whether or not 0068 has run.
SELECT
  CASE WHEN pg_get_viewdef('public.staff_activity_notifications'::regclass)
            ILIKE '%invoice.rate_overridden%'
       THEN 'PASS  invoice.rate_overridden is on the whitelist'
       ELSE 'NOT APPLIED  ->  run supabase/migrations/0068_rate_override_notice.sql'
  END AS check_0068_applied;

-- 4. Admins are still excluded, so an admin override can never appear.
SELECT
  CASE WHEN pg_get_viewdef('public.staff_activity_notifications'::regclass)
            ILIKE '%role <> ''admin''%'
       THEN 'PASS  admin actions are filtered out'
       ELSE 'FAIL  admin exclusion is missing'
  END AS check_admin_excluded;

-- 5. The overrides recorded so far, newest first. Empty until a STAFF user
--    saves an invoice with a changed rate.
SELECT
  al.created_at,
  u.full_name                                                       AS staff,
  al.metadata ->> 'product_name'                                    AS product,
  ROUND((al.metadata ->> 'suggested_rate_paisa')::NUMERIC / 100, 2) AS suggested,
  ROUND((al.metadata ->> 'entered_rate_paisa')::NUMERIC   / 100, 2) AS charged,
  ROUND((al.metadata ->> 'difference_paisa')::NUMERIC     / 100, 2) AS difference,
  (al.metadata ->> 'difference_percent')::NUMERIC                   AS pct,
  (al.metadata ->> 'below_cost')::BOOLEAN                           AS below_cost
FROM public.activity_log al
JOIN public.users u ON u.id = al.user_id
WHERE al.action = 'invoice.rate_overridden'
ORDER BY al.created_at DESC
LIMIT 30;

-- 6. Nothing under the 1% tolerance should ever have been recorded.
SELECT
  CASE WHEN COUNT(*) = 0
       THEN 'PASS  no sub-tolerance noise recorded'
       ELSE 'FAIL  ' || COUNT(*) || ' entries below 1% — tolerance not applied'
  END AS check_tolerance
FROM public.activity_log
WHERE action = 'invoice.rate_overridden'
  AND ABS((metadata ->> 'difference_percent')::NUMERIC) < 1;

-- 7. No admin override was ever logged.
SELECT
  CASE WHEN COUNT(*) = 0
       THEN 'PASS  no admin overrides logged'
       ELSE 'FAIL  ' || COUNT(*) || ' admin overrides logged'
  END AS check_no_admin_overrides
FROM public.activity_log al
JOIN public.users u ON u.id = al.user_id
WHERE al.action = 'invoice.rate_overridden'
  AND u.role = 'admin';

-- 8. Opening stock (16.4 — no migration, but the effect shows here).
--    Keyed on the activity log rather than the movement's note: the seed data
--    from 09 May 2026 already uses the note "Opening stock", so filtering on
--    that alone would mix 30 seeded rows in with anything you create now.
SELECT
  al.created_at,
  u.full_name                        AS created_by,
  al.metadata ->> 'quantity'         AS opening_units,
  p.name                             AS product,
  p.unit,
  p.pack_size
FROM public.activity_log al
JOIN public.products p ON p.id = al.entity_id
LEFT JOIN public.users u ON u.id = al.user_id
WHERE al.action = 'stock.adjusted'
  AND al.metadata ->> 'opening_stock' = 'true'
ORDER BY al.created_at DESC
LIMIT 20;

-- 8b. The movement each of those wrote. Expect exactly ONE per product, of
--     type 'in', with the quantity in BASE units — 2 Cartons of 24 is 48.
SELECT
  p.name       AS product,
  p.pack_size,
  sm.type,
  sm.quantity  AS base_units,
  sm.created_at
FROM public.stock_movements sm
JOIN public.products p ON p.id = sm.product_id
WHERE sm.note = 'Opening stock'
  AND sm.created_at > '2026-05-10'   -- excludes the seeded rows
ORDER BY sm.created_at DESC
LIMIT 20;


-- ═══════════════════════════════════════════════════════════════
-- PART B — only after check 1 above says PASS
--
-- Both NULLs are cast explicitly. Without the cast Postgres sees an `unknown`
-- second argument, cannot tell which overload is meant, and reports the
-- function as not existing at all — which reads like the migration failed even
-- when it applied cleanly.
-- ═══════════════════════════════════════════════════════════════

-- B1. Empty input must give zero rows rather than an error.
SELECT
  CASE WHEN COUNT(*) = 0
       THEN 'PASS  empty input returns no rows'
       ELSE 'FAIL  unexpected rows'
  END AS check_empty_input
FROM public.last_sold_rates(ARRAY[]::UUID[], NULL::UUID);

-- B2. The real answer for every product that has ever sold.
--     Cross-check a row against the invoice it came from — they must agree.
SELECT
  p.name                               AS product,
  ROUND(l.unit_price_paisa / 100.0, 2) AS last_rate_rupees,
  l.sold_on,
  l.for_this_customer
FROM public.products p
JOIN LATERAL public.last_sold_rates(ARRAY[p.id], NULL::UUID) l ON TRUE
WHERE p.deleted_at IS NULL
ORDER BY l.sold_on DESC
LIMIT 20;

-- B3. The same question asked for one customer, which is what the invoice
--     form does. Replace the id with a real customer to compare.
--     for_this_customer = true means the rate came from that customer's own
--     history; false means it fell back to the last sale to anyone.
-- SELECT p.name, ROUND(l.unit_price_paisa / 100.0, 2) AS rate,
--        l.sold_on, l.for_this_customer
-- FROM public.products p
-- JOIN LATERAL public.last_sold_rates(
--        ARRAY[p.id], '00000000-0000-0000-0000-000000000000'::UUID) l ON TRUE
-- WHERE p.deleted_at IS NULL;
