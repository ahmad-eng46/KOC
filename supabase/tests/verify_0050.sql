-- Verify 0050 applied. Every row must say true.
SELECT
  (SELECT count(*) = 2 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='products'
       AND column_name IN ('pack_size','pack_name'))             AS products_pack_cols,
  (SELECT count(*) = 3 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='invoice_items'
       AND column_name IN ('entered_quantity','entry_mode','pack_size_snapshot'))
                                                                 AS invoice_items_cols,
  (SELECT count(*) = 3 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='stock_purchases'
       AND column_name IN ('entered_quantity','entry_mode','pack_size_snapshot'))
                                                                 AS stock_purchase_cols,
  to_regprocedure('public.convert_to_units(numeric,text,integer)') IS NOT NULL
                                                                 AS convert_to_units_fn,
  (SELECT count(*) = 2 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='products_for_role'
       AND column_name IN ('pack_size','pack_name'))             AS view_products_for_role,
  (SELECT count(*) = 5 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='stock_purchases_for_role'
       AND column_name IN ('entered_quantity','entry_mode','pack_size_snapshot',
                           'product_pack_size','product_pack_name'))
                                                                 AS view_stock_purchases_for_role,
  -- 0037's stock guard must still be inside create_invoice_atomic
  (SELECT prosrc LIKE '%product_stock_on_hand%' AND prosrc LIKE '%FOR UPDATE%'
     FROM pg_proc WHERE oid = 'public.create_invoice_atomic(jsonb)'::regprocedure)
                                                                 AS stock_guard_intact;

-- The exact read the invoice page makes. Should return rows, not 42703.
SELECT ii.id, ii.entered_quantity, ii.entry_mode, ii.pack_size_snapshot,
       p.name, p.sku, p.unit, p.pack_name
  FROM public.invoice_items ii
  JOIN public.products p ON p.id = ii.product_id
 LIMIT 3;
