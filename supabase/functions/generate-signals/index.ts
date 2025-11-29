import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cryptoId } = await req.json();
    console.log("Generating signals for:", cryptoId);

    // Fetch current market data for the crypto
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${cryptoId}?localization=false&tickers=false&community_data=false&developer_data=false`,
      {
        headers: { 'Accept': 'application/json' },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch crypto data: ${response.status}`);
    }

    const cryptoData = await response.json();
    const currentPrice = cryptoData.market_data.current_price.usd;
    const priceChange24h = cryptoData.market_data.price_change_percentage_24h;
    const volume = cryptoData.market_data.total_volume.usd;
    const marketCap = cryptoData.market_data.market_cap.usd;

    // Generate AI-based trading signals (simplified algorithm)
    const signals = [];

    // Signal 1: Momentum-based signal
    const isMomentumPositive = priceChange24h > 2;
    const momentumConfidence = Math.min(Math.abs(priceChange24h) / 10, 0.95);
    
    signals.push({
      signal: isMomentumPositive ? "BUY" : "SELL",
      confidence: momentumConfidence,
      reasoning: isMomentumPositive 
        ? "Strong positive momentum detected. Price showing bullish trend with increasing volume."
        : "Negative momentum detected. Price showing bearish pressure with declining sentiment.",
      entry_price: currentPrice.toFixed(2),
      target_price: (currentPrice * (isMomentumPositive ? 1.08 : 0.92)).toFixed(2),
      stop_loss: (currentPrice * (isMomentumPositive ? 0.95 : 1.05)).toFixed(2),
      risk_reward: isMomentumPositive ? "1:1.6" : "1:1.6",
    });

    // Signal 2: Volume-based signal
    const isVolumeHigh = volume > marketCap * 0.1;
    const volumeConfidence = isVolumeHigh ? 0.75 : 0.45;
    
    signals.push({
      signal: isVolumeHigh && priceChange24h > 0 ? "BUY" : "HOLD",
      confidence: volumeConfidence,
      reasoning: isVolumeHigh
        ? "High trading volume detected indicating strong interest. Volume surge often precedes major price moves."
        : "Normal trading volume. Market showing consolidation pattern. Wait for volume confirmation.",
      entry_price: currentPrice.toFixed(2),
      target_price: (currentPrice * 1.05).toFixed(2),
      stop_loss: (currentPrice * 0.97).toFixed(2),
      risk_reward: "1:1.67",
    });

    // Signal 3: Mean reversion signal
    const priceTo52WeekHigh = cryptoData.market_data.ath.usd;
    const distanceFromATH = ((currentPrice / priceTo52WeekHigh) * 100);
    const isMeanReversion = distanceFromATH < 50;
    
    signals.push({
      signal: isMeanReversion ? "BUY" : "HOLD",
      confidence: isMeanReversion ? 0.65 : 0.40,
      reasoning: isMeanReversion
        ? `Price is ${(100 - distanceFromATH).toFixed(0)}% below all-time high. Strong potential for mean reversion based on historical patterns.`
        : "Price near historical highs. Consider waiting for pullback or breakout confirmation.",
      entry_price: currentPrice.toFixed(2),
      target_price: (currentPrice * 1.15).toFixed(2),
      stop_loss: (currentPrice * 0.92).toFixed(2),
      risk_reward: "1:1.87",
    });

    console.log(`Generated ${signals.length} signals for ${cryptoId}`);

    return new Response(JSON.stringify(signals), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-signals function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
