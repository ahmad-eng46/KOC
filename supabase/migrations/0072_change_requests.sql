-- ═══════════════════════════════════════════════════════════════
-- Part A: a request can ask to EDIT, not only to delete
--
-- WHY THIS IS NOT A NEW TABLE
--   deletion_requests (0054) already carries everything an edit request needs:
--   entity_type, entity_id, entity_display_name, requested_by/at, reason,
--   status with a cancelled state, resolved_by/at, review_note, and
--   entity_snapshot — a frozen copy of the row as the requester saw it.
--
--   Two columns are missing, so two columns are added. Building a parallel
--   change_requests table would mean a second approvals screen, a second RLS
--   surface and a second place for the two to drift, to gain a wider CHECK
--   constraint. Existing rows are deletions and stay correct under the
--   default.
--
--   The table keeps its name. Renaming it would touch the view, the RLS
--   policies, the trigger in 0055, the entity registry and every caller, and
--   buy nothing a comment cannot.
--
-- WHAT IS ADDED
--   action           'edit' | 'delete'. Defaults to 'delete' so every existing
--                    row is already right and no backfill is needed.
--   proposed_changes The new values for an edit, as a partial row. NULL for a
--                    delete, and required for an edit — a CHECK enforces both
--                    directions rather than trusting the caller.
--
-- DUPLICATE REQUESTS: BLOCKED, NOT MERGED
--   A partial unique index permits one pending request per (entity, action).
--   Merging two people's proposed values would invent a third intention that
--   neither asked for, and the admin would approve something nobody wrote.
--   The second requester is told a request is already pending and by whom.
--
--   Deliberately scoped per action: a pending edit and a pending delete on the
--   same row can coexist. Approving the delete makes the edit moot, which the
--   trigger in 0055 already resolves.
--
--   This REPLACES 0054's idx_deletion_requests_no_duplicate_pending, which did
--   not know about action and would have blocked that pairing.
--
-- Down:
--   DROP INDEX IF EXISTS public.idx_change_requests_one_pending;
--   ALTER TABLE public.deletion_requests
--     DROP CONSTRAINT IF EXISTS deletion_requests_action_shape,
--     DROP COLUMN IF EXISTS proposed_changes,
--     DROP COLUMN IF EXISTS action;
--   -- then recreate deletion_requests_for_role from 0062
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. The two new columns
-- ─────────────────────────────────────────────
ALTER TABLE public.deletion_requests
  ADD COLUMN IF NOT EXISTS action           TEXT  NOT NULL DEFAULT 'delete',
  ADD COLUMN IF NOT EXISTS proposed_changes JSONB;

ALTER TABLE public.deletion_requests
  DROP CONSTRAINT IF EXISTS deletion_requests_action_check;
ALTER TABLE public.deletion_requests
  ADD CONSTRAINT deletion_requests_action_check
  CHECK (action IN ('edit', 'delete'));

-- An edit with nothing proposed is not a request, and a delete carrying
-- proposed values is a mistake waiting to be applied. Both are refused here
-- rather than in the app, so neither can arrive by another route.
ALTER TABLE public.deletion_requests
  DROP CONSTRAINT IF EXISTS deletion_requests_action_shape;
ALTER TABLE public.deletion_requests
  ADD CONSTRAINT deletion_requests_action_shape CHECK (
    (action = 'delete' AND proposed_changes IS NULL)
    OR
    (action = 'edit'
       AND proposed_changes IS NOT NULL
       AND jsonb_typeof(proposed_changes) = 'object'
       AND proposed_changes <> '{}'::jsonb)
  );

COMMENT ON COLUMN public.deletion_requests.action IS
  'What is being asked for: edit or delete. Despite the table name this is the
   change-request queue for both.';
COMMENT ON COLUMN public.deletion_requests.proposed_changes IS
  'For an edit, the new values as a partial row. NULL for a delete. Applied
   only on approval, and only after the snapshot is checked for drift.';

-- ─────────────────────────────────────────────
-- 2. One pending request per entity per action
--
--    0054's index covers (business_id, entity_type, entity_id) and knows
--    nothing about action, so leaving it in place would refuse an edit request
--    on a record that already has a delete pending — the very case this
--    migration is meant to allow. It is replaced, not supplemented.
-- ─────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_deletion_requests_no_duplicate_pending;
DROP INDEX IF EXISTS public.idx_change_requests_one_pending;

CREATE UNIQUE INDEX idx_change_requests_one_pending
  ON public.deletion_requests (business_id, entity_type, entity_id, action)
  WHERE status = 'pending';

COMMENT ON INDEX public.idx_change_requests_one_pending IS
  'Blocks a second pending request of the same kind on the same record.
   Duplicates are refused rather than merged: combining two proposals would
   produce a third that neither requester wrote.';

-- ─────────────────────────────────────────────
-- 3. The view has to carry the new columns, or the app cannot read them.
--    Recreated verbatim from 0062 with action and proposed_changes added.
--
--    proposed_changes is gated the same way entity_snapshot is: it is a
--    partial row and may name a cost price, which iron rule #3 keeps away from
--    staff and viewer — including a staff member reading back their own
--    request.
-- ─────────────────────────────────────────────
DROP VIEW IF EXISTS public.deletion_requests_for_role;

CREATE VIEW public.deletion_requests_for_role AS
SELECT
  dr.id,
  dr.business_id,
  dr.requested_by,
  dr.requested_at,
  dr.entity_type,
  dr.entity_id,
  dr.entity_display_name,
  dr.reason,
  dr.status,
  dr.resolved_by,
  dr.resolved_at,
  dr.review_note,
  dr.entity_metadata,
  dr.action,
  requester.full_name AS requester_name,
  resolver.full_name  AS resolver_name,
  CASE
    WHEN public.user_role() IN ('admin', 'accountant') THEN dr.entity_snapshot
    ELSE NULL
  END AS entity_snapshot,
  CASE
    WHEN public.user_role() IN ('admin', 'accountant') THEN dr.proposed_changes
    ELSE NULL
  END AS proposed_changes,
  dr.created_at
FROM public.deletion_requests dr
LEFT JOIN public.users requester ON requester.id = dr.requested_by
LEFT JOIN public.users resolver  ON resolver.id  = dr.resolved_by
WHERE public.user_has_business(dr.business_id)
  AND (
    public.user_role() IN ('admin', 'accountant')
    OR dr.requested_by = auth.uid()
  );

GRANT SELECT ON public.deletion_requests_for_role TO authenticated;

COMMENT ON VIEW public.deletion_requests_for_role IS
  'Change requests — edits and deletions — readable by the admin who decides
   them and the person who raised them. entity_snapshot and proposed_changes
   are withheld from staff and viewer because either may carry a cost price.';
