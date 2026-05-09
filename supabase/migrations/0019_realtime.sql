-- Enable Supabase Realtime for stock_movements so clients receive live inserts.
-- current_stock is a VIEW — realtime is only on tables, clients re-fetch on event.
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_movements;
