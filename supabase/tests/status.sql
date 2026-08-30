-- Which migrations have actually landed on this database.
--
-- Run this FIRST when something behaves as though a migration was applied and
-- it was not. One row per change, so a partial apply is obvious at a glance.
--
-- IMPORTANT: this file only REPORTS. It changes nothing. To apply a migration,
-- run the file in supabase/migrations/ of the same number — not the verify_*
-- or status file in this directory.

SELECT * FROM (
  VALUES
    (
      '0056  page_definitions seeded',
      EXISTS (SELECT 1 FROM public.page_definitions WHERE key = 'action.add_product')
    ),
    (
      '0057  products_update states WITH CHECK',
      EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'products'
           AND policyname = 'products_update' AND with_check IS NOT NULL
      )
    ),
    (
      '0058  products_insert admits staff',
      EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'products'
           AND policyname = 'products_insert' AND with_check ILIKE '%staff%'
      )
    ),
    (
      '0058  update_product_as_role() exists',
      EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_product_as_role')
    ),
    (
      '0058  Add Product button on for staff',
      EXISTS (
        SELECT 1 FROM public.page_definitions
         WHERE key = 'action.add_product' AND default_staff
      )
    ),
    (
      '0059  notification_reads table',
      to_regclass('public.notification_reads') IS NOT NULL
    ),
    (
      '0059  staff_activity_notifications view',
      to_regclass('public.staff_activity_notifications') IS NOT NULL
    )
) AS t(change, applied)
ORDER BY change;
