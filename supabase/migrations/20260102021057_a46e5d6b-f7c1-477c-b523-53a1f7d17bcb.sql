-- Create trade_history table for tracking all trade outcomes
CREATE TABLE public.trade_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coin_id TEXT NOT NULL,
  coin_name TEXT NOT NULL,
  coin_symbol TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('BUY', 'SELL')),
  entry_price NUMERIC NOT NULL,
  target_price NUMERIC NOT NULL,
  stop_loss NUMERIC NOT NULL,
  result TEXT CHECK (result IN ('SUCCESS', 'FAILED', 'PENDING')),
  exit_price NUMERIC,
  profit_loss_percent NUMERIC,
  confidence_score INTEGER,
  whale_intent TEXT,
  capital_protection_active BOOLEAN DEFAULT FALSE,
  reasoning TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE
);

-- Create system_performance table for tracking overall system metrics
CREATE TABLE public.system_performance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  total_trades INTEGER NOT NULL DEFAULT 0,
  successful_trades INTEGER NOT NULL DEFAULT 0,
  failed_trades INTEGER NOT NULL DEFAULT 0,
  accuracy_percent NUMERIC,
  consecutive_losses INTEGER NOT NULL DEFAULT 0,
  capital_protection_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  capital_protection_reason TEXT,
  mode TEXT NOT NULL DEFAULT 'paper' CHECK (mode IN ('paper', 'live')),
  last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS but allow public access for this demo
ALTER TABLE public.trade_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_performance ENABLE ROW LEVEL SECURITY;

-- Create public read/write policies (no auth required for demo)
CREATE POLICY "Allow public read access on trade_history" 
ON public.trade_history FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert on trade_history" 
ON public.trade_history FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update on trade_history" 
ON public.trade_history FOR UPDATE 
USING (true);

CREATE POLICY "Allow public read access on system_performance" 
ON public.system_performance FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert on system_performance" 
ON public.system_performance FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update on system_performance" 
ON public.system_performance FOR UPDATE 
USING (true);

-- Insert initial system performance record
INSERT INTO public.system_performance (mode, total_trades, successful_trades, failed_trades, consecutive_losses, capital_protection_enabled)
VALUES ('paper', 0, 0, 0, 0, false);