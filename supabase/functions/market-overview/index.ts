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
    console.log("Fetching global market data...");
    
    const response = await fetch(
      'https://api.coingecko.com/api/v3/global',
      {
        headers: { 'Accept': 'application/json' },
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    const globalData = data.data;

    const overview = {
      total_market_cap: globalData.total_market_cap.usd,
      total_volume: globalData.total_volume.usd,
      btc_dominance: globalData.market_cap_percentage.btc,
      eth_dominance: globalData.market_cap_percentage.eth,
      active_cryptocurrencies: globalData.active_cryptocurrencies,
      markets: globalData.markets,
      market_cap_change_24h: globalData.market_cap_change_percentage_24h_usd,
      // Calculate synthetic changes (in real app, you'd track historical data)
      volume_change_24h: Math.random() * 10 - 5, // Mock data
      btc_dominance_change: Math.random() * 2 - 1, // Mock data
    };

    console.log("Market overview generated successfully");

    return new Response(JSON.stringify(overview), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in market-overview function:', error);
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
