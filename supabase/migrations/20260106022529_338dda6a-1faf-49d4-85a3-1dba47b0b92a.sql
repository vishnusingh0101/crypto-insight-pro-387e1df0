-- Remove dangerous public write policies from critical trading tables
-- These tables should only be written to by edge functions using service role key

-- Drop public INSERT and UPDATE policies on system_performance
DROP POLICY IF EXISTS "Allow public insert on system_performance" ON public.system_performance;
DROP POLICY IF EXISTS "Allow public update on system_performance" ON public.system_performance;

-- Drop public INSERT and UPDATE policies on trade_history
DROP POLICY IF EXISTS "Allow public insert on trade_history" ON public.trade_history;
DROP POLICY IF EXISTS "Allow public update on trade_history" ON public.trade_history;

-- Keep public read access for transparency (these already exist)
-- The edge functions use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS
-- so they can still write to these tables