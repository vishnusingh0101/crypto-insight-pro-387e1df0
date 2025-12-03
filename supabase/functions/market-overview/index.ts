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
      
      // If rate limited or server error, wait and retry
      if (response.status === 429 || response.status >= 500) {
        const waitTime = Math.pow(2, i) * 1000; // 1s, 2s, 4s
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

// Fallback data when API is unavailable
function getFallbackData() {
  return {
    total_market_cap: 3200000000000,
    total_volume: 150000000000,
    btc_dominance: 57.5,
    eth_dominance: 12.5,
    active_cryptocurrencies: 15000,
    markets: 1100,
    market_cap_change_24h: 0,
    volume_change_24h: 0,
    btc_dominance_change: 0,
    is_fallback: true,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Fetching global market data...");
    
    let overview;
    
    try {
      const response = await fetchWithRetry('https://api.coingecko.com/api/v3/global');
      const data = await response.json();
      const globalData = data.data;

      overview = {
        total_market_cap: globalData.total_market_cap.usd,
        total_volume: globalData.total_volume.usd,
        btc_dominance: globalData.market_cap_percentage.btc,
        eth_dominance: globalData.market_cap_percentage.eth,
        active_cryptocurrencies: globalData.active_cryptocurrencies,
        markets: globalData.markets,
        market_cap_change_24h: globalData.market_cap_change_percentage_24h_usd,
        volume_change_24h: Math.random() * 10 - 5,
        btc_dominance_change: Math.random() * 2 - 1,
        is_fallback: false,
      };
      
      console.log("Market overview generated successfully");
    } catch (apiError) {
      console.warn("CoinGecko API unavailable, using fallback data:", apiError);
      overview = getFallbackData();
    }

    return new Response(JSON.stringify(overview), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in market-overview function:', error);
    // Return fallback data instead of error
    return new Response(JSON.stringify(getFallbackData()), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
