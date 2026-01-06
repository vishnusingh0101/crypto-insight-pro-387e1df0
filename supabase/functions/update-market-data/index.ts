import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const COINGECKO_MARKETS_URL =
  "https://api.coingecko.com/api/v3/coins/markets" +
  "?vs_currency=usd" +
  "&order=market_cap_desc" +
  "&per_page=50" +
  "&page=1" +
  "&sparkline=false" +
  "&price_change_percentage=1h,24h,7d,30d";

const BUCKET_NAME = "market-cache";
const FILE_PATH = "daily/full_market.json";

const STABLECOIN_SYMBOLS = new Set([
  "usdt",
  "usdc",
  "busd",
  "dai",
  "tusd",
  "usdp",
  "usdd",
  "gusd",
  "lusd",
]);

const MAX_COINS = 10; // keep runtime well under edge function limits

// Small helper for resilient numeric handling
function n(value: number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  if (Number.isNaN(value)) return fallback;
  return value;
}

function isStablecoin(symbol: string | null | undefined): boolean {
  if (!symbol) return false;
  return STABLECOIN_SYMBOLS.has(symbol.toLowerCase());
}

async function safeFetchJson(url: string, label: string): Promise<any> {
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (res.status === 429) {
        const delay = (attempt + 1) * 5000;
        console.warn(`${label}: 429 Too Many Requests, retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!res.ok) {
        throw new Error(`${label}: HTTP ${res.status}`);
      }

      return await res.json();
    } catch (err) {
      console.error(`${label} attempt ${attempt + 1} failed:`, err);
      if (attempt === MAX_RETRIES) throw err;
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 3000));
    }
  }

  throw new Error(`${label}: failed after retries`);
}

// Shape returned by CoinGecko markets endpoint
interface MarketsCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number | null;
  market_cap: number | null;
  total_volume: number | null;
  market_cap_rank: number | null;
  high_24h: number | null;
  low_24h: number | null;
  price_change_percentage_1h_in_currency?: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
}

// Enriched shape stored in JSON cache and consumed by best-trade
interface EnrichedCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  currentPrice: number;
  marketCap: number;
  volume24h: number;
  marketCapRank: number;
  high24h: number;
  low24h: number;
  change1h: number;
  change24h: number;
  change7d: number;
  change30d: number;
  rsi14: number;
  atr14: number;
  volatilityScore: number;
  liquidityScore: number;
  volumeToMcap: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' } });
  }

  // API Key authentication - this function writes to storage bucket
  const apiKey = req.headers.get('x-api-key');
  const internalApiKey = Deno.env.get('INTERNAL_API_KEY');
  if (!internalApiKey || apiKey !== internalApiKey) {
    console.error('Unauthorized access attempt to update-market-data');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  try {
    console.log("update-market-data: starting run");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const marketsData = (await safeFetchJson(
      COINGECKO_MARKETS_URL,
      "markets",
    )) as MarketsCoin[];

    const filtered = marketsData.filter((coin) => {
      if (isStablecoin(coin.symbol)) return false;

      const mcap = n(coin.market_cap);
      const vol = n(coin.total_volume);
      const rank = coin.market_cap_rank ?? 9999;

      if (mcap < 200_000_000) return false;
      if (vol < 5_000_000) return false;
      if (rank > 500) return false;

      return true;
    });

    console.log(
      `update-market-data: fetched ${marketsData.length} coins, ${filtered.length} after filter`,
    );

    const toProcess = filtered.slice(0, MAX_COINS);
    const enriched: EnrichedCoin[] = [];

    for (let i = 0; i < toProcess.length; i++) {
      const coin = toProcess[i];
      console.log(
        `update-market-data: processing coin ${i + 1}/${toProcess.length}: ${coin.id}`,
      );

      const currentPrice = n(coin.current_price);
      const mcap = n(coin.market_cap);
      const vol = n(coin.total_volume);
      const high = n(coin.high_24h);
      const low = n(coin.low_24h);

      const change1h = n(coin.price_change_percentage_1h_in_currency);
      const change24 = n(coin.price_change_percentage_24h_in_currency);
      const change7d = n(coin.price_change_percentage_7d_in_currency);
      const change30d = n(coin.price_change_percentage_30d_in_currency);

      const volumeToMcap = mcap > 0 ? vol / mcap : 0;

      // Liquidity score from absolute and relative volume
      let liquidityScore = 0;
      if (vol >= 200_000_000) liquidityScore += 10;
      else if (vol >= 50_000_000) liquidityScore += 7;
      else if (vol >= 10_000_000) liquidityScore += 5;

      if (volumeToMcap > 0.1) liquidityScore += 4;
      else if (volumeToMcap > 0.05) liquidityScore += 2;

      // Approximate ATR-style volatility from 24h range or daily % change
      let atrPct = 0;
      if (currentPrice > 0 && high > 0 && low > 0 && high > low) {
        const range = high - low;
        atrPct = (range / currentPrice) * 50; // heuristic scale to ~volatility band
      } else {
        atrPct = Math.abs(change24);
      }

      let volatilityScore = 0;
      if (atrPct >= 3 && atrPct <= 15) volatilityScore = 10;
      else if (atrPct >= 1.5 && atrPct < 3) volatilityScore = 6;
      else if (atrPct > 15) volatilityScore = 4;

      // Heuristic RSI-like momentum score from multi-timeframe % changes
      let rsi = 50;
      const momentum = change24 * 0.5 + change7d * 0.3 + change30d * 0.2;
      if (!Number.isNaN(momentum)) {
        const clamped = Math.max(-25, Math.min(25, momentum));
        // Map roughly [-25, 25] -> [10, 90]
        rsi = 50 + (clamped / 50) * 40;
      }

      enriched.push({
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        image: coin.image,
        currentPrice,
        marketCap: mcap,
        volume24h: vol,
        marketCapRank: coin.market_cap_rank ?? 9999,
        high24h: high,
        low24h: low,
        change1h,
        change24h: change24,
        change7d,
        change30d,
        rsi14: Number(rsi.toFixed(2)),
        atr14: Number(atrPct.toFixed(3)),
        volatilityScore,
        liquidityScore,
        volumeToMcap: Number(volumeToMcap.toFixed(4)),
      });
    }

    const payload = {
      updatedAt: new Date().toISOString(),
      source: "coingecko-markets",
      coins: enriched,
    };

    const jsonString = JSON.stringify(payload);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(FILE_PATH, new Blob([jsonString], { type: "application/json" }), {
        upsert: true,
      });

    if (uploadError) {
      console.error("update-market-data: upload error", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload JSON" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(
      `update-market-data: stored ${enriched.length} coins in ${BUCKET_NAME}/${FILE_PATH}`,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        coinsStored: enriched.length,
        path: `${BUCKET_NAME}/${FILE_PATH}`,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("update-market-data: fatal error", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
