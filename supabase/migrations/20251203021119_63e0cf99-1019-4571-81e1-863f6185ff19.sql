-- Create table to track trade predictions and outcomes for learning
CREATE TABLE public.trade_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coin_id TEXT NOT NULL,
  coin_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('BUY', 'SELL', 'HOLD')),
  predicted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  entry_price DECIMAL NOT NULL,
  target_price DECIMAL NOT NULL,
  stop_loss DECIMAL NOT NULL,
  success_probability INTEGER NOT NULL,
  -- Outcome tracking (filled later)
  outcome_checked_at TIMESTAMP WITH TIME ZONE,
  actual_price_after_24h DECIMAL,
  was_successful BOOLEAN,
  profit_loss_percent DECIMAL,
  -- Strategy metadata
  buy_score INTEGER,
  sell_score INTEGER,
  rsi_at_prediction DECIMAL,
  atr_at_prediction DECIMAL,
  volume_ratio_at_prediction DECIMAL,
  market_cap_rank INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table to store strategy improvements from AI analysis
CREATE TABLE public.strategy_improvements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  total_predictions_analyzed INTEGER NOT NULL,
  successful_predictions INTEGER NOT NULL,
  failed_predictions INTEGER NOT NULL,
  success_rate DECIMAL,
  ai_analysis TEXT NOT NULL,
  recommended_changes JSONB,
  applied BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for comprehensive market snapshots (nightly collection)
CREATE TABLE public.market_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  coin_id TEXT NOT NULL,
  coin_symbol TEXT NOT NULL,
  coin_name TEXT NOT NULL,
  current_price DECIMAL NOT NULL,
  market_cap BIGINT,
  volume_24h BIGINT,
  price_change_1h DECIMAL,
  price_change_24h DECIMAL,
  price_change_7d DECIMAL,
  price_change_30d DECIMAL,
  high_24h DECIMAL,
  low_24h DECIMAL,
  ath DECIMAL,
  ath_date TIMESTAMP WITH TIME ZONE,
  market_cap_rank INTEGER,
  circulating_supply DECIMAL,
  total_supply DECIMAL,
  raw_data JSONB
);

-- Create index for efficient queries
CREATE INDEX idx_predictions_coin_date ON public.trade_predictions(coin_id, predicted_at DESC);
CREATE INDEX idx_predictions_outcome ON public.trade_predictions(was_successful, predicted_at DESC);
CREATE INDEX idx_snapshots_coin_date ON public.market_snapshots(coin_id, collected_at DESC);
CREATE INDEX idx_snapshots_collected ON public.market_snapshots(collected_at DESC);

-- Enable RLS (public read, system write)
ALTER TABLE public.trade_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_improvements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read trade_predictions" ON public.trade_predictions FOR SELECT USING (true);
CREATE POLICY "Allow public read strategy_improvements" ON public.strategy_improvements FOR SELECT USING (true);
CREATE POLICY "Allow public read market_snapshots" ON public.market_snapshots FOR SELECT USING (true);