import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CoinGecko free API: ~10-30 calls/min, we'll do 4-5 safely
const CALLS_PER_MINUTE = 4;
const DELAY_BETWEEN_CALLS = Math.ceil(60000 / CALLS_PER_MINUTE); // ~15 seconds
const COLLECTION_DURATION_MINUTES = 25;
const COINS_PER_PAGE = 50;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<any | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });
      
      if (response.ok) {
        return await response.json();
      }
      
      if (response.status === 429) {
        console.log(`Rate limited, waiting ${(i + 1) * 30}s...`);
        await sleep((i + 1) * 30000);
        continue;
      }
      
      if (response.status >= 500) {
        console.log(`Server error ${response.status}, retrying...`);
        await sleep(5000);
        continue;
      }
      
      console.error(`API error: ${response.status}`);
      return null;
    } catch (error) {
      console.error(`Fetch error:`, error);
      if (i === maxRetries - 1) return null;
      await sleep(5000);
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const endTime = startTime + (COLLECTION_DURATION_MINUTES * 60 * 1000);
  
  console.log(`Starting nightly data collection for ${COLLECTION_DURATION_MINUTES} minutes...`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let totalCoinsCollected = 0;
    let currentPage = 1;
    let apiCallCount = 0;

    // Collect data in rounds, respecting rate limits
    while (Date.now() < endTime) {
      const roundStart = Date.now();
      
      // Fetch market data (page of coins)
      const marketsUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${COINS_PER_PAGE}&page=${currentPage}&sparkline=false&price_change_percentage=1h,24h,7d,30d`;
      
      console.log(`Fetching page ${currentPage}...`);
      const marketData = await fetchWithRetry(marketsUrl);
      apiCallCount++;
      
      if (marketData && Array.isArray(marketData) && marketData.length > 0) {
        const collectedAt = new Date().toISOString();
        
        const snapshots = marketData.map((coin: any) => ({
          collected_at: collectedAt,
          coin_id: coin.id,
          coin_symbol: coin.symbol?.toUpperCase() || '',
          coin_name: coin.name || '',
          current_price: coin.current_price || 0,
          market_cap: coin.market_cap || 0,
          volume_24h: coin.total_volume || 0,
          price_change_1h: coin.price_change_percentage_1h_in_currency || 0,
          price_change_24h: coin.price_change_percentage_24h || 0,
          price_change_7d: coin.price_change_percentage_7d_in_currency || 0,
          price_change_30d: coin.price_change_percentage_30d_in_currency || 0,
          high_24h: coin.high_24h || 0,
          low_24h: coin.low_24h || 0,
          ath: coin.ath || 0,
          ath_date: coin.ath_date || null,
          market_cap_rank: coin.market_cap_rank || 999,
          circulating_supply: coin.circulating_supply || 0,
          total_supply: coin.total_supply || 0,
          raw_data: coin,
        }));

        const { error: insertError } = await supabase
          .from('market_snapshots')
          .insert(snapshots);

        if (insertError) {
          console.error(`Insert error:`, insertError);
        } else {
          totalCoinsCollected += snapshots.length;
          console.log(`Stored ${snapshots.length} coins from page ${currentPage}. Total: ${totalCoinsCollected}`);
        }

        // Move to next page if we got full results
        if (marketData.length === COINS_PER_PAGE) {
          currentPage++;
        } else {
          // Reset to page 1 for next round of collection
          currentPage = 1;
        }
      } else {
        console.log(`No data for page ${currentPage}, resetting to page 1`);
        currentPage = 1;
      }

      // Wait to respect rate limits (~15 seconds between calls)
      const elapsed = Date.now() - roundStart;
      const waitTime = Math.max(0, DELAY_BETWEEN_CALLS - elapsed);
      
      if (Date.now() + waitTime < endTime) {
        console.log(`Waiting ${Math.round(waitTime / 1000)}s before next call... (${apiCallCount} calls made)`);
        await sleep(waitTime);
      }
    }

    const durationMinutes = Math.round((Date.now() - startTime) / 60000);
    console.log(`Nightly collection complete. Duration: ${durationMinutes}min, Coins collected: ${totalCoinsCollected}, API calls: ${apiCallCount}`);

    // Also update the market-cache storage for best-trade function
    const latestMarkets = await fetchWithRetry(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=1h,24h,7d,30d'
    );

    if (latestMarkets) {
      const enrichedCoins = latestMarkets.slice(0, 10).map((coin: any) => {
        const price = coin.current_price || 0;
        const high = coin.high_24h || price;
        const low = coin.low_24h || price;
        const atr14 = price > 0 ? ((high - low) / price) * 100 : 5;
        const volumeToMcap = coin.market_cap ? coin.total_volume / coin.market_cap : 0.05;

        return {
          id: coin.id,
          symbol: coin.symbol,
          name: coin.name,
          image: coin.image,
          currentPrice: price,
          marketCap: coin.market_cap || 0,
          volume24h: coin.total_volume || 0,
          marketCapRank: coin.market_cap_rank || 999,
          high24h: high,
          low24h: low,
          change1h: coin.price_change_percentage_1h_in_currency || 0,
          change24h: coin.price_change_percentage_24h || 0,
          change7d: coin.price_change_percentage_7d_in_currency || 0,
          change30d: coin.price_change_percentage_30d_in_currency || 0,
          rsi14: 50 + (coin.price_change_percentage_24h || 0) / 2,
          atr14,
          volatilityScore: Math.min(atr14 / 10, 1),
          liquidityScore: Math.min(volumeToMcap * 5, 1),
          volumeToMcap,
        };
      });

      const payload = {
        updatedAt: new Date().toISOString(),
        source: 'nightly-collector',
        coins: enrichedCoins,
      };

      await supabase.storage
        .from('market-cache')
        .upload('daily/full_market.json', JSON.stringify(payload), {
          contentType: 'application/json',
          upsert: true,
        });

      console.log('Updated market-cache storage');
    }

    return new Response(JSON.stringify({
      success: true,
      duration_minutes: durationMinutes,
      coins_collected: totalCoinsCollected,
      api_calls: apiCallCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in nightly-data-collector:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
