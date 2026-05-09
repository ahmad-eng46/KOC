-- ─────────────────────────────────────────────
-- payments
-- ─────────────────────────────────────────────
CREATE TABLE public.payments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  customer_id     UUID        NOT NULL REFERENCES public.customers(id)  ON DELETE RESTRICT,
  invoice_id      UUID        REFERENCES public.invoices(id)            ON DELETE RESTRICT,
  amount_paisa    BIGINT      NOT NULL,
  method          TEXT        NOT NULL DEFAULT 'cash'
                              CHECK (method IN ('cash', 'bank_transfer', 'cheque', 'online')),
  reference       TEXT,       -- cheque number, transaction ID, etc.
  payment_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  created_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_payments_business_id  ON public.payments (business_id);
CREATE INDEX idx_payments_customer_id  ON public.payments (customer_id);
CREATE INDEX idx_payments_invoice_id   ON public.payments (invoice_id);
CREATE INDEX idx_payments_payment_date ON public.payments (business_id, payment_date DESC);
CREATE INDEX idx_payments_deleted_at   ON public.payments (deleted_at) WHERE deleted_at IS NULL;
