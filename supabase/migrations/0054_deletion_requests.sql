-- ═══════════════════════════════════════════════════════════════
-- Deletion requests: a way for non-admins to ASK.
--
-- Worth stating plainly, because it changes what this migration is for: the
-- server already refuses non-admin deletes on ten of the twelve delete actions
-- (invoices, payments, expenses, returns, suppliers, brands, locations,
-- expense assets, expense sub-types, customer categories). What has been
-- missing is not enforcement but a route — a staff member who spots a
-- duplicate invoice has had nowhere to say so.
--
-- The two exceptions were real holes, closed in the same commit as this
-- migration: softDeleteCustomer and softDeleteProduct had NO role check at all
-- and leaned entirely on RLS, which iron rule #7 forbids. customers_update
-- admits accountants, so an accountant could soft-delete any customer with no
-- gate and no reason recorded.
--
-- The table is an audit record: no soft delete, no DELETE policy, and rows are
-- only ever updated to resolve them.
--
-- Down:
--   DROP TABLE IF EXISTS public.deletion_requests;
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,

  requested_by UUID        NOT NULL REFERENCES public.users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  entity_type  TEXT        NOT NULL,
  entity_id    UUID        NOT NULL,
  /** Human-readable, captured at request time: "Invoice #INV-00115". */
  entity_display_name TEXT NOT NULL,

  reason       TEXT        NOT NULL,

  status       TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  resolved_by  UUID        REFERENCES public.users(id),
  resolved_at  TIMESTAMPTZ,
  rejection_reason TEXT,

  /**
   * Enough detail for the admin to decide without opening the record, frozen
   * as it was when the request was made. Deliberately a snapshot: if the
   * invoice changes afterwards, the admin should see what the requester saw,
   * and the app compares the two to warn about drift.
   */
  entity_metadata JSONB    NOT NULL DEFAULT '{}',

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.deletion_requests
  DROP CONSTRAINT IF EXISTS deletion_requests_entity_type_valid;
ALTER TABLE public.deletion_requests
  ADD CONSTRAINT deletion_requests_entity_type_valid CHECK (entity_type IN (
    'invoice', 'customer', 'product', 'expense', 'payment', 'return',
    'supplier', 'stock_purchase', 'supplier_payment', 'brand', 'location',
    'customer_category', 'expense_asset', 'expense_sub_type'
  ));

-- A reason is the point of the whole exercise; an empty one is not a reason.
ALTER TABLE public.deletion_requests
  DROP CONSTRAINT IF EXISTS deletion_requests_reason_present;
ALTER TABLE public.deletion_requests
  ADD CONSTRAINT deletion_requests_reason_present CHECK (LENGTH(TRIM(reason)) >= 5);

-- A resolved row must say who resolved it and when; a pending row must not.
ALTER TABLE public.deletion_requests
  DROP CONSTRAINT IF EXISTS deletion_requests_resolution_consistent;
ALTER TABLE public.deletion_requests
  ADD CONSTRAINT deletion_requests_resolution_consistent CHECK (
    (status = 'pending'  AND resolved_by IS NULL AND resolved_at IS NULL)
    OR (status = 'cancelled' AND resolved_at IS NOT NULL)
    OR (status IN ('approved', 'rejected') AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_deletion_requests_business_status
  ON public.deletion_requests (business_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_entity
  ON public.deletion_requests (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_user
  ON public.deletion_requests (requested_by, status);

-- One open request per entity. The app checks first and gives a friendly
-- message naming who asked; this is the guarantee behind that check.
CREATE UNIQUE INDEX IF NOT EXISTS idx_deletion_requests_no_duplicate_pending
  ON public.deletion_requests (business_id, entity_type, entity_id)
  WHERE status = 'pending';

COMMENT ON TABLE public.deletion_requests IS
  'Non-admin requests to delete a record, and the admin decision on each. Permanent
   audit records: never soft-deleted, never hard-deleted, only resolved.';

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deletion_requests_select ON public.deletion_requests;
DROP POLICY IF EXISTS deletion_requests_insert ON public.deletion_requests;
DROP POLICY IF EXISTS deletion_requests_update ON public.deletion_requests;
DROP POLICY IF EXISTS deletion_requests_delete ON public.deletion_requests;

-- Admin and accountant see the queue; everyone else sees only what they asked
-- for, which is what "My Requests" needs.
CREATE POLICY deletion_requests_select ON public.deletion_requests
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND (
      public.user_role() IN ('admin', 'accountant')
      OR requested_by = auth.uid()
    )
  );

-- Admin never files a request — admin deletes. The role list excludes them so
-- an admin request cannot exist to be approved by that same admin.
CREATE POLICY deletion_requests_insert ON public.deletion_requests
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('accountant', 'staff', 'viewer')
    AND requested_by = auth.uid()
    AND status = 'pending'
  );

-- Admin resolves; a requester may withdraw their own pending request. Both are
-- UPDATEs, so both live here, and the CHECK above stops a withdrawal being
-- dressed up as an approval.
CREATE POLICY deletion_requests_update ON public.deletion_requests
  FOR UPDATE USING (
    public.user_has_business(business_id)
    AND (
      public.user_role() = 'admin'
      OR (requested_by = auth.uid() AND status = 'pending')
    )
  );

CREATE POLICY deletion_requests_delete ON public.deletion_requests
  FOR DELETE USING (false);

-- ─────────────────────────────────────────────
-- Audit
-- ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS audit_deletion_requests ON public.deletion_requests;
CREATE TRIGGER audit_deletion_requests
  AFTER INSERT OR UPDATE ON public.deletion_requests
  FOR EACH ROW EXECUTE FUNCTION log_audit();
