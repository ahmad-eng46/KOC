-- ─────────────────────────────────────────────
-- customer_ledger(p_customer_id UUID)
--
-- Returns one synthetic "opening" row + all real ledger_entries for this
-- customer, with running_balance computed live via SUM(...) OVER (...).
--
-- Running balance is NEVER stored in ledger_entries.balance_paisa for client
-- display — that column is the snapshot at insert time, but inserts can
-- (theoretically) interleave with concurrent triggers. The window function
-- here is the source of truth for any UI that displays a running balance.
--
-- SECURITY DEFINER + explicit user_has_business() check, so it works for
-- staff/accountant whose RLS on ledger_entries may differ.
-- ─────────────────────────────────────────────

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
    -- Synthetic opening-balance row (sort_key = 0 → always first)
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

    UNION ALL

    -- Real ledger entries (sort_key = 1 → after opening)
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

REVOKE ALL ON FUNCTION public.customer_ledger(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_ledger(UUID) TO authenticated;

COMMENT ON FUNCTION public.customer_ledger(UUID) IS
  'Live customer ledger with running_balance via window function.
   Includes synthetic Opening Balance row first. Source of truth for UI display.
   Never relies on ledger_entries.balance_paisa for visible totals.';
