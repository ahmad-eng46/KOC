-- ─────────────────────────────────────────────
-- invoices
-- ─────────────────────────────────────────────
CREATE TABLE public.invoices (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID        NOT NULL REFERENCES public.businesses(id)  ON DELETE RESTRICT,
  customer_id         UUID        NOT NULL REFERENCES public.customers(id)   ON DELETE RESTRICT,
  invoice_number      TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'cancelled')),
  issue_date          DATE        NOT NULL DEFAULT CURRENT_DATE,
  due_date            DATE,
  subtotal_paisa      BIGINT      NOT NULL DEFAULT 0,
  discount_paisa      BIGINT      NOT NULL DEFAULT 0,
  total_paisa         BIGINT      NOT NULL DEFAULT 0,  -- subtotal - discount
  paid_paisa          BIGINT      NOT NULL DEFAULT 0,
  notes               TEXT,
  created_by          UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX idx_invoices_number      ON public.invoices (business_id, invoice_number);
CREATE INDEX idx_invoices_business_id        ON public.invoices (business_id);
CREATE INDEX idx_invoices_customer_id        ON public.invoices (customer_id);
CREATE INDEX idx_invoices_status             ON public.invoices (business_id, status);
CREATE INDEX idx_invoices_issue_date         ON public.invoices (business_id, issue_date DESC);
CREATE INDEX idx_invoices_deleted_at         ON public.invoices (deleted_at) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────
-- invoice_items
-- ─────────────────────────────────────────────
CREATE TABLE public.invoice_items (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id                  UUID        NOT NULL REFERENCES public.invoices(id)  ON DELETE CASCADE,
  product_id                  UUID        NOT NULL REFERENCES public.products(id)  ON DELETE RESTRICT,
  quantity                    NUMERIC(12,3) NOT NULL,
  unit_price_paisa            BIGINT      NOT NULL,
  purchase_price_at_sale_paisa BIGINT     NOT NULL DEFAULT 0,  -- snapshot for margin calc; hidden from staff/viewer via app layer
  discount_paisa              BIGINT      NOT NULL DEFAULT 0,
  line_total_paisa            BIGINT      NOT NULL,            -- (qty * unit_price) - discount
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- immutable after creation; corrections via returns
);

CREATE INDEX idx_invoice_items_invoice_id ON public.invoice_items (invoice_id);
CREATE INDEX idx_invoice_items_product_id ON public.invoice_items (product_id);

-- ─────────────────────────────────────────────
-- Back-fill FK on stock_movements for invoice_id
-- ─────────────────────────────────────────────
ALTER TABLE public.stock_movements
  ADD CONSTRAINT fk_stock_movements_invoice
  FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
