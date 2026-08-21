-- ═══════════════════════════════════════════════════════════════
-- Page access: an admin-controlled checklist of what each user may see.
--
-- This sits ALONGSIDE user_permission_overrides (0051), which is a different
-- axis and stays untouched:
--
--   user_permission_overrides  what a user may DO   (invoices.create, ledger.view)
--   user_page_access           what a user may SEE  (the Payments page, a report)
--
-- Two per-user permission stores is a real hazard — a sidebar that shows a page
-- the server refuses. The app resolves it with one rule, enforced in
-- canAccessPage(): for an action key that maps to a permission, page access can
-- only ever NARROW what the permission system already allows. Ticking a box
-- cannot grant what the role and its overrides deny.
--
--   page_definitions  the master list and the per-role defaults, as data rather
--                     than a hardcoded array, so adding a page is one INSERT.
--   user_page_access  only the departures from those defaults. A user with no
--                     rows behaves exactly as they do today, which is why this
--                     migration needs no backfill.
--
-- Down:
--   DROP TABLE IF EXISTS public.user_page_access;
--   DROP TABLE IF EXISTS public.page_definitions;
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. page_definitions — global, not per business
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.page_definitions (
  key         TEXT    PRIMARY KEY,
  label       TEXT    NOT NULL,
  category    TEXT    NOT NULL CHECK (category IN ('main', 'reports', 'settings', 'actions')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  description TEXT,

  default_admin      BOOLEAN NOT NULL DEFAULT true,
  default_accountant BOOLEAN NOT NULL DEFAULT false,
  default_staff      BOOLEAN NOT NULL DEFAULT false,
  default_viewer     BOOLEAN NOT NULL DEFAULT false,

  /**
   * True where the database itself enforces the rule, so no checkbox can move
   * it. Only action.view_cost_prices today: products_for_role NULLs the cost
   * columns from user_role(), and a tick here would be a promise the database
   * refuses to keep (iron rule #3).
   */
  is_lockable BOOLEAN NOT NULL DEFAULT false,

  /**
   * The permission this key narrows, where one exists. canAccessPage() requires
   * BOTH the permission and the tick, so the checklist can restrict a user but
   * never hand them something their role and overrides deny.
   */
  permission_key TEXT
);

COMMENT ON TABLE public.page_definitions IS
  'Master list of pages and actions the access checklist offers, with per-role defaults.
   Global: the same pages exist in every business.';

ALTER TABLE public.page_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS page_definitions_select ON public.page_definitions;
DROP POLICY IF EXISTS page_definitions_write ON public.page_definitions;

-- Everyone signed in reads it: a user's own sidebar needs the defaults. Nobody
-- writes it from the app — new pages arrive by migration, with the code.
CREATE POLICY page_definitions_select ON public.page_definitions
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY page_definitions_write ON public.page_definitions
  FOR ALL USING (false) WITH CHECK (false);

-- ─────────────────────────────────────────────
-- 2. user_page_access — only the departures from the defaults
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_page_access (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  page_key    TEXT        NOT NULL REFERENCES public.page_definitions(key) ON DELETE CASCADE,
  is_allowed  BOOLEAN     NOT NULL DEFAULT false,
  granted_by  UUID        REFERENCES public.users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, user_id, page_key)
);

CREATE INDEX IF NOT EXISTS idx_user_page_access_user
  ON public.user_page_access (user_id, business_id);

COMMENT ON TABLE public.user_page_access IS
  'Per-user departures from the role defaults in page_definitions. A user with no rows
   here gets exactly the role default, which is why existing users need no backfill.';

ALTER TABLE public.user_page_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_page_access_select ON public.user_page_access;
DROP POLICY IF EXISTS user_page_access_insert ON public.user_page_access;
DROP POLICY IF EXISTS user_page_access_update ON public.user_page_access;
DROP POLICY IF EXISTS user_page_access_delete ON public.user_page_access;

-- A user reads their own so their sidebar can be built; an admin reads all so
-- the checklist can be filled in.
CREATE POLICY user_page_access_select ON public.user_page_access
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND (public.user_role() = 'admin' OR user_id = auth.uid())
  );
CREATE POLICY user_page_access_insert ON public.user_page_access
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id) AND public.user_role() = 'admin'
  );
CREATE POLICY user_page_access_update ON public.user_page_access
  FOR UPDATE USING (
    public.user_has_business(business_id) AND public.user_role() = 'admin'
  );
-- Deleting the rows IS "reset to role defaults", so admins may.
CREATE POLICY user_page_access_delete ON public.user_page_access
  FOR DELETE USING (
    public.user_has_business(business_id) AND public.user_role() = 'admin'
  );

-- ─────────────────────────────────────────────
-- 3. The master list
--    Defaults mirror what each role can reach today, so applying this migration
--    changes nobody's experience until an admin ticks something.
-- ─────────────────────────────────────────────
INSERT INTO public.page_definitions
  (key, label, category, sort_order, default_admin, default_accountant, default_staff, default_viewer, is_lockable, permission_key)
VALUES
  ('dashboard',           'Dashboard',            'main',     1,  true, true,  true,  true,  false, NULL),
  ('customers',           'Customers',            'main',     2,  true, true,  true,  true,  false, 'customers.view'),
  ('products',            'Products',             'main',     3,  true, true,  true,  true,  false, 'products.view'),
  ('stock',               'Stock',                'main',     4,  true, true,  true,  false, false, 'stock.view'),
  ('invoices',            'Invoices',             'main',     5,  true, true,  true,  true,  false, 'invoices.view'),
  ('payments',            'Payments',             'main',     6,  true, true,  false, false, false, 'payments.view'),
  ('expenses',            'Expenses',             'main',     7,  true, true,  false, false, false, 'expenses.view'),
  ('investments',         'Investments',          'main',     8,  true, true,  false, false, false, 'investments.view'),
  ('loans',               'Loans',                'main',     9,  true, true,  false, false, false, 'loans.view'),
  ('ledger',              'Ledger',               'main',    10,  true, true,  false, false, false, 'ledger.view'),
  ('suppliers',           'Suppliers',            'main',    11,  true, true,  true,  false, false, 'suppliers.view'),
  ('locations',           'Locations',            'main',    12,  true, true,  true,  true,  false, NULL),

  ('reports.sales',       'Sales Report',         'reports',  1,  true, true,  false, false, false, 'reports.view_basic'),
  ('reports.purchase',    'Purchase Report',      'reports',  2,  true, true,  false, false, false, 'reports.view'),
  ('reports.customer',    'Customer Report',      'reports',  3,  true, true,  false, false, false, 'reports.view_basic'),
  ('reports.pnl',         'P&L Report',           'reports',  4,  true, true,  false, false, false, 'reports.pnl'),
  ('reports.stock',       'Stock Report',         'reports',  5,  true, true,  false, false, false, 'reports.view'),
  ('reports.receivables', 'Receivables Report',   'reports',  6,  true, true,  false, false, false, 'reports.view_basic'),
  ('reports.defaulters',  'Defaulters Report',    'reports',  7,  true, true,  false, false, false, 'reports.view_basic'),
  ('reports.cashbook',    'Daily Cash Book',      'reports',  8,  true, true,  false, false, false, 'reports.view'),
  ('reports.audit',       'Audit Report',         'reports',  9,  true, false, false, false, false, NULL),
  ('reports.analytics',   'Sales Analytics',      'reports', 10,  true, true,  false, false, false, 'reports.view'),

  ('settings',            'Settings',             'settings', 1,  true, false, false, false, false, 'settings.manage'),
  ('users',               'Users',                'settings', 2,  true, false, false, false, false, 'users.manage'),
  ('backup',              'Backup',               'settings', 3,  true, true,  false, false, false, NULL),
  ('approvals',           'Approvals',            'settings', 4,  true, true,  true,  true,  false, NULL),

  ('action.create_invoice',   'Create Invoices',           'actions', 1, true, true,  true,  false, false, 'invoices.create'),
  ('action.create_payment',   'Create Payments',           'actions', 2, true, true,  false, false, false, 'payments.create'),
  ('action.create_expense',   'Create Expenses',           'actions', 3, true, true,  false, false, false, 'expenses.create'),
  ('action.create_customer',  'Create Customers',          'actions', 4, true, true,  true,  false, false, 'customers.create'),
  ('action.add_product',      'Add Products',              'actions', 5, true, false, false, false, false, 'products.create'),
  ('action.add_stock',        'Add Stock / Purchases',     'actions', 6, true, true,  true,  false, false, 'purchases.create'),
  ('action.view_cost_prices', 'View Cost/Purchase Prices', 'actions', 7, true, true,  false, false, true,  NULL),
  ('action.download_backup',  'Download Backup',           'actions', 8, true, true,  false, false, false, NULL),
  ('action.export',           'Export PDF/Excel',          'actions', 9, true, true,  false, false, false, 'reports.view_basic')
ON CONFLICT (key) DO UPDATE SET
  label              = EXCLUDED.label,
  category           = EXCLUDED.category,
  sort_order         = EXCLUDED.sort_order,
  default_admin      = EXCLUDED.default_admin,
  default_accountant = EXCLUDED.default_accountant,
  default_staff      = EXCLUDED.default_staff,
  default_viewer     = EXCLUDED.default_viewer,
  is_lockable        = EXCLUDED.is_lockable,
  permission_key     = EXCLUDED.permission_key;

-- ─────────────────────────────────────────────
-- 4. Guard: the locked row can never be granted to staff or viewer.
--    The app disables the checkbox; this is what makes it true even if a row
--    is inserted by hand.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_locked_page_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lockable BOOLEAN;
  v_role     TEXT;
BEGIN
  IF NOT NEW.is_allowed THEN
    RETURN NEW;
  END IF;

  SELECT is_lockable INTO v_lockable
    FROM public.page_definitions WHERE key = NEW.page_key;

  IF NOT COALESCE(v_lockable, false) THEN
    RETURN NEW;
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = NEW.user_id;

  IF v_role IN ('staff', 'viewer') THEN
    RAISE EXCEPTION
      '% cannot be granted to a % — it is enforced by the database (iron rule #3)',
      NEW.page_key, v_role
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_locked_page_access ON public.user_page_access;
CREATE TRIGGER trg_reject_locked_page_access
  BEFORE INSERT OR UPDATE ON public.user_page_access
  FOR EACH ROW EXECUTE FUNCTION public.reject_locked_page_access();
