-- Which migrations have actually landed on this database.
--
-- Run this FIRST when something behaves as though a migration was applied and
-- it was not. One row per change, so a partial apply is obvious at a glance.
--
-- IMPORTANT: this file only REPORTS. It changes nothing. To apply a migration,
-- run the file in supabase/migrations/ of the same number — not the verify_*
-- or status file in this directory.
--
-- Two kinds of row here, and they mean different things:
--
--   Most rows check that something EXISTS — a table, a function, a policy
--   naming staff. true means that migration ran.
--
--   Three are phrased as an absence: "cost prices still hidden", "no redundant
--   rows", "no blank SKU". They are safety guards. true is what you want, but
--   an empty database also has nothing wrong with it, so true alone does not
--   prove the migration ran. Read them alongside the EXISTS rows above them.

SELECT * FROM (
  VALUES
    -- ── 0056–0059 ────────────────────────────────────────────
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
    ),

    -- ── 0060  soft delete actually works ─────────────────────
    (
      '0060  deletable_entities registry',
      to_regclass('public.deletable_entities') IS NOT NULL
    ),
    (
      '0060  soft_delete_entity() is SECURITY DEFINER',
      EXISTS (
        SELECT 1 FROM pg_proc
         WHERE proname = 'soft_delete_entity' AND prosecdef
      )
    ),

    -- ── 0061  staff open access ──────────────────────────────
    (
      '0061  staff can read expenses',
      EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'expenses'
           AND cmd = 'SELECT' AND qual ILIKE '%staff%'
      )
    ),
    (
      '0061  staff can write investments',
      EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'investments'
           AND cmd = 'INSERT' AND COALESCE(with_check, '') ILIKE '%staff%'
      )
    ),
    (
      '0061  settings sub-pages have their own keys',
      (SELECT COUNT(*) FROM public.page_definitions
        WHERE key IN ('settings.brands','settings.categories',
                      'settings.assets','settings.activity')) = 4
    ),
    (
      '0061  cost prices still hidden from staff',
      NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND cmd = 'SELECT'
           AND tablename IN ('products','stock_purchases','audit_log','backups')
           AND COALESCE(qual, with_check) ILIKE '%staff%'
      )
    ),

    -- ── 0062  deletion approvals ─────────────────────────────
    (
      '0062  deletion reason is optional',
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'deletion_requests'
           AND column_name = 'reason' AND is_nullable = 'YES'
      )
    ),
    (
      '0062  entity_snapshot column',
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'deletion_requests'
           AND column_name = 'entity_snapshot'
      )
    ),
    (
      '0062  deletion_requests_for_role view',
      to_regclass('public.deletion_requests_for_role') IS NOT NULL
    ),
    (
      '0062  file/cancel request functions',
      (SELECT COUNT(*) FROM pg_proc
        WHERE proname IN ('file_deletion_request','cancel_deletion_request')) = 2
    ),
    (
      '0062  products_for_role carries brand_name',
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'products_for_role'
           AND column_name = 'brand_name'
      )
    ),

    -- ── 0063  page access stops shadowing defaults ───────────
    (
      '0063  no redundant user_page_access rows',
      NOT EXISTS (
        SELECT 1
          FROM public.user_page_access upa
          JOIN public.users u            ON u.id  = upa.user_id
          JOIN public.page_definitions p ON p.key = upa.page_key
         WHERE upa.is_allowed = CASE u.role
                                  WHEN 'admin'      THEN p.default_admin
                                  WHEN 'accountant' THEN p.default_accountant
                                  WHEN 'staff'      THEN p.default_staff
                                  WHEN 'viewer'     THEN p.default_viewer
                                END
      )
    ),

    -- ── 0064  blank SKU is NULL ──────────────────────────────
    (
      '0064  no product stores a blank SKU as text',
      NOT EXISTS (
        SELECT 1 FROM public.products WHERE TRIM(COALESCE(sku, '')) = ''
                                        AND sku IS NOT NULL
      )
    ),

    -- ── 0065  product names readable by every role ───────────
    (
      '0065  product_identity view',
      to_regclass('public.product_identity') IS NOT NULL
    )
) AS t(change, applied)
ORDER BY change;
