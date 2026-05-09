-- ─────────────────────────────────────────────
-- returns
-- ─────────────────────────────────────────────
CREATE TABLE public.returns (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  invoice_id      UUID        NOT NULL REFERENCES public.invoices(id)   ON DELETE RESTRICT,
  customer_id     UUID        NOT NULL REFERENCES public.customers(id)  ON DELETE RESTRICT,
  return_number   TEXT        NOT NULL,
  return_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
  total_paisa     BIGINT      NOT NULL DEFAULT 0,
  notes           TEXT,
  created_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TRIGGER trg_returns_updated_at
  BEFORE UPDATE ON public.returns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX idx_returns_number     ON public.returns (business_id, return_number);
CREATE INDEX idx_returns_business_id       ON public.returns (business_id);
CREATE INDEX idx_returns_invoice_id        ON public.returns (invoice_id);
CREATE INDEX idx_returns_customer_id       ON public.returns (customer_id);
CREATE INDEX idx_returns_return_date       ON public.returns (business_id, return_date DESC);
CREATE INDEX idx_returns_deleted_at        ON public.returns (deleted_at) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────
-- return_items
-- ─────────────────────────────────────────────
CREATE TABLE public.return_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id           UUID        NOT NULL REFERENCES public.returns(id)  ON DELETE CASCADE,
  invoice_item_id     UUID        NOT NULL REFERENCES public.invoice_items(id) ON DELETE RESTRICT,
  product_id          UUID        NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity            NUMERIC(12,3) NOT NULL,
  unit_price_paisa    BIGINT      NOT NULL,
  line_total_paisa    BIGINT      NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_return_items_return_id      ON public.return_items (return_id);
CREATE INDEX idx_return_items_invoice_item_id ON public.return_items (invoice_item_id);
CREATE INDEX idx_return_items_product_id     ON public.return_items (product_id);

-- ─────────────────────────────────────────────
-- Back-fill FK on stock_movements for return_id
-- ─────────────────────────────────────────────
ALTER TABLE public.stock_movements
  ADD CONSTRAINT fk_stock_movements_return
  FOREIGN KEY (return_id) REFERENCES public.returns(id) ON DELETE SET NULL;
