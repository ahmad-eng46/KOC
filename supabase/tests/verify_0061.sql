-- Verify 0061: staff reach everything except deleting, escalating, and cost.
-- Run in the Supabase SQL editor AFTER applying supabase/migrations/0061_*.sql.
-- This file only checks. It does not apply anything.

-- 1. Staff can now write the business tables.
SELECT
  CASE WHEN COUNT(*) = 0
       THEN 'PASS  staff reach every business table'
       ELSE 'FAIL  still closed to staff: ' || string_agg(DISTINCT tablename, ', ')
  END AS staff_has_access
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('SELECT','INSERT','UPDATE')
  AND tablename IN (
    'customers','customer_categories','invoices','payments','expenses',
    'expense_assets','expense_sub_types','returns','suppliers',
    'supplier_payments','brands','locations','investments','loans')
  AND COALESCE(qual, with_check) LIKE '%accountant%'
  AND COALESCE(qual, with_check) NOT LIKE '%staff%';

-- 2. Staff still cannot DELETE anything, anywhere.
SELECT
  CASE WHEN COUNT(*) = 0
       THEN 'PASS  no DELETE policy admits staff'
       ELSE 'FAIL  staff can hard-delete from: ' || string_agg(tablename, ', ')
  END AS no_staff_delete
FROM pg_policies
WHERE schemaname = 'public' AND cmd = 'DELETE'
  AND COALESCE(qual, 'false') <> 'false'
  AND COALESCE(qual, with_check) LIKE '%staff%';

-- 3. Privilege escalation stays shut. If staff could write these they could
--    make themselves an admin and approve their own deletion requests.
SELECT
  CASE WHEN COUNT(*) = 0
       THEN 'PASS  staff cannot touch users, roles, businesses or app settings'
       ELSE 'FAIL  ESCALATION OPEN on: ' || string_agg(DISTINCT tablename, ', ')
  END AS no_escalation
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('INSERT','UPDATE','DELETE')
  AND tablename IN ('users','user_businesses','user_page_access',
                    'user_permission_overrides','businesses','app_settings')
  AND COALESCE(qual, with_check) LIKE '%staff%';

-- 4. Cost prices stay hidden. products and stock_purchases keep their
--    admin/accountant SELECT; audit_log and backups hold whole rows and whole
--    databases, so they stay shut for the same reason.
SELECT
  CASE WHEN COUNT(*) = 0
       THEN 'PASS  cost prices unreachable by staff (iron rule #3 intact)'
       ELSE 'FAIL  COST LEAK via: ' || string_agg(DISTINCT tablename, ', ')
  END AS cost_hidden
FROM pg_policies
WHERE schemaname = 'public' AND cmd = 'SELECT'
  AND tablename IN ('products','stock_purchases','audit_log','backups')
  AND COALESCE(qual, with_check) LIKE '%staff%';

-- 5. The settings sub-pages are their own keys, or the route guard bounces
--    staff off pages their own guard now admits.
SELECT
  CASE WHEN COUNT(*) = 4
       THEN 'PASS  brands / categories / assets / activity log are separate pages'
       ELSE 'FAIL  found ' || COUNT(*) || ' of 4 — staff will hit /unauthorized'
  END AS settings_split
FROM public.page_definitions
WHERE key IN ('settings.brands','settings.categories','settings.assets','settings.activity')
  AND default_staff;

-- 6. What is left admin-only, for the record.
SELECT 'INFO  still admin-only: ' || string_agg(key, ', ' ORDER BY key) AS admin_only
FROM public.page_definitions WHERE NOT default_staff;
