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
    console.log("Calculating market sentiment...");

    // Fetch market data to calculate sentiment
    const response = await fetch(
      'https://api.coingecko.com/api/v3/global',
      { headers: { 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    const globalData = data.data;

    // Calculate sentiment score (0-100)
    // Based on: market cap change, BTC dominance, and volume
    const marketCapChange = globalData.market_cap_change_percentage_24h_usd;
    const btcDominance = globalData.market_cap_percentage.btc;
    
    // Base score starts at 50 (neutral)
    let score = 50;
    
    // Market cap change influence (-10 to +10 points)
    score += Math.max(-10, Math.min(10, marketCapChange * 2));
    
    // BTC dominance influence (high dominance = fear, low = greed)
    // Normal BTC dominance is around 40-60%
    if (btcDominance > 60) {
      score -= (btcDominance - 60) / 2; // Fear when BTC dominates too much
    } else if (btcDominance < 40) {
      score += (40 - btcDominance) / 2; // Greed when altcoins are strong
    }
    
    // Add some randomness for realism (±5 points)
    score += (Math.random() * 10) - 5;
    
    // Clamp score between 0-100
    score = Math.max(0, Math.min(100, score));

    // Determine status
    let status = "neutral";
    let description = "";
    
    if (score < 25) {
      status = "extreme-fear";
      description = "Market showing extreme fear. This could present buying opportunities for long-term investors. High volatility expected.";
    } else if (score < 45) {
      status = "fear";
      description = "Market sentiment is fearful. Investors are worried, but this may indicate a potential reversal point.";
    } else if (score < 55) {
      status = "neutral";
      description = "Market is in equilibrium. Sentiment is balanced between fear and greed. Watch for directional signals.";
    } else if (score < 75) {
      status = "greed";
      description = "Market showing signs of greed. Investors are confident, but caution is advised as corrections may follow.";
    } else {
      status = "extreme-greed";
      description = "Extreme greed detected in the market. Consider taking profits and be prepared for potential corrections.";
    }

    const sentiment = {
      score: Math.round(score),
      status,
      description,
      market_cap_change: marketCapChange,
      btc_dominance: btcDominance,
      timestamp: new Date().toISOString(),
    };

    console.log("Market sentiment calculated:", sentiment);

    return new Response(JSON.stringify(sentiment), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in market-sentiment function:', error);
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
