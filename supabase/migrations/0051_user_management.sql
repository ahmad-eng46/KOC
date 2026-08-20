-- ═══════════════════════════════════════════════════════════════
-- User management: forced first-login password, per-user permission
-- overrides, and a human-readable activity log.
--
--   users.must_change_password  admin-set temporary password not yet replaced
--   users.password_changed_at   last time the user changed it themselves
--   users.invited_at            when an admin created the account
--
--   user_permission_overrides   per-user grant/deny on top of the role default
--   activity_log                what people DID, in words. Distinct from
--                               audit_log, which records row-level database
--                               changes via triggers. Both exist; audit_log
--                               answers "what changed in this row", activity_log
--                               answers "what did Waleed do on Tuesday".
--
-- Down:
--   DROP TABLE IF EXISTS public.activity_log;
--   DROP TABLE IF EXISTS public.user_permission_overrides;
--   ALTER TABLE public.users
--     DROP COLUMN IF EXISTS must_change_password,
--     DROP COLUMN IF EXISTS password_changed_at,
--     DROP COLUMN IF EXISTS invited_at;
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. users — first-login state
--    Defaults to false so every EXISTING user keeps signing in untouched.
--    Only accounts created after this migration are flagged.
-- ─────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_changed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invited_at           TIMESTAMPTZ;

COMMENT ON COLUMN public.users.must_change_password IS
  'True while the account still uses the temporary password an admin set. The middleware
   pins these users to /change-password until they set their own.';
COMMENT ON COLUMN public.users.password_changed_at IS
  'Last time the user changed their OWN password. NULL means never — still on a temporary one.';
COMMENT ON COLUMN public.users.invited_at IS
  'When an admin created this account.';

-- ─────────────────────────────────────────────
-- 2. user_permission_overrides
--    granted = true  → user has it even though the role does not
--    granted = false → user loses it even though the role does
--    No row          → the role default applies
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  user_id     UUID        NOT NULL REFERENCES public.users(id)      ON DELETE CASCADE,
  permission  TEXT        NOT NULL,
  granted     BOOLEAN     NOT NULL,
  granted_by  UUID        REFERENCES public.users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes       TEXT,
  UNIQUE (business_id, user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user
  ON public.user_permission_overrides (user_id, business_id);

COMMENT ON TABLE public.user_permission_overrides IS
  'Per-user departures from the role default. Application-level only — iron rule #3
   (purchase_price_paisa hidden from staff/viewer) is enforced by products_for_role in
   the database and is deliberately NOT overridable here.';

ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_permission_overrides_select ON public.user_permission_overrides;
DROP POLICY IF EXISTS user_permission_overrides_insert ON public.user_permission_overrides;
DROP POLICY IF EXISTS user_permission_overrides_update ON public.user_permission_overrides;
DROP POLICY IF EXISTS user_permission_overrides_delete ON public.user_permission_overrides;

-- Admins manage everyone's; every user may read their OWN, because the app has to
-- resolve the caller's effective permissions on each request. Reading which doors
-- are open to you leaks nothing that the UI would not already show you.
CREATE POLICY user_permission_overrides_select ON public.user_permission_overrides
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND (public.user_role() = 'admin' OR user_id = auth.uid())
  );
CREATE POLICY user_permission_overrides_insert ON public.user_permission_overrides
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id) AND public.user_role() = 'admin'
  );
CREATE POLICY user_permission_overrides_update ON public.user_permission_overrides
  FOR UPDATE USING (
    public.user_has_business(business_id) AND public.user_role() = 'admin'
  );
CREATE POLICY user_permission_overrides_delete ON public.user_permission_overrides
  FOR DELETE USING (
    public.user_has_business(business_id) AND public.user_role() = 'admin'
  );

-- ─────────────────────────────────────────────
-- 3. activity_log
--    Append-only. No deleted_at, no UPDATE policy, no DELETE policy — a log you
--    can edit is not a log.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  user_id     UUID        NOT NULL REFERENCES public.users(id),
  action      TEXT        NOT NULL,
  entity_type TEXT        NOT NULL,
  entity_id   UUID,
  description TEXT        NOT NULL,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_business_date
  ON public.activity_log (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_user
  ON public.activity_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity
  ON public.activity_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action
  ON public.activity_log (business_id, action, created_at DESC);

COMMENT ON TABLE public.activity_log IS
  'Human-readable record of business actions ("Created Invoice #INV-00115 for Ali").
   Append-only. Separate from audit_log, which records row-level changes via triggers.';

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_log_select ON public.activity_log;
DROP POLICY IF EXISTS activity_log_insert ON public.activity_log;
DROP POLICY IF EXISTS activity_log_update ON public.activity_log;
DROP POLICY IF EXISTS activity_log_delete ON public.activity_log;

CREATE POLICY activity_log_select ON public.activity_log
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

-- Anyone signed in may append their own line — staff must be able to record that
-- they created an invoice. user_id is pinned to the caller so no one can write
-- an entry in someone else's name.
CREATE POLICY activity_log_insert ON public.activity_log
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id) AND user_id = auth.uid()
  );

CREATE POLICY activity_log_update ON public.activity_log
  FOR UPDATE USING (false);
CREATE POLICY activity_log_delete ON public.activity_log
  FOR DELETE USING (false);
