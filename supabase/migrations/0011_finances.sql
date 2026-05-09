-- ─────────────────────────────────────────────
-- expenses
-- type 'home' can be toggled in/out of P&L by admin
-- ─────────────────────────────────────────────
CREATE TABLE public.expenses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  type            TEXT        NOT NULL DEFAULT 'business'
                              CHECK (type IN ('business', 'home')),
  category        TEXT        NOT NULL,
  description     TEXT,
  amount_paisa    BIGINT      NOT NULL,
  expense_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  include_in_pnl  BOOLEAN     NOT NULL DEFAULT true,  -- admin can override for home expenses
  created_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_expenses_business_id  ON public.expenses (business_id);
CREATE INDEX idx_expenses_type         ON public.expenses (business_id, type);
CREATE INDEX idx_expenses_expense_date ON public.expenses (business_id, expense_date DESC);
CREATE INDEX idx_expenses_deleted_at   ON public.expenses (deleted_at) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────
-- investments
-- ─────────────────────────────────────────────
CREATE TABLE public.investments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  investor_name   TEXT        NOT NULL,
  description     TEXT,
  amount_paisa    BIGINT      NOT NULL,
  investment_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  created_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_investments_updated_at
  BEFORE UPDATE ON public.investments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_investments_business_id    ON public.investments (business_id);
CREATE INDEX idx_investments_investor_name  ON public.investments (business_id, investor_name);

-- ─────────────────────────────────────────────
-- loans
-- ─────────────────────────────────────────────
CREATE TABLE public.loans (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  party_name      TEXT        NOT NULL,
  direction       TEXT        NOT NULL CHECK (direction IN ('given', 'taken')),
  principal_paisa BIGINT      NOT NULL,
  balance_paisa   BIGINT      NOT NULL,
  interest_rate   NUMERIC(5,2) NOT NULL DEFAULT 0,
  loan_date       DATE        NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,
  is_settled      BOOLEAN     NOT NULL DEFAULT false,
  notes           TEXT,
  created_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_loans_updated_at
  BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_loans_business_id  ON public.loans (business_id);
CREATE INDEX idx_loans_is_settled   ON public.loans (business_id, is_settled);
CREATE INDEX idx_loans_due_date     ON public.loans (business_id, due_date);
