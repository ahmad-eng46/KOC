-- ─────────────────────────────────────────────
-- supplier_ledger(p_supplier_id UUID)
--
-- Combined chronological account for one supplier: purchases (debit — we owe
-- more) and payments (credit — we paid), with a running balance computed by a
-- window function. Deliberately the same shape and ordering key as
-- customer_ledger(): (entry_date, created_at).
--
-- SIGN CONVENTION matches supplier_balance_view:
--   running_balance > 0  → we owe the supplier
--   running_balance < 0  → we overpaid them
--
-- No synthetic opening-balance row: unlike customers, suppliers carry no
-- opening_balance_paisa column, so the first purchase is the first row.
--
-- Running balance is NEVER computed client-side — this RPC is the only source
-- of truth for the Ledger tab, exactly as customer_ledger() is for customers.
--
-- SECURITY DEFINER + explicit membership check, matching customer_ledger().
-- Unlike the other supplier reads there is no NULL-money variant: the whole
-- point of the view is money, so staff/viewer are refused outright and the UI
-- hides the tab for them.
--
-- Down:
--   DROP FUNCTION IF EXISTS public.supplier_ledger(UUID);
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.supplier_ledger(p_supplier_id UUID)
RETURNS TABLE(
  id              UUID,
  ref_type        TEXT,
  ref_id          UUID,
  entry_date      DATE,
  created_at      TIMESTAMPTZ,
  description     TEXT,
  debit_paisa     BIGINT,
  credit_paisa    BIGINT,
  running_balance BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id UUID;
BEGIN
  SELECT s.business_id INTO v_business_id
    FROM public.suppliers s
   WHERE s.id = p_supplier_id
     AND s.deleted_at IS NULL;

  IF v_business_id IS NULL THEN
    RETURN;  -- unknown or soft-deleted supplier: empty ledger, not an error
  END IF;

  IF NOT public.user_has_business(v_business_id) THEN
    RAISE EXCEPTION 'Access denied: not a member of this business';
  END IF;

  IF public.user_role() NOT IN ('admin', 'accountant') THEN
    RAISE EXCEPTION 'Permission denied: supplier ledger shows purchase prices';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      sp.id,
      'purchase'::TEXT AS ref_type,
      sp.id            AS ref_id,
      sp.purchase_date AS entry_date,
      sp.created_at,
      'Purchase: ' || p.name || ' x ' || TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM sp.quantity::TEXT))
        || ' ' || p.unit AS description,
      sp.total_paisa   AS debit_paisa,
      0::BIGINT        AS credit_paisa
    FROM public.stock_purchases sp
    JOIN public.products p ON p.id = sp.product_id
    WHERE sp.supplier_id = p_supplier_id
      AND sp.deleted_at IS NULL

    UNION ALL

    SELECT
      pay.id,
      'payment'::TEXT AS ref_type,
      pay.id          AS ref_id,
      pay.payment_date AS entry_date,
      pay.created_at,
      'Payment'
        || COALESCE(' (' || REPLACE(pay.payment_method, '_', ' ') || ')', '')
        || COALESCE(' ref ' || pay.reference, '') AS description,
      0::BIGINT        AS debit_paisa,
      pay.amount_paisa AS credit_paisa
    FROM public.supplier_payments pay
    WHERE pay.supplier_id = p_supplier_id
      AND pay.deleted_at IS NULL
  )
  SELECT
    b.id, b.ref_type, b.ref_id, b.entry_date, b.created_at, b.description,
    b.debit_paisa, b.credit_paisa,
    SUM(b.debit_paisa - b.credit_paisa) OVER (
      ORDER BY b.entry_date, b.created_at
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )::BIGINT AS running_balance
  FROM base b
  ORDER BY b.entry_date, b.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_ledger(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_ledger(UUID) TO authenticated;

COMMENT ON FUNCTION public.supplier_ledger(UUID) IS
  'Chronological supplier account: purchases debit, payments credit, running balance via
   window function. Positive balance = we owe the supplier. Same ordering key as
   customer_ledger(). Admin/accountant only — it exposes purchase prices.';
