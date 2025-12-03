import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry fetch with exponential backoff
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });
      
      if (response.ok) {
        return response;
      }
      
      if (response.status === 429 || response.status >= 500) {
        const waitTime = Math.pow(2, i) * 1000;
        console.log(`API returned ${response.status}, retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      throw new Error(`API error: ${response.status}`);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const waitTime = Math.pow(2, i) * 1000;
      console.log(`Fetch failed, retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  throw new Error('Max retries exceeded');
}

// Calculate sentiment from market data
function calculateSentiment(marketCapChange: number, btcDominance: number, isFallback = false) {
  let score = 50;
  score += Math.max(-10, Math.min(10, marketCapChange * 2));
  
  if (btcDominance > 60) {
    score -= (btcDominance - 60) / 2;
  } else if (btcDominance < 40) {
    score += (40 - btcDominance) / 2;
  }
  
  score += (Math.random() * 10) - 5;
  score = Math.max(0, Math.min(100, score));

  let status = "neutral";
  let description = "";
  
  if (score < 25) {
    status = "extreme-fear";
    description = "Market showing extreme fear. This could present buying opportunities for long-term investors.";
  } else if (score < 45) {
    status = "fear";
    description = "Market sentiment is fearful. Investors are worried, but this may indicate a potential reversal point.";
  } else if (score < 55) {
    status = "neutral";
    description = "Market is in equilibrium. Sentiment is balanced between fear and greed.";
  } else if (score < 75) {
    status = "greed";
    description = "Market showing signs of greed. Investors are confident, but caution is advised.";
  } else {
    status = "extreme-greed";
    description = "Extreme greed detected. Consider taking profits and be prepared for potential corrections.";
  }

  return {
    score: Math.round(score),
    status,
    description,
    market_cap_change: marketCapChange,
    btc_dominance: btcDominance,
    timestamp: new Date().toISOString(),
    is_fallback: isFallback,
  };
}

// Fallback sentiment when API is unavailable
function getFallbackSentiment() {
  return calculateSentiment(0, 57.5, true);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Calculating market sentiment...");

    let sentiment;
    
    try {
      const response = await fetchWithRetry('https://api.coingecko.com/api/v3/global');
      const data = await response.json();
      const globalData = data.data;

      const marketCapChange = globalData.market_cap_change_percentage_24h_usd;
      const btcDominance = globalData.market_cap_percentage.btc;
      
      sentiment = calculateSentiment(marketCapChange, btcDominance);
      console.log("Market sentiment calculated:", sentiment);
    } catch (apiError) {
      console.warn("CoinGecko API unavailable, using fallback sentiment:", apiError);
      sentiment = getFallbackSentiment();
    }

    return new Response(JSON.stringify(sentiment), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in market-sentiment function:', error);
    return new Response(JSON.stringify(getFallbackSentiment()), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
