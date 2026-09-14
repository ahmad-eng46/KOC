-- ═══════════════════════════════════════════════════════════════
-- Every invoice can still say who it was billed to
--
-- THE SYMPTOM
--   Open an invoice and the Bill To line reads "Unknown customer". On the
--   invoice list the customer column reads "—". The invoice itself is intact:
--   its number, dates, lines and totals are all correct. Only the name is gone.
--
-- THE CAUSE
--   The invoice detail resolves the name by embedding through the foreign key:
--
--       invoices ... customers(name, phone, address)
--
--   That embed is subject to customers_select, which filters
--   deleted_at IS NULL. Delete a customer and every invoice ever raised for
--   them loses its name — not because the data went anywhere, but because the
--   read path refuses to see it.
--
--   0065 fixed exactly this for products with product_identity, and gave the
--   reason in one line: an invoice must keep saying what it sold. It must
--   equally keep saying who it sold to.
--
-- THE FIX
--   The same shape as product_identity: identity only, no balances, no
--   opening figures, nothing that would need gating by role. Because there is
--   no money in it, it is readable at any role, and it deliberately includes
--   deleted customers so history keeps its names.
--
--   This is the fourth view of this shape (products_for_role,
--   stock_purchases_for_role, product_identity). The base table stays shut and
--   each caller reads the projection matching what it needs.
--
-- WHAT THIS IS NOT
--   Not a way back into deleted customers. It exposes name, phone and address
--   for labelling a record that already exists — not balances, not
--   opening_balance_paisa, and it is not used to list or pick customers
--   anywhere. A deleted customer stays out of every chooser.
--
-- Down:
--   DROP VIEW public.customer_identity;
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.customer_identity;

CREATE VIEW public.customer_identity AS
SELECT
  c.id,
  c.business_id,
  c.name,
  c.phone,
  c.address,
  -- Exposed so a caller can mark a record as referring to someone since
  -- removed, rather than having to guess from a missing row.
  c.deleted_at
FROM public.customers c
WHERE public.user_has_business(c.business_id);

GRANT SELECT ON public.customer_identity TO authenticated;

COMMENT ON VIEW public.customer_identity IS
  'What a customer is called, for every role. No balances, so nothing to gate;
   includes deleted customers so historical invoices keep their names. Not a
   picker source — deleted customers must stay out of every chooser.';
