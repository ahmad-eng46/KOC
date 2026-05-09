-- ═══════════════════════════════════════════════════════════════
-- RLS Policies — Piece 2
-- Pattern: SELECT filtered by user_businesses membership.
--          INSERT/UPDATE gated by role via public.user_role().
--          DELETE denied on all tables (soft-delete only).
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- Helper: is the calling user a member of the given business?
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_has_business(bid UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_businesses
    WHERE user_id = auth.uid() AND business_id = bid
  );
$$;

-- ─────────────────────────────────────────────
-- Enable RLS on every public table
-- ─────────────────────────────────────────────
ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_businesses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_log             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backups             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings        ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- users
-- ═══════════════════════════════════════════════════════════════
-- Any authenticated user can read their own row; admin reads all.
CREATE POLICY users_select ON public.users
  FOR SELECT USING (
    id = auth.uid()
    OR public.user_role() = 'admin'
  );

-- Only admin can create users (they create via Supabase Auth Admin API;
-- the trigger mirrors the row here automatically).
CREATE POLICY users_insert ON public.users
  FOR INSERT WITH CHECK (public.user_role() = 'admin');

-- Admin can update any user; users can update their own non-role fields.
CREATE POLICY users_update ON public.users
  FOR UPDATE USING (
    public.user_role() = 'admin' OR id = auth.uid()
  );

-- No hard delete.
CREATE POLICY users_delete ON public.users
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- businesses
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY businesses_select ON public.businesses
  FOR SELECT USING (
    id IN (
      SELECT business_id FROM public.user_businesses WHERE user_id = auth.uid()
    )
  );

CREATE POLICY businesses_insert ON public.businesses
  FOR INSERT WITH CHECK (public.user_role() = 'admin');

CREATE POLICY businesses_update ON public.businesses
  FOR UPDATE USING (public.user_role() = 'admin');

CREATE POLICY businesses_delete ON public.businesses
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- user_businesses
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY user_businesses_select ON public.user_businesses
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.user_role() = 'admin'
  );

CREATE POLICY user_businesses_insert ON public.user_businesses
  FOR INSERT WITH CHECK (public.user_role() = 'admin');

CREATE POLICY user_businesses_update ON public.user_businesses
  FOR UPDATE USING (public.user_role() = 'admin');

CREATE POLICY user_businesses_delete ON public.user_businesses
  FOR DELETE USING (public.user_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════
-- customer_categories
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY customer_categories_select ON public.customer_categories
  FOR SELECT USING (public.user_has_business(business_id));

CREATE POLICY customer_categories_insert ON public.customer_categories
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY customer_categories_update ON public.customer_categories
  FOR UPDATE USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY customer_categories_delete ON public.customer_categories
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- customers
-- PERMISSIONS: customers.view — all roles
--              customers.create — admin, accountant, staff
--              customers.update — admin, accountant
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY customers_select ON public.customers
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND deleted_at IS NULL
  );

CREATE POLICY customers_insert ON public.customers
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant', 'staff')
  );

CREATE POLICY customers_update ON public.customers
  FOR UPDATE USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY customers_delete ON public.customers
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- products (base table)
-- SELECT: admin and accountant only — staff/viewer MUST use products_for_role VIEW.
-- INSERT/UPDATE: admin only (accountant can view, not mutate products).
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY products_select ON public.products
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
    AND deleted_at IS NULL
  );

CREATE POLICY products_insert ON public.products
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() = 'admin'
  );

CREATE POLICY products_update ON public.products
  FOR UPDATE USING (
    public.user_has_business(business_id)
    AND public.user_role() = 'admin'
  );

CREATE POLICY products_delete ON public.products
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- stock_movements
-- PERMISSIONS: stock.view — admin, accountant, staff
--              stock.update (new movement) — admin, accountant, staff
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY stock_movements_select ON public.stock_movements
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant', 'staff')
  );

CREATE POLICY stock_movements_insert ON public.stock_movements
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant', 'staff')
  );

-- Stock movements are immutable; corrections are new rows.
CREATE POLICY stock_movements_update ON public.stock_movements
  FOR UPDATE USING (false);

CREATE POLICY stock_movements_delete ON public.stock_movements
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- invoices
-- PERMISSIONS: invoices.view — all roles
--              invoices.create — admin, accountant, staff
--              invoices.update (cancel/edit) — admin, accountant
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY invoices_select ON public.invoices
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND deleted_at IS NULL
  );

CREATE POLICY invoices_insert ON public.invoices
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant', 'staff')
  );

CREATE POLICY invoices_update ON public.invoices
  FOR UPDATE USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY invoices_delete ON public.invoices
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- invoice_items
-- Access controlled via parent invoice's business_id.
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY invoice_items_select ON public.invoice_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND public.user_has_business(i.business_id)
        AND i.deleted_at IS NULL
    )
  );

CREATE POLICY invoice_items_insert ON public.invoice_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND public.user_has_business(i.business_id)
        AND public.user_role() IN ('admin', 'accountant', 'staff')
    )
  );

-- Items are immutable after creation; use returns for corrections.
CREATE POLICY invoice_items_update ON public.invoice_items
  FOR UPDATE USING (false);

CREATE POLICY invoice_items_delete ON public.invoice_items
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- returns
-- PERMISSIONS: admin, accountant
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY returns_select ON public.returns
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND deleted_at IS NULL
  );

CREATE POLICY returns_insert ON public.returns
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY returns_update ON public.returns
  FOR UPDATE USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY returns_delete ON public.returns
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- return_items
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY return_items_select ON public.return_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.returns r
      WHERE r.id = return_id
        AND public.user_has_business(r.business_id)
        AND r.deleted_at IS NULL
    )
  );

CREATE POLICY return_items_insert ON public.return_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.returns r
      WHERE r.id = return_id
        AND public.user_has_business(r.business_id)
        AND public.user_role() IN ('admin', 'accountant')
    )
  );

CREATE POLICY return_items_update ON public.return_items
  FOR UPDATE USING (false);

CREATE POLICY return_items_delete ON public.return_items
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- payments
-- PERMISSIONS: payments.create — admin, accountant, staff
--              payments.view — admin, accountant, staff (viewer excluded)
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY payments_select ON public.payments
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant', 'staff')
    AND deleted_at IS NULL
  );

CREATE POLICY payments_insert ON public.payments
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant', 'staff')
  );

CREATE POLICY payments_update ON public.payments
  FOR UPDATE USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY payments_delete ON public.payments
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- expenses
-- PERMISSIONS: expenses.* — admin, accountant
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY expenses_select ON public.expenses
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
    AND deleted_at IS NULL
  );

CREATE POLICY expenses_insert ON public.expenses
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY expenses_update ON public.expenses
  FOR UPDATE USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY expenses_delete ON public.expenses
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- investments
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY investments_select ON public.investments
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY investments_insert ON public.investments
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() = 'admin'
  );

CREATE POLICY investments_update ON public.investments
  FOR UPDATE USING (
    public.user_has_business(business_id)
    AND public.user_role() = 'admin'
  );

CREATE POLICY investments_delete ON public.investments
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- loans
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY loans_select ON public.loans
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY loans_insert ON public.loans
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() = 'admin'
  );

CREATE POLICY loans_update ON public.loans
  FOR UPDATE USING (
    public.user_has_business(business_id)
    AND public.user_role() = 'admin'
  );

CREATE POLICY loans_delete ON public.loans
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- ledger_entries — read-only for app; populated by triggers only
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY ledger_select ON public.ledger_entries
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

-- Triggers run as SECURITY DEFINER so they bypass RLS.
-- No app-level INSERT/UPDATE/DELETE allowed.
CREATE POLICY ledger_insert ON public.ledger_entries
  FOR INSERT WITH CHECK (false);

CREATE POLICY ledger_update ON public.ledger_entries
  FOR UPDATE USING (false);

CREATE POLICY ledger_delete ON public.ledger_entries
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- audit_log — admin read-only; populated by triggers only
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY audit_log_select ON public.audit_log
  FOR SELECT USING (public.user_role() = 'admin');

CREATE POLICY audit_log_insert ON public.audit_log
  FOR INSERT WITH CHECK (false);

CREATE POLICY audit_log_update ON public.audit_log
  FOR UPDATE USING (false);

CREATE POLICY audit_log_delete ON public.audit_log
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- sms_log
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY sms_log_select ON public.sms_log
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY sms_log_insert ON public.sms_log
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant', 'staff')
  );

CREATE POLICY sms_log_update ON public.sms_log
  FOR UPDATE USING (false);

CREATE POLICY sms_log_delete ON public.sms_log
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- backups
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY backups_select ON public.backups
  FOR SELECT USING (public.user_role() IN ('admin', 'accountant'));

CREATE POLICY backups_insert ON public.backups
  FOR INSERT WITH CHECK (public.user_role() IN ('admin', 'accountant'));

CREATE POLICY backups_update ON public.backups
  FOR UPDATE USING (public.user_role() = 'admin');

CREATE POLICY backups_delete ON public.backups
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- app_settings — admin read/write; others read only
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY app_settings_select ON public.app_settings
  FOR SELECT USING (
    business_id IS NULL
    OR public.user_has_business(business_id)
  );

CREATE POLICY app_settings_insert ON public.app_settings
  FOR INSERT WITH CHECK (public.user_role() = 'admin');

CREATE POLICY app_settings_update ON public.app_settings
  FOR UPDATE USING (public.user_role() = 'admin');

CREATE POLICY app_settings_delete ON public.app_settings
  FOR DELETE USING (false);
