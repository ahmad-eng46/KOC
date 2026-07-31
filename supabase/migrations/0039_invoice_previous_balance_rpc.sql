-- ─────────────────────────────────────────────
-- invoice_previous_balance(p_invoice_id UUID) RETURNS BIGINT
--
-- The customer's outstanding balance (paisa) as it stood immediately BEFORE
-- this invoice was posted to the ledger. Used by the invoice PDF so the
-- customer sees their full account position, not just this one invoice.
--
-- Ordering matches customer_ledger() exactly — (entry_date, created_at), with
-- the synthetic opening balance always first. Anything that sorts strictly
-- before the invoice's own ledger row counts as "previous"; payments made
-- against this invoice sort after it and are therefore excluded (they are
-- shown separately as "Paid").
--
-- Draft invoices have no ledger row (trg_ledger_invoice skips status='draft'),
-- so we fall back to the invoice's own (issue_date, created_at) as the cut
-- point.
--
-- SECURITY DEFINER + explicit user_has_business() check, matching
-- customer_ledger(): staff/accountant RLS on ledger_entries may differ, but
-- the caller must still belong to the invoice's business.
--
-- Down:
--   DROP FUNCTION IF EXISTS public.invoice_previous_balance(UUID);
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.invoice_previous_balance(p_invoice_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id   UUID;
  v_business_id   UUID;
  v_inv_date      DATE;
  v_inv_created   TIMESTAMPTZ;
  v_led_date      DATE;
  v_led_created   TIMESTAMPTZ;
  v_cut_date      DATE;
  v_cut_created   TIMESTAMPTZ;
  v_opening       BIGINT;
  v_movements     BIGINT;
BEGIN
  SELECT i.customer_id, i.business_id, i.issue_date, i.created_at
    INTO v_customer_id, v_business_id, v_inv_date, v_inv_created
    FROM public.invoices i
   WHERE i.id = p_invoice_id
     AND i.deleted_at IS NULL;

  IF v_customer_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.user_has_business(v_business_id) THEN
    RAISE EXCEPTION 'Not authorised for this business';
  END IF;

  -- The invoice's own ledger row is the authoritative cut point.
  SELECT le.entry_date, le.created_at
    INTO v_led_date, v_led_created
    FROM public.ledger_entries le
   WHERE le.ref_type = 'invoice'
     AND le.ref_id = p_invoice_id
   ORDER BY le.created_at
   LIMIT 1;

  v_cut_date    := COALESCE(v_led_date, v_inv_date);
  v_cut_created := COALESCE(v_led_created, v_inv_created);

  -- Opening balance is sort_key 0 in customer_ledger() — always "previous".
  SELECT COALESCE(c.opening_balance_paisa, 0)
    INTO v_opening
    FROM public.customers c
   WHERE c.id = v_customer_id
     AND c.deleted_at IS NULL;

  SELECT COALESCE(SUM(le.debit_paisa - le.credit_paisa), 0)
    INTO v_movements
    FROM public.ledger_entries le
   WHERE le.customer_id = v_customer_id
     AND le.business_id = v_business_id
     AND (le.entry_date, le.created_at) < (v_cut_date, v_cut_created);

  RETURN COALESCE(v_opening, 0) + COALESCE(v_movements, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.invoice_previous_balance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoice_previous_balance(UUID) TO authenticated;

COMMENT ON FUNCTION public.invoice_previous_balance(UUID) IS
  'Customer outstanding balance (paisa) immediately before this invoice was
   posted. Same ordering as customer_ledger(). Excludes payments against this
   invoice. Returns NULL if the invoice does not exist or is soft-deleted.';
