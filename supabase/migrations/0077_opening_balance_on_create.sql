-- ═══════════════════════════════════════════════════════════════
-- An opening balance entered on the customer form becomes a ledger entry
--
-- WHY THIS IS NEEDED BEFORE 0075 IS SAFE
--   0075 moves every existing opening balance into the ledger and zeroes
--   customers.opening_balance_paisa. But the customer form still writes to
--   that column, so the very next customer created would put money back into
--   the place 0075 just emptied — and the two would diverge again, quietly,
--   one customer at a time.
--
--   Applying 0075 without this is not wrong so much as temporary.
--
-- WHY A FUNCTION
--   ledger_insert is WITH CHECK (false): nothing in the app may write a ledger
--   row, by design. Entries arrive through triggers and SECURITY DEFINER
--   functions so that every one of them is created by code that knows what it
--   is doing. This is that code for the one case the app legitimately has.
--
-- ONE PER CUSTOMER
--   An opening balance is a fact about the start of a relationship; there is
--   only ever one. Called twice, the second call is refused rather than
--   posting a second entry — correcting an opening balance is an adjustment
--   (0075), not a second opening.
--
-- Down:
--   DROP FUNCTION IF EXISTS public.post_customer_opening_balance(UUID, UUID, BIGINT, DATE);
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.post_customer_opening_balance(UUID, UUID, BIGINT, DATE);

CREATE FUNCTION public.post_customer_opening_balance(
  p_customer_id UUID,
  p_business_id UUID,
  p_amount_paisa BIGINT,
  p_entry_date  DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role  TEXT := public.user_role();
  v_date  DATE := COALESCE(p_entry_date, CURRENT_DATE);
  v_id    UUID;
BEGIN
  IF NOT public.user_has_business(p_business_id) THEN
    RAISE EXCEPTION 'Not your business' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Whoever may create a customer may state what they already owe. Staff hold
  -- customers.create, so they are included; this posts a stated fact, not a
  -- correction, and corrections remain admin-only (0075).
  IF v_role NOT IN ('admin', 'accountant', 'staff') THEN
    RAISE EXCEPTION 'Not allowed to set an opening balance'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_amount_paisa = 0 THEN
    -- Nothing owed at the start is the normal case and needs no entry.
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id = p_customer_id AND c.business_id = p_business_id
       AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Customer not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ledger_entries le
     WHERE le.customer_id = p_customer_id AND le.ref_type = 'opening'
  ) THEN
    RAISE EXCEPTION 'This customer already has an opening balance — adjust it instead'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.ledger_entries
    (business_id, customer_id, ref_type, ref_id, entry_date,
     debit_paisa, credit_paisa, balance_paisa, description)
  VALUES
    (p_business_id, p_customer_id, 'opening', p_customer_id, v_date,
     GREATEST(p_amount_paisa, 0), GREATEST(-p_amount_paisa, 0),
     p_amount_paisa, 'Opening balance')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.post_customer_opening_balance(UUID, UUID, BIGINT, DATE) IS
  'Records a new customer''s opening balance as a ledger entry rather than a
   column, so it is explainable from the day it is entered. One per customer;
   changing it afterwards is an adjustment.';

REVOKE ALL ON FUNCTION public.post_customer_opening_balance(UUID, UUID, BIGINT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_customer_opening_balance(UUID, UUID, BIGINT, DATE) TO authenticated;
