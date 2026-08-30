-- Verify 0057: every soft-deletable table's UPDATE policy states WITH CHECK.
-- Run in the Supabase SQL editor after applying 0057. Expect PASS on both.

-- 1. No _update policy on a soft-deletable table may rely on the implicit
--    WITH CHECK copy. with_check IS NULL is exactly that reliance.
SELECT
  CASE WHEN COUNT(*) = 0
       THEN 'PASS  every soft-delete UPDATE policy has an explicit WITH CHECK'
       ELSE 'FAIL  ' || COUNT(*) || ' still missing: ' || string_agg(tablename, ', ')
  END AS with_check_present
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd = 'UPDATE'
  AND with_check IS NULL
  AND tablename IN (
    'products','customers','customer_categories','invoices','returns',
    'payments','expenses','expense_assets','brands','locations','suppliers'
  );

-- 2. No WITH CHECK may mention deleted_at — that is what rejected the delete.
SELECT
  CASE WHEN COUNT(*) = 0
       THEN 'PASS  no UPDATE policy rejects a row for having deleted_at set'
       ELSE 'FAIL  ' || string_agg(tablename, ', ')
  END AS deleted_at_not_blocked
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd = 'UPDATE'
  AND with_check ILIKE '%deleted_at%';

-- 3. The policies as they now stand, for the record.
SELECT tablename, policyname, qual AS using_expr, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd = 'UPDATE'
  AND tablename IN (
    'products','customers','customer_categories','invoices','returns',
    'payments','expenses','expense_assets','brands','locations','suppliers'
  )
ORDER BY tablename;
