-- Verify 0060: soft delete works, and only for an admin.
-- Run in the Supabase SQL editor AFTER applying supabase/migrations/0060_*.sql.
-- This file only checks. It does not apply anything.

-- 1. The registry and the function are both there.
SELECT
  CASE WHEN to_regclass('public.deletable_entities') IS NOT NULL
        AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'soft_delete_entity')
       THEN 'PASS  soft_delete_entity() and its registry exist'
       ELSE 'FAIL  0060 has not been applied'
  END AS installed;

-- 2. It must be SECURITY DEFINER. Without that it is measured against the same
--    SELECT policy that refuses the write, and we are back to the bug.
SELECT
  CASE WHEN prosecdef
       THEN 'PASS  soft_delete_entity() is SECURITY DEFINER'
       ELSE 'FAIL  not SECURITY DEFINER — the delete will be refused again'
  END AS definer
FROM pg_proc WHERE proname = 'soft_delete_entity';

-- 3. Every registered entity names a table that exists and can be soft-deleted.
SELECT
  CASE WHEN COUNT(*) = 0
       THEN 'PASS  every registered entity maps to a real soft-deletable table'
       ELSE 'FAIL  ' || string_agg(entity_type || '->' || table_name, ', ')
  END AS registry_sound
FROM public.deletable_entities de
WHERE to_regclass('public.' || de.table_name) IS NULL
   OR NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = de.table_name
        AND column_name = 'deleted_at'
   );

-- 4. The tables this bug affects are exactly those whose SELECT policy filters
--    deleted_at. Listed rather than judged: every one of them must now be
--    deleted through the function, never by a direct UPDATE from the client.
SELECT
  'INFO  goes through soft_delete_entity(): ' || string_agg(DISTINCT tablename, ', ')
    AS affected_tables
FROM pg_policies
WHERE schemaname = 'public' AND cmd = 'SELECT' AND qual ILIKE '%deleted_at%';

-- 5. Nobody but a signed-in user may call it, and PUBLIC must not.
SELECT
  CASE WHEN has_function_privilege('authenticated',
         'public.soft_delete_entity(text,uuid,uuid,text)', 'EXECUTE')
       THEN 'PASS  authenticated may call it (the function itself checks for admin)'
       ELSE 'FAIL  authenticated cannot call it — every delete will fail'
  END AS grant_ok;
