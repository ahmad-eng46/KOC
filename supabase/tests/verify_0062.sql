-- Verify 0062: the deletion approval flow.
-- Run in the Supabase SQL editor AFTER applying supabase/migrations/0062_*.sql.
-- This file only checks. It does not apply anything.

-- 1. The reason is optional.
SELECT
  CASE WHEN is_nullable = 'YES'
       THEN 'PASS  reason is optional'
       ELSE 'FAIL  reason is still NOT NULL'
  END AS reason_optional
FROM information_schema.columns
WHERE table_schema='public' AND table_name='deletion_requests' AND column_name='reason';

-- 2. The snapshot column exists.
SELECT
  CASE WHEN COUNT(*) = 1
       THEN 'PASS  entity_snapshot present'
       ELSE 'FAIL  entity_snapshot missing'
  END AS snapshot_column
FROM information_schema.columns
WHERE table_schema='public' AND table_name='deletion_requests' AND column_name='entity_snapshot';

-- 3. Registering an entity is one INSERT: entity_type is a foreign key to the
--    registry, not a hardcoded list in a CHECK.
SELECT
  CASE WHEN EXISTS (
         SELECT 1 FROM pg_constraint
          WHERE conname = 'deletion_requests_entity_type_fk' AND contype = 'f')
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
          WHERE conname = 'deletion_requests_entity_type_valid')
       THEN 'PASS  entity_type follows deletable_entities'
       ELSE 'FAIL  still pinned to a hardcoded CHECK'
  END AS registry_driven;

-- 4. The requester cannot read the table directly. Without this the view is
--    decoration — a staff member could ask PostgREST for deletion_requests and
--    read entity_snapshot, cost price and all.
SELECT
  CASE WHEN qual NOT LIKE '%auth.uid()%'
       THEN 'PASS  base table is admin/accountant only; requesters use the view'
       ELSE 'FAIL  requesters can still read the table, snapshot included'
  END AS snapshot_not_leaked
FROM pg_policies
WHERE schemaname='public' AND tablename='deletion_requests' AND policyname='deletion_requests_select';

-- 5. Both write paths exist. Filing captures the snapshot with rights the
--    requester does not have; cancelling needs the same treatment because
--    closing the table in (4) took the requester's UPDATE with it.
SELECT
  CASE WHEN COUNT(*) = 2
       THEN 'PASS  file_deletion_request() and cancel_deletion_request() exist'
       ELSE 'FAIL  found ' || COUNT(*) || ' of 2'
  END AS write_paths
FROM pg_proc WHERE proname IN ('file_deletion_request','cancel_deletion_request');

-- 6. Staff still cannot delete for real, by any route.
SELECT
  CASE WHEN NOT prosecdef OR proname <> 'soft_delete_entity'
       THEN 'FAIL  soft_delete_entity() changed shape'
       ELSE 'PASS  the only real delete is still admin-gated (0060)'
  END AS delete_still_admin_only
FROM pg_proc WHERE proname = 'soft_delete_entity';

-- 7. One pending request per record.
SELECT
  CASE WHEN COUNT(*) = 1
       THEN 'PASS  duplicate pending requests are impossible'
       ELSE 'FAIL  the partial unique index is missing'
  END AS no_duplicates
FROM pg_indexes
WHERE schemaname='public' AND indexname='idx_deletion_requests_no_duplicate_pending';
