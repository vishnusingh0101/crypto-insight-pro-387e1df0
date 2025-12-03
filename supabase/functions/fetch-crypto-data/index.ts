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
      
      throw new Error(`CoinGecko API error: ${response.status}`);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const waitTime = Math.pow(2, i) * 1000;
      console.log(`Fetch failed, retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  throw new Error('Max retries exceeded');
}

// Fallback data with major cryptocurrencies
function getFallbackData() {
  const now = new Date().toISOString();
  return [
    { id: "bitcoin", symbol: "btc", name: "Bitcoin", image: "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png", current_price: 92000, market_cap: 1800000000000, market_cap_rank: 1, price_change_percentage_24h: 0, total_volume: 80000000000, last_updated: now },
    { id: "ethereum", symbol: "eth", name: "Ethereum", image: "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png", current_price: 3000, market_cap: 360000000000, market_cap_rank: 2, price_change_percentage_24h: 0, total_volume: 25000000000, last_updated: now },
    { id: "tether", symbol: "usdt", name: "Tether", image: "https://coin-images.coingecko.com/coins/images/325/large/Tether.png", current_price: 1, market_cap: 180000000000, market_cap_rank: 3, price_change_percentage_24h: 0, total_volume: 100000000000, last_updated: now },
    { id: "ripple", symbol: "xrp", name: "XRP", image: "https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png", current_price: 2.1, market_cap: 120000000000, market_cap_rank: 4, price_change_percentage_24h: 0, total_volume: 4000000000, last_updated: now },
    { id: "binancecoin", symbol: "bnb", name: "BNB", image: "https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png", current_price: 880, market_cap: 120000000000, market_cap_rank: 5, price_change_percentage_24h: 0, total_volume: 2000000000, last_updated: now },
    { id: "solana", symbol: "sol", name: "Solana", image: "https://coin-images.coingecko.com/coins/images/4128/large/solana.png", current_price: 138, market_cap: 77000000000, market_cap_rank: 6, price_change_percentage_24h: 0, total_volume: 7000000000, last_updated: now },
    { id: "usd-coin", symbol: "usdc", name: "USDC", image: "https://coin-images.coingecko.com/coins/images/6319/large/usdc.png", current_price: 1, market_cap: 77000000000, market_cap_rank: 7, price_change_percentage_24h: 0, total_volume: 10000000000, last_updated: now },
    { id: "cardano", symbol: "ada", name: "Cardano", image: "https://coin-images.coingecko.com/coins/images/975/large/cardano.png", current_price: 0.43, market_cap: 16000000000, market_cap_rank: 11, price_change_percentage_24h: 0, total_volume: 800000000, last_updated: now },
    { id: "dogecoin", symbol: "doge", name: "Dogecoin", image: "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png", current_price: 0.14, market_cap: 22000000000, market_cap_rank: 10, price_change_percentage_24h: 0, total_volume: 1400000000, last_updated: now },
    { id: "tron", symbol: "trx", name: "TRON", image: "https://coin-images.coingecko.com/coins/images/1094/large/tron-logo.png", current_price: 0.28, market_cap: 26000000000, market_cap_rank: 8, price_change_percentage_24h: 0, total_volume: 650000000, last_updated: now },
  ];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Fetching crypto data from CoinGecko...");
    
    let data;
    
    try {
      const response = await fetchWithRetry(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h'
      );
      data = await response.json();
      console.log(`Successfully fetched ${data.length} cryptocurrencies`);
    } catch (apiError) {
      console.warn("CoinGecko API unavailable, using fallback data:", apiError);
      data = getFallbackData();
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in fetch-crypto-data function:', error);
    return new Response(JSON.stringify(getFallbackData()), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
