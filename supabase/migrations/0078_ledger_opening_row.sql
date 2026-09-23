-- ═══════════════════════════════════════════════════════════════
-- The ledger screen stops showing an empty opening row
--
-- WHY
--   customer_ledger() (0031) always emits a synthetic first row carrying
--   customers.opening_balance_paisa. That was right while the column held the
--   opening balance.
--
--   0075 moves those amounts into ledger_entries as real 'opening' rows and
--   sets the column to 0. The RPC then returns BOTH: a synthetic
--   "Opening Balance Rs. 0.00" row and, under it, the real dated one. The
--   running balance stays correct — the synthetic row adds zero — but the
--   statement reads as though the customer opened at nothing and was then
--   adjusted, which is not what happened.
--
--   So the synthetic row becomes conditional: it appears only while the column
--   still holds something. Before 0075 that is every customer who had an
--   opening balance, and the screen is unchanged. After 0075 it is nobody, and
--   the real entry does the job — with a date and a description, which the
--   synthetic row never had.
--
--   The two migrations are therefore order-independent: applying this one
--   first changes nothing, applying it second cleans up after 0075.
--
-- Down:
--   Re-run 0031_customer_ledger_rpc.sql.
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.customer_ledger(p_customer_id UUID)
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH base AS (
    SELECT
      0                                AS sort_key,
      gen_random_uuid()                AS id,
      'opening'::TEXT                  AS ref_type,
      NULL::UUID                       AS ref_id,
      c.created_at::DATE               AS entry_date,
      c.created_at                     AS created_at,
      'Opening Balance'                AS description,
      c.opening_balance_paisa          AS debit_paisa,
      0::BIGINT                        AS credit_paisa
    FROM public.customers c
    WHERE c.id = p_customer_id
      AND c.deleted_at IS NULL
      AND public.user_has_business(c.business_id)
      -- The one line this migration adds.
      AND c.opening_balance_paisa <> 0

    UNION ALL

    SELECT
      1            AS sort_key,
      le.id,
      le.ref_type,
      le.ref_id,
      le.entry_date,
      le.created_at,
      le.description,
      le.debit_paisa,
      le.credit_paisa
    FROM public.ledger_entries le
    WHERE le.customer_id = p_customer_id
      AND public.user_has_business(le.business_id)
  )
  SELECT
    id, ref_type, ref_id, entry_date, created_at, description,
    debit_paisa, credit_paisa,
    SUM(debit_paisa - credit_paisa) OVER (
      ORDER BY sort_key, entry_date, created_at
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_balance
  FROM base
  ORDER BY sort_key, entry_date, created_at;
$$;
