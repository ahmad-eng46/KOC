-- ─────────────────────────────────────────────
-- ledger_entries
-- Populated only by Postgres triggers — never by application code directly.
-- Each financial event (invoice, payment, return) creates one or more entries.
-- ─────────────────────────────────────────────
CREATE TABLE public.ledger_entries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID        NOT NULL REFERENCES public.businesses(id)  ON DELETE RESTRICT,
  customer_id   UUID        NOT NULL REFERENCES public.customers(id)   ON DELETE RESTRICT,
  ref_type      TEXT        NOT NULL CHECK (ref_type IN ('invoice', 'payment', 'return', 'adjustment')),
  ref_id        UUID        NOT NULL,   -- polymorphic: invoice.id / payment.id / return.id
  entry_date    DATE        NOT NULL,
  debit_paisa   BIGINT      NOT NULL DEFAULT 0,   -- amount owed by customer (invoice)
  credit_paisa  BIGINT      NOT NULL DEFAULT 0,   -- amount paid / credit note
  balance_paisa BIGINT      NOT NULL DEFAULT 0,   -- running balance at time of entry
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- immutable: never update ledger rows; post correction entries instead
);

CREATE INDEX idx_ledger_business_id  ON public.ledger_entries (business_id);
CREATE INDEX idx_ledger_customer_id  ON public.ledger_entries (customer_id, entry_date DESC);
CREATE INDEX idx_ledger_ref          ON public.ledger_entries (ref_type, ref_id);
CREATE INDEX idx_ledger_entry_date   ON public.ledger_entries (business_id, entry_date DESC);

-- ─────────────────────────────────────────────
-- Trigger: invoice → ledger debit
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_ledger_on_invoice()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  SELECT COALESCE(SUM(debit_paisa) - SUM(credit_paisa), 0)
    INTO v_balance
    FROM public.ledger_entries
   WHERE customer_id = NEW.customer_id AND business_id = NEW.business_id;

  INSERT INTO public.ledger_entries
    (business_id, customer_id, ref_type, ref_id, entry_date, debit_paisa, balance_paisa, description)
  VALUES
    (NEW.business_id, NEW.customer_id, 'invoice', NEW.id,
     NEW.issue_date, NEW.total_paisa, v_balance + NEW.total_paisa,
     'Invoice ' || NEW.invoice_number);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ledger_invoice
  AFTER INSERT ON public.invoices
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL AND NEW.status != 'draft')
  EXECUTE FUNCTION fn_ledger_on_invoice();

-- ─────────────────────────────────────────────
-- Trigger: payment → ledger credit
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_ledger_on_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  SELECT COALESCE(SUM(debit_paisa) - SUM(credit_paisa), 0)
    INTO v_balance
    FROM public.ledger_entries
   WHERE customer_id = NEW.customer_id AND business_id = NEW.business_id;

  INSERT INTO public.ledger_entries
    (business_id, customer_id, ref_type, ref_id, entry_date, credit_paisa, balance_paisa, description)
  VALUES
    (NEW.business_id, NEW.customer_id, 'payment', NEW.id,
     NEW.payment_date, NEW.amount_paisa, v_balance - NEW.amount_paisa,
     'Payment received');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ledger_payment
  AFTER INSERT ON public.payments
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION fn_ledger_on_payment();

-- ─────────────────────────────────────────────
-- Trigger: return → ledger credit
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_ledger_on_return()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  SELECT COALESCE(SUM(debit_paisa) - SUM(credit_paisa), 0)
    INTO v_balance
    FROM public.ledger_entries
   WHERE customer_id = NEW.customer_id AND business_id = NEW.business_id;

  INSERT INTO public.ledger_entries
    (business_id, customer_id, ref_type, ref_id, entry_date, credit_paisa, balance_paisa, description)
  VALUES
    (NEW.business_id, NEW.customer_id, 'return', NEW.id,
     NEW.return_date, NEW.total_paisa, v_balance - NEW.total_paisa,
     'Return ' || NEW.return_number);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ledger_return
  AFTER INSERT ON public.returns
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION fn_ledger_on_return();
