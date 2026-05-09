-- ─────────────────────────────────────────────
-- customer_categories
-- ─────────────────────────────────────────────
CREATE TABLE public.customer_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_customer_categories_updated_at
  BEFORE UPDATE ON public.customer_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_customer_categories_business_id ON public.customer_categories (business_id);

-- ─────────────────────────────────────────────
-- customers
-- ─────────────────────────────────────────────
CREATE TABLE public.customers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  category_id     UUID        REFERENCES public.customer_categories(id) ON DELETE SET NULL,
  name            TEXT        NOT NULL,
  phone           TEXT,
  address         TEXT,
  opening_balance_paisa BIGINT NOT NULL DEFAULT 0,
  credit_limit_paisa    BIGINT,
  is_defaulter    BOOLEAN     NOT NULL DEFAULT false,
  notes           TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_customers_business_id  ON public.customers (business_id);
CREATE INDEX idx_customers_category_id  ON public.customers (category_id);
CREATE INDEX idx_customers_name         ON public.customers (business_id, name);
CREATE INDEX idx_customers_is_defaulter ON public.customers (business_id, is_defaulter);
CREATE INDEX idx_customers_deleted_at   ON public.customers (deleted_at) WHERE deleted_at IS NULL;
