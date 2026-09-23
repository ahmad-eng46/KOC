-- ═══════════════════════════════════════════════════════════════
-- Part B: a balance changes by posting an entry, never by overwriting
--
-- THE PROBLEM, STATED PLAINLY
--   customers.opening_balance_paisa is a plain mutable column, and the balance
--   is computed as
--       current_balance_paisa = opening_balance_paisa + SUM(debit - credit)
--   (customer_balance_view, 0042).
--
--   So "correct this customer's balance" today means UPDATE-ing that column.
--   Nothing records that it moved, by how much, or why, and the books stop
--   reconciling against the invoices and payments that are supposed to explain
--   them. For an accounting system that is the wrong shape.
--
--   ledger_entries already says what it wants to be: "immutable: never update
--   ledger rows; post correction entries instead", and its ref_type CHECK
--   already allows 'adjustment'. Nothing had ever used it.
--
-- THE MIGRATION PATH, AND WHY IT BREAKS NOTHING
--   1. ref_type gains 'opening', so an opening balance can be an entry.
--   2. Every customer with a non-zero opening balance gets one 'opening' entry
--      carrying that amount, and the column is set to 0 in the same statement.
--
--   The view is left completely alone, and still reads
--       0 + SUM(debit - credit)
--   which is the same number it produced yesterday. No read site changes, no
--   report moves, no balance shifts by a paisa. The amount simply now lives
--   where it can be explained.
--
--   The column is deliberately NOT dropped. Dropping it would break the
--   customer form, the entity registry, the backup dataset and the validators
--   in the same migration that moves the money, and there is no reason to do
--   both at once. It stays at 0, and the form writing 0 to it changes nothing.
--
-- AFTER THIS
--   Changing a balance means posting an 'adjustment' entry for the difference.
--   The balance stays the sum of its transactions, and every movement has a
--   date, an author and a reason attached.
--
-- ON ledger_entries.balance_paisa
--   It stores a running balance as at each entry, which a back-dated insert
--   would leave stale. Nothing reads it: customer_balance_view sums debit and
--   credit, and the ledger screen computes its own running total. The column
--   is left untouched rather than maintained — writing to it would imply a
--   guarantee nothing keeps.
--
-- Down:
--   -- restore the column from the entries, then remove them:
--   UPDATE public.customers c SET opening_balance_paisa = l.amt FROM (
--     SELECT customer_id, SUM(debit_paisa - credit_paisa) AS amt
--       FROM public.ledger_entries WHERE ref_type = 'opening' GROUP BY customer_id) l
--    WHERE l.customer_id = c.id;
--   DELETE FROM public.ledger_entries WHERE ref_type = 'opening';
--   DROP FUNCTION IF EXISTS public.adjust_customer_balance(UUID, UUID, BIGINT, TEXT, DATE);
--   -- then restore the ref_type CHECK from 0012
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. An opening balance is a kind of entry
-- ─────────────────────────────────────────────
ALTER TABLE public.ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_ref_type_check;

ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_ref_type_check
  CHECK (ref_type IN ('invoice', 'payment', 'return', 'adjustment', 'opening'));

-- ─────────────────────────────────────────────
-- 2. Move each opening balance into the ledger, atomically
--
--    Guarded on there being no 'opening' entry yet, so a second run moves
--    nothing: by then every column is 0 and the entries already exist.
-- ─────────────────────────────────────────────
DO $$
DECLARE
  v_moved INT;
  v_total BIGINT;
BEGIN
  WITH moved AS (
    INSERT INTO public.ledger_entries
      (business_id, customer_id, ref_type, ref_id, entry_date,
       debit_paisa, credit_paisa, balance_paisa, description)
    SELECT
      c.business_id,
      c.id,
      'opening',
      -- Polymorphic and NOT NULL, with no other row to point at: an opening
      -- balance belongs to the customer and nothing else.
      c.id,
      COALESCE(c.created_at::date, CURRENT_DATE),
      GREATEST(c.opening_balance_paisa, 0),
      GREATEST(-c.opening_balance_paisa, 0),
      c.opening_balance_paisa,
      'Opening balance'
    FROM public.customers c
    WHERE c.opening_balance_paisa <> 0
      AND NOT EXISTS (
        SELECT 1 FROM public.ledger_entries le
         WHERE le.customer_id = c.id AND le.ref_type = 'opening'
      )
    RETURNING customer_id, debit_paisa - credit_paisa AS amt
  )
  SELECT COUNT(*), COALESCE(SUM(amt), 0) INTO v_moved, v_total FROM moved;

  -- Zeroed in the same transaction as the insert. If these two ever came
  -- apart, every affected balance would double or vanish.
  UPDATE public.customers c
     SET opening_balance_paisa = 0
   WHERE c.opening_balance_paisa <> 0
     AND EXISTS (
       SELECT 1 FROM public.ledger_entries le
        WHERE le.customer_id = c.id AND le.ref_type = 'opening'
     );

  RAISE NOTICE '0075: moved % opening balance(s) into the ledger, totalling % paisa. Balances are unchanged.',
    v_moved, v_total;
END $$;

-- ─────────────────────────────────────────────
-- 3. Changing a balance
--
--    Takes the balance the admin wants the customer to HAVE, works out the
--    difference from what they have now, and posts that difference. Asking for
--    a target rather than a delta is what the admin is actually thinking, and
--    it removes the chance of applying a correction twice.
--
--    SECURITY DEFINER because it reads customer_balance_view and writes
--    ledger_entries, which is insert-only to the app; the role check below is
--    the gate, not RLS.
-- ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.adjust_customer_balance(UUID, UUID, BIGINT, TEXT, DATE);

CREATE FUNCTION public.adjust_customer_balance(
  p_customer_id     UUID,
  p_business_id     UUID,
  p_target_balance_paisa BIGINT,
  p_reason          TEXT,
  p_entry_date      DATE DEFAULT NULL
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
  v_role    TEXT := public.user_role();
  v_old     BIGINT;
  v_diff    BIGINT;
  v_date    DATE := COALESCE(p_entry_date, CURRENT_DATE);
  v_entry   UUID;
  v_name    TEXT;
BEGIN
  IF NOT public.user_has_business(p_business_id) THEN
    RAISE EXCEPTION 'Not your business' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Admin only, at the database. Staff and accountants cannot reach this even
  -- by calling it directly.
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Only an admin can adjust a balance'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A balance that moves without a stated reason is the thing this migration
  -- exists to prevent.
  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason is required to adjust a balance'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.name INTO v_name
    FROM public.customers c
   WHERE c.id = p_customer_id
     AND c.business_id = p_business_id
     AND c.deleted_at IS NULL;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Customer not found' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT COALESCE(SUM(le.debit_paisa - le.credit_paisa), 0)
    INTO v_old
    FROM public.ledger_entries le
   WHERE le.customer_id = p_customer_id;

  -- The column still contributes until it is zero everywhere, so it is counted
  -- rather than assumed away.
  SELECT v_old + COALESCE(c.opening_balance_paisa, 0) INTO v_old
    FROM public.customers c WHERE c.id = p_customer_id;

  v_diff := p_target_balance_paisa - v_old;

  IF v_diff = 0 THEN
    RAISE EXCEPTION 'That is already the balance — nothing to adjust'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.ledger_entries
    (business_id, customer_id, ref_type, ref_id, entry_date,
     debit_paisa, credit_paisa, balance_paisa, description)
  VALUES
    (p_business_id, p_customer_id, 'adjustment', p_customer_id, v_date,
     GREATEST(v_diff, 0), GREATEST(-v_diff, 0),
     p_target_balance_paisa, TRIM(p_reason))
  RETURNING id INTO v_entry;

  RETURN QUERY SELECT v_old, p_target_balance_paisa, v_diff, v_entry;
END;
$$;

COMMENT ON FUNCTION public.adjust_customer_balance(UUID, UUID, BIGINT, TEXT, DATE) IS
  'Moves a customer balance to a target figure by posting a dated adjustment
   entry for the difference — never by overwriting. Admin only, reason
   required. The balance stays the sum of its transactions.';

REVOKE ALL ON FUNCTION public.adjust_customer_balance(UUID, UUID, BIGINT, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_customer_balance(UUID, UUID, BIGINT, TEXT, DATE) TO authenticated;
