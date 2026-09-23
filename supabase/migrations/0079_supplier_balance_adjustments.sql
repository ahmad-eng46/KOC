-- ═══════════════════════════════════════════════════════════════
-- Part B, the supplier half: a supplier balance corrects by entry too
--
-- WHY THIS IS A DIFFERENT SHAPE FROM 0075
--   A customer balance had somewhere to go: ledger_entries existed, its
--   ref_type CHECK already allowed 'adjustment', and nothing had used it. 0075
--   only had to start using it.
--
--   A supplier balance has no such table. supplier_balance_view (0040) is
--   purchases minus payments, recomputed on every read, and supplier_ledger()
--   (0041) builds its rows straight out of stock_purchases and
--   supplier_payments. There is no stored number anywhere — which is why there
--   was never anything for an admin to overwrite, and equally why there was no
--   way to correct one.
--
--   So the entries have to exist before they can be posted. This adds the
--   smallest table that does that job and nothing more.
--
-- WHAT GOES IN IT
--   Only what is NOT derivable. A purchase is already a row in
--   stock_purchases; a payment is already a row in supplier_payments; copying
--   either one in here would be two records of one fact, and they would drift.
--   This holds corrections, and an opening balance if suppliers ever need one.
--
-- SIGN CONVENTION, matching 0040 and 0041
--   debit  raises what we owe the supplier   (like a purchase)
--   credit lowers it                         (like a payment)
--   balance_due_paisa = purchased - paid + SUM(debit - credit)
--
-- WHO CAN SEE IT
--   admin and accountant, the same two roles supplier_balance_view already
--   shows a balance to and supplier_ledger() already refuses anyone else. A
--   supplier balance is derived from purchase prices, and iron rule #3 keeps
--   those away from staff and viewer — so this table must not become the hole
--   in that wall.
--
-- WHO CAN WRITE IT
--   Nobody, through the API. INSERT, UPDATE and DELETE are all refused, and
--   the SECURITY DEFINER function below is the only way a row appears —
--   exactly how ledger_entries is governed. An adjustment that could be edited
--   afterwards would defeat the point of posting one.
--
-- ALSO FIXED HERE
--   0041 built each purchase's description with
--       TRIM(TRAILING '0' FROM sp.quantity::TEXT)
--   which strips zeros from whole numbers as readily as from decimals: 100
--   litres printed as "x 1 Litre" and 1000 as "x 1". Since this migration
--   rewrites that function anyway, the trim is now applied only to a decimal.
--   Display only — no stored quantity was ever affected.
--
-- Down:
--   DROP FUNCTION IF EXISTS public.adjust_supplier_balance(UUID, UUID, BIGINT, TEXT, DATE);
--   DROP TABLE IF EXISTS public.supplier_ledger_entries;
--   -- then re-run 0040's supplier_balance_view and 0041's supplier_ledger().
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. The entries that are not derived from anything
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_ledger_entries (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  supplier_id  UUID        NOT NULL REFERENCES public.suppliers(id)  ON DELETE RESTRICT,
  ref_type     TEXT        NOT NULL CHECK (ref_type IN ('adjustment', 'opening')),
  entry_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  debit_paisa  BIGINT      NOT NULL DEFAULT 0 CHECK (debit_paisa  >= 0),
  credit_paisa BIGINT      NOT NULL DEFAULT 0 CHECK (credit_paisa >= 0),
  description  TEXT        NOT NULL,
  created_by   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One side or the other, never both, never neither. A row that debits and
  -- credits at once has no meaning on a statement.
  CONSTRAINT supplier_ledger_entries_one_sided CHECK (
    (debit_paisa > 0 AND credit_paisa = 0)
    OR
    (credit_paisa > 0 AND debit_paisa = 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_supplier_ledger_entries_supplier_id_entry_date
  ON public.supplier_ledger_entries (supplier_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_supplier_ledger_entries_business_id
  ON public.supplier_ledger_entries (business_id);

COMMENT ON TABLE public.supplier_ledger_entries IS
  'Immutable: the supplier-side entries that no purchase or payment produces —
   corrections, and an opening balance if one is ever needed. Written only by
   adjust_supplier_balance(); never updated, never deleted. Correct a
   correction by posting another one.';

ALTER TABLE public.supplier_ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_ledger_entries_select ON public.supplier_ledger_entries;
DROP POLICY IF EXISTS supplier_ledger_entries_insert ON public.supplier_ledger_entries;
DROP POLICY IF EXISTS supplier_ledger_entries_update ON public.supplier_ledger_entries;
DROP POLICY IF EXISTS supplier_ledger_entries_delete ON public.supplier_ledger_entries;

CREATE POLICY supplier_ledger_entries_select ON public.supplier_ledger_entries
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

-- Insert-through-function only, like ledger_entries.
CREATE POLICY supplier_ledger_entries_insert ON public.supplier_ledger_entries
  FOR INSERT WITH CHECK (false);

CREATE POLICY supplier_ledger_entries_update ON public.supplier_ledger_entries
  FOR UPDATE USING (false);

CREATE POLICY supplier_ledger_entries_delete ON public.supplier_ledger_entries
  FOR DELETE USING (false);

GRANT SELECT ON public.supplier_ledger_entries TO authenticated;

-- ─────────────────────────────────────────────
-- 2. The balance counts them
--
--    Same three columns, same roles, same NULL for anyone who may not see a
--    purchase price. One more LEFT JOIN, so a supplier with no adjustments —
--    which is all of them, today — reads exactly as it did before.
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW public.supplier_balance_view AS
SELECT
  s.id          AS supplier_id,
  s.business_id,
  CASE
    WHEN public.user_role() IN ('admin', 'accountant')
    THEN COALESCE(pur.total_purchased_paisa, 0)
    ELSE NULL
  END AS total_purchased_paisa,
  CASE
    WHEN public.user_role() IN ('admin', 'accountant')
    THEN COALESCE(pay.total_paid_paisa, 0)
    ELSE NULL
  END AS total_paid_paisa,
  CASE
    WHEN public.user_role() IN ('admin', 'accountant')
    THEN COALESCE(pur.total_purchased_paisa, 0)
       - COALESCE(pay.total_paid_paisa, 0)
       + COALESCE(adj.total_adjusted_paisa, 0)
    ELSE NULL
  END AS balance_due_paisa
FROM public.suppliers s
LEFT JOIN (
  SELECT supplier_id, SUM(total_paisa)::BIGINT AS total_purchased_paisa
    FROM public.stock_purchases
   WHERE deleted_at IS NULL
   GROUP BY supplier_id
) pur ON pur.supplier_id = s.id
LEFT JOIN (
  SELECT supplier_id, SUM(amount_paisa)::BIGINT AS total_paid_paisa
    FROM public.supplier_payments
   WHERE deleted_at IS NULL
   GROUP BY supplier_id
) pay ON pay.supplier_id = s.id
LEFT JOIN (
  SELECT supplier_id, SUM(debit_paisa - credit_paisa)::BIGINT AS total_adjusted_paisa
    FROM public.supplier_ledger_entries
   GROUP BY supplier_id
) adj ON adj.supplier_id = s.id
WHERE s.deleted_at IS NULL
  AND public.user_has_business(s.business_id);

GRANT SELECT ON public.supplier_balance_view TO authenticated;

-- ─────────────────────────────────────────────
-- 3. The statement shows them
--
--    A third branch on the union. Everything else — the role check, the
--    running-balance window, the ordering — is 0041 unchanged.
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
      -- 0041 wrote TRIM(TRAILING '0' ...) unconditionally, which strips the
      -- zeros off whole numbers too: a purchase of 100 litres printed as
      -- "x 1 Litre", and 1000 as "x 1". Trailing zeros are only noise after a
      -- decimal point, so only a decimal is trimmed.
      'Purchase: ' || p.name || ' x '
        || CASE WHEN sp.quantity::TEXT LIKE '%.%'
                THEN TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM sp.quantity::TEXT))
                ELSE sp.quantity::TEXT
           END
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

    UNION ALL

    SELECT
      adj.id,
      adj.ref_type,
      adj.supplier_id  AS ref_id,
      adj.entry_date,
      adj.created_at,
      adj.description,
      adj.debit_paisa,
      adj.credit_paisa
    FROM public.supplier_ledger_entries adj
    WHERE adj.supplier_id = p_supplier_id
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

-- ─────────────────────────────────────────────
-- 4. Changing a supplier balance
--
--    The customer version's twin (0075), deliberately: same argument order,
--    same target-not-delta, same mandatory reason, same return shape. Two
--    corrections that behave differently depending on which party they are
--    against is how an admin learns to distrust both.
-- ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.adjust_supplier_balance(UUID, UUID, BIGINT, TEXT, DATE);

CREATE FUNCTION public.adjust_supplier_balance(
  p_supplier_id          UUID,
  p_business_id          UUID,
  p_target_balance_paisa BIGINT,
  p_reason               TEXT,
  p_entry_date           DATE DEFAULT NULL
)
RETURNS TABLE (
  old_balance_paisa BIGINT,
  new_balance_paisa BIGINT,
  difference_paisa  BIGINT,
  entry_id          UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role  TEXT := public.user_role();
  v_old   BIGINT;
  v_diff  BIGINT;
  v_date  DATE := COALESCE(p_entry_date, CURRENT_DATE);
  v_entry UUID;
  v_name  TEXT;
BEGIN
  IF NOT public.user_has_business(p_business_id) THEN
    RAISE EXCEPTION 'Not your business' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Only an admin can adjust a balance'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason is required to adjust a balance'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT s.name INTO v_name
    FROM public.suppliers s
   WHERE s.id = p_supplier_id
     AND s.business_id = p_business_id
     AND s.deleted_at IS NULL;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Supplier not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- Read from the base tables rather than supplier_balance_view: the view is
  -- invoker-rights and role-gated, and this function must compute the same
  -- number whether or not the caller could have read it themselves.
  SELECT
    COALESCE((SELECT SUM(sp.total_paisa)  FROM public.stock_purchases sp
               WHERE sp.supplier_id = p_supplier_id AND sp.deleted_at IS NULL), 0)
  - COALESCE((SELECT SUM(pay.amount_paisa) FROM public.supplier_payments pay
               WHERE pay.supplier_id = p_supplier_id AND pay.deleted_at IS NULL), 0)
  + COALESCE((SELECT SUM(adj.debit_paisa - adj.credit_paisa)
                FROM public.supplier_ledger_entries adj
               WHERE adj.supplier_id = p_supplier_id), 0)
  INTO v_old;

  v_diff := p_target_balance_paisa - v_old;

  IF v_diff = 0 THEN
    RAISE EXCEPTION 'That is already the balance — nothing to adjust'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.supplier_ledger_entries
    (business_id, supplier_id, ref_type, entry_date,
     debit_paisa, credit_paisa, description, created_by)
  VALUES
    (p_business_id, p_supplier_id, 'adjustment', v_date,
     GREATEST(v_diff, 0), GREATEST(-v_diff, 0), TRIM(p_reason), auth.uid())
  RETURNING id INTO v_entry;

  RETURN QUERY SELECT v_old, p_target_balance_paisa, v_diff, v_entry;
END;
$$;

COMMENT ON FUNCTION public.adjust_supplier_balance(UUID, UUID, BIGINT, TEXT, DATE) IS
  'Moves a supplier balance to a target figure by posting a dated adjustment
   entry for the difference — never by overwriting. Admin only, reason
   required. The twin of adjust_customer_balance (0075).';

REVOKE ALL ON FUNCTION public.adjust_supplier_balance(UUID, UUID, BIGINT, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_supplier_balance(UUID, UUID, BIGINT, TEXT, DATE) TO authenticated;
