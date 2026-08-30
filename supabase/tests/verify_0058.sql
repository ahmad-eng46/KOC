-- Verify 0058: staff can add and edit products; cost price and deletion cannot.
-- Run in the Supabase SQL editor AFTER applying supabase/migrations/0058_*.sql.
-- This file only checks. It does not apply anything — if it says FAIL, the
-- migration has not been run yet. Expect PASS on all five.

-- 1. INSERT now admits staff.
SELECT
  CASE WHEN with_check ILIKE '%staff%'
       THEN 'PASS  products_insert admits staff'
       ELSE 'FAIL  products_insert still admin-only: ' || COALESCE(with_check, '(null)')
  END AS insert_admits_staff
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'products_insert';

-- 2. SELECT on the base table did NOT widen — iron rule #3. Staff must still be
--    unable to read purchase_price_paisa directly.
SELECT
  CASE WHEN qual NOT ILIKE '%staff%'
       THEN 'PASS  products_select still excludes staff (cost price stays hidden)'
       ELSE 'FAIL  staff can now read the base products table'
  END AS select_unchanged
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'products_select';

-- 3. UPDATE did NOT widen — this is what keeps soft-delete admin-only.
SELECT
  CASE WHEN qual NOT ILIKE '%staff%' AND with_check IS NOT NULL
       THEN 'PASS  products_update still admin-only, WITH CHECK intact'
       ELSE 'FAIL  products_update: ' || COALESCE(qual, '(null)')
  END AS update_unchanged
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'products_update';

-- 4. Both write guards exist.
SELECT
  CASE WHEN COUNT(*) = 2
       THEN 'PASS  update_product_as_role + cost-price trigger present'
       ELSE 'FAIL  found ' || COUNT(*) || ' of 2'
  END AS guards_present
FROM (
  SELECT 1 FROM pg_proc  WHERE proname = 'update_product_as_role'
  UNION ALL
  SELECT 1 FROM pg_trigger WHERE tgname = 'trg_products_cost_price_role'
) g;

-- 5. The Add Product button is on for staff.
SELECT
  CASE WHEN default_staff
       THEN 'PASS  action.add_product default_staff = true'
       ELSE 'FAIL  Add Product button still hidden from staff'
  END AS add_button_visible
FROM public.page_definitions WHERE key = 'action.add_product';
