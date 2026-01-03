-- Add trading state columns to system_performance for automated trading logic
ALTER TABLE public.system_performance 
ADD COLUMN IF NOT EXISTS current_state TEXT NOT NULL DEFAULT 'WAITING' CHECK (current_state IN ('WAITING', 'ACTIVE_TRADE', 'COOLDOWN', 'CAPITAL_PROTECTION')),
ADD COLUMN IF NOT EXISTS active_trade_id UUID REFERENCES public.trade_history(id),
ADD COLUMN IF NOT EXISTS last_trade_closed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS cooldown_ends_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_scan_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN IF NOT EXISTS last_whale_event_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_trade_entry_price NUMERIC,
ADD COLUMN IF NOT EXISTS last_trade_exit_price NUMERIC;

-- Add monitoring timestamp to trade_history
ALTER TABLE public.trade_history
ADD COLUMN IF NOT EXISTS last_monitored_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Update existing record with defaults
UPDATE public.system_performance 
SET current_state = 'WAITING', 
    last_scan_at = now() 
WHERE current_state IS NULL;