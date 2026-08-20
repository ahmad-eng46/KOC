-- Verify 0051 applied. Every column must say true.
SELECT
  (SELECT count(*) = 3 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='users'
       AND column_name IN ('must_change_password','password_changed_at','invited_at'))
                                                            AS users_first_login_cols,
  to_regclass('public.user_permission_overrides') IS NOT NULL AS overrides_table,
  to_regclass('public.activity_log')              IS NOT NULL AS activity_table,
  (SELECT relrowsecurity FROM pg_class
     WHERE oid = 'public.user_permission_overrides'::regclass) AS overrides_rls_on,
  (SELECT relrowsecurity FROM pg_class
     WHERE oid = 'public.activity_log'::regclass)              AS activity_rls_on,
  (SELECT count(*) = 4 FROM pg_policies
     WHERE schemaname='public' AND tablename='user_permission_overrides')
                                                            AS overrides_four_policies,
  (SELECT count(*) = 4 FROM pg_policies
     WHERE schemaname='public' AND tablename='activity_log') AS activity_four_policies,
  -- The log must be append-only: UPDATE and DELETE both fenced off with false.
  (SELECT bool_and(qual = 'false') FROM pg_policies
     WHERE schemaname='public' AND tablename='activity_log' AND cmd IN ('UPDATE','DELETE'))
                                                            AS activity_append_only,
  (SELECT count(*) = 4 FROM pg_indexes
     WHERE schemaname='public' AND tablename='activity_log'
       AND indexname LIKE 'idx_activity_log_%')             AS activity_indexes;

-- Existing accounts must be untouched: nobody should be forced to change a
-- password they already chose. Expect 0 rows flagged.
SELECT count(*) AS users_flagged_for_change
  FROM public.users WHERE must_change_password;
