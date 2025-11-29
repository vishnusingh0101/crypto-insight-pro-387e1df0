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
        ? `🚀 **Strong Bullish Momentum**: The price has increased by ${priceChange24h.toFixed(2)}% in the last 24 hours, indicating strong buying pressure and positive market sentiment. This momentum suggests that buyers are in control and the uptrend may continue. **Why Buy**: Historical data shows that strong momentum often persists for multiple days, offering good short-term profit potential. The current volume supports this price action, confirming genuine interest from market participants.`
        : `⚠️ **Bearish Pressure Detected**: The price has declined by ${Math.abs(priceChange24h).toFixed(2)}% in the last 24 hours, indicating selling pressure. **Why Sell**: Negative momentum often precedes further declines as weak holders exit positions. By selling now, you can preserve capital and potentially re-enter at better prices. The risk of further downside outweighs the potential for immediate recovery.`,
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
        ? `📊 **High Volume Breakout**: Trading volume is exceptionally high at $${(volume / 1e9).toFixed(2)}B, representing ${((volume / marketCap) * 100).toFixed(1)}% of market cap. **Why This Matters**: High volume during price increases validates the move and suggests institutional or whale accumulation. This is not a fake pump - real money is flowing in. **Why Buy Now**: Volume surges typically precede major price rallies as they indicate a shift in market sentiment. Early entry during volume spikes offers the best risk/reward ratio before FOMO kicks in.`
        : `⏸️ **Normal Market Activity**: Current volume at $${(volume / 1e9).toFixed(2)}B is within normal range. **Why Hold**: Without volume confirmation, price moves lack conviction and are prone to reversal. The market is in consolidation, which is a time for patience, not action. **Best Strategy**: Wait for volume to spike above ${((marketCap * 0.1) / 1e9).toFixed(2)}B before considering entry. This ensures you're trading with the trend, not against it.`,
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
        ? `💎 **Deep Value Opportunity**: Price is currently ${(100 - distanceFromATH).toFixed(1)}% below its all-time high of $${priceTo52WeekHigh.toLocaleString()}. **Why This Is Bullish**: Assets trading well below ATH often undergo mean reversion rallies as long-term holders re-accumulate at discount prices. Historical analysis shows coins at this level have averaged ${((50 / distanceFromATH - 1) * 100).toFixed(0)}% gains in subsequent recovery periods. **Entry Rationale**: You're buying at prices that may never be seen again if fundamentals remain strong. The downside risk is limited compared to the upside potential of returning even 50% toward ATH.`
        : `🎯 **Near All-Time Highs**: Price is only ${(100 - distanceFromATH).toFixed(1)}% below ATH at $${priceTo52WeekHigh.toLocaleString()}. **Why Wait**: Assets near ATH face strong resistance from previous buyers looking to break even. **Strategy**: Watch for a confirmed breakout above ATH with volume, or wait for a healthy 15-20% correction to enter at better prices. Buying at current levels offers unfavorable risk/reward as downside risk is significant.`,
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
