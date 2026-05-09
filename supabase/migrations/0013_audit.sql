-- ─────────────────────────────────────────────
-- audit_log — admin-only, immutable
-- Populated by log_audit() trigger defined in 0002_helpers.sql
-- ─────────────────────────────────────────────
CREATE TABLE public.audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  table_name    TEXT        NOT NULL,
  row_id        UUID        NOT NULL,
  action        TEXT        NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  before_jsonb  JSONB,
  after_jsonb   JSONB,
  at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_table_row  ON public.audit_log (table_name, row_id);
CREATE INDEX idx_audit_log_user_id    ON public.audit_log (user_id);
CREATE INDEX idx_audit_log_at         ON public.audit_log (at DESC);

-- ─────────────────────────────────────────────
-- Apply log_audit() trigger to every financial table
-- ─────────────────────────────────────────────
CREATE TRIGGER audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_invoice_items
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_expenses
  AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_returns
  AFTER INSERT OR UPDATE OR DELETE ON public.returns
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_return_items
  AFTER INSERT OR UPDATE OR DELETE ON public.return_items
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_users
  AFTER INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_products
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_investments
  AFTER INSERT OR UPDATE OR DELETE ON public.investments
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_loans
  AFTER INSERT OR UPDATE OR DELETE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION log_audit();
