-- Verify 0056 applied. Every column must say true.
SELECT
  (SELECT count(*) = 35 FROM public.page_definitions)                       AS all_pages_seeded,
  (SELECT count(*) = 1 FROM public.page_definitions WHERE is_lockable)      AS one_locked_page,
  to_regclass('public.user_page_access') IS NOT NULL                        AS access_table,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_reject_locked_page_access') AS lock_enforced,
  -- Nobody may edit the master list from the app.
  (SELECT qual = 'false' FROM pg_policies
     WHERE tablename='page_definitions' AND policyname='page_definitions_write') AS list_is_read_only;

-- No access row may point at a page that does not exist. Expect 0 rows.
SELECT a.user_id, a.page_key FROM public.user_page_access a
 WHERE NOT EXISTS (SELECT 1 FROM public.page_definitions p WHERE p.key = a.page_key);

-- Cost prices must never be granted to staff or viewer. Expect 0 rows.
SELECT u.full_name, u.role FROM public.user_page_access a
  JOIN public.users u ON u.id = a.user_id
 WHERE a.page_key = 'action.view_cost_prices' AND a.is_allowed AND u.role IN ('staff','viewer');

-- What each role reaches by default.
SELECT category,
       count(*) FILTER (WHERE default_accountant) AS accountant,
       count(*) FILTER (WHERE default_staff)      AS staff,
       count(*) FILTER (WHERE default_viewer)     AS viewer,
       count(*)                                   AS total
  FROM public.page_definitions GROUP BY category ORDER BY category;
