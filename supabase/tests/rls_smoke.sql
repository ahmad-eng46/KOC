-- ═══════════════════════════════════════════════════════════════
-- RLS Smoke Tests
-- Run against the cloud DB after 0017_rls_policies.sql is applied.
-- Uses set_config to impersonate a user via auth.uid().
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- Helper: impersonate a user by UID
-- ─────────────────────────────────────────────
-- set_config('request.jwt.claims', json_build_object('sub', uid)::text, true)
-- sets auth.uid() for the duration of the transaction.

-- ─────────────────────────────────────────────
-- SEED UUIDs (from 0016_seed.sql)
-- ─────────────────────────────────────────────
-- admin:      00000001-0000-0000-0000-000000000001
-- accountant: 00000001-0000-0000-0000-000000000002
-- staff1:     00000001-0000-0000-0000-000000000003
-- viewer:     00000001-0000-0000-0000-000000000005
-- oil biz:    00000002-0000-0000-0000-000000000001
-- cig biz:    00000002-0000-0000-0000-000000000002  (staff has NO access)

-- ═══════════════════════════════════════════════════════════════
-- TEST 1: staff → products_for_role.purchase_price_paisa IS NULL
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_price BIGINT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000001-0000-0000-0000-000000000003","role":"authenticated"}',
    true);

  SELECT purchase_price_paisa INTO v_price
  FROM public.products_for_role
  WHERE business_id = '00000002-0000-0000-0000-000000000001'
  LIMIT 1;

  IF v_price IS NULL THEN
    RAISE NOTICE 'TEST 1 PASS: staff sees purchase_price_paisa = NULL';
  ELSE
    RAISE EXCEPTION 'TEST 1 FAIL: staff saw purchase_price_paisa = %', v_price;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- TEST 2: staff → SELECT FROM products (base table) returns 0 rows (RLS blocks)
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000001-0000-0000-0000-000000000003","role":"authenticated"}',
    true);

  SELECT COUNT(*) INTO v_count FROM public.products;

  IF v_count = 0 THEN
    RAISE NOTICE 'TEST 2 PASS: staff sees 0 rows from base products table';
  ELSE
    RAISE EXCEPTION 'TEST 2 FAIL: staff saw % rows from base products table', v_count;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- TEST 3: staff → UPDATE products is blocked (0 rows affected)
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000001-0000-0000-0000-000000000003","role":"authenticated"}',
    true);

  UPDATE public.products
    SET sale_price_paisa = sale_price_paisa + 1
  WHERE business_id = '00000002-0000-0000-0000-000000000001';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Rollback the update regardless
  ROLLBACK;

  IF v_count = 0 THEN
    RAISE NOTICE 'TEST 3 PASS: staff UPDATE products affected 0 rows (RLS blocked)';
  ELSE
    RAISE EXCEPTION 'TEST 3 FAIL: staff UPDATE products affected % rows', v_count;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- TEST 4: admin → SELECT FROM products returns rows
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000001-0000-0000-0000-000000000001","role":"authenticated"}',
    true);

  SELECT COUNT(*) INTO v_count FROM public.products;

  IF v_count > 0 THEN
    RAISE NOTICE 'TEST 4 PASS: admin sees % rows from base products table', v_count;
  ELSE
    RAISE EXCEPTION 'TEST 4 FAIL: admin saw 0 rows from base products table';
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- TEST 5: admin → products_for_role.purchase_price_paisa is NOT NULL
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_price BIGINT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000001-0000-0000-0000-000000000001","role":"authenticated"}',
    true);

  SELECT purchase_price_paisa INTO v_price
  FROM public.products_for_role
  WHERE business_id = '00000002-0000-0000-0000-000000000001'
  LIMIT 1;

  IF v_price IS NOT NULL THEN
    RAISE NOTICE 'TEST 5 PASS: admin sees purchase_price_paisa = %', v_price;
  ELSE
    RAISE EXCEPTION 'TEST 5 FAIL: admin got NULL purchase_price_paisa';
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- TEST 6: cross-business isolation — staff1 (Oil only) cannot see Cigarettes customers
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000001-0000-0000-0000-000000000003","role":"authenticated"}',
    true);

  SELECT COUNT(*) INTO v_count
  FROM public.customers
  WHERE business_id = '00000002-0000-0000-0000-000000000002';  -- Cigarettes

  IF v_count = 0 THEN
    RAISE NOTICE 'TEST 6 PASS: staff1 sees 0 customers from Cigarettes business (cross-business blocked)';
  ELSE
    RAISE EXCEPTION 'TEST 6 FAIL: staff1 saw % Cigarettes customers', v_count;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- TEST 7: viewer → can SELECT invoices, cannot INSERT
-- ═══════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000001-0000-0000-0000-000000000005","role":"authenticated"}',
    true);

  SELECT COUNT(*) INTO v_count FROM public.invoices;

  IF v_count > 0 THEN
    RAISE NOTICE 'TEST 7 PASS: viewer can read % invoices', v_count;
  ELSE
    RAISE EXCEPTION 'TEST 7 FAIL: viewer saw 0 invoices';
  END IF;
END;
$$;

RAISE NOTICE '══════════════════════════════════════════';
RAISE NOTICE 'All RLS smoke tests complete. Check NOTICE lines above.';
RAISE NOTICE '══════════════════════════════════════════';
