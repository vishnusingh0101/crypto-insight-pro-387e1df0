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

const COINGECKO_CHART_URL = (id: string) =>
  `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=7&interval=hourly`;

const REQUEST_INTERVAL_MS = 4000;
const MAX_RETRIES = 2;

const BUCKET_NAME = "market-cache";
const FILE_PATH = "daily/full_market.json";

const STABLECOIN_SYMBOLS = new Set([
  "usdt", "usdc", "busd", "dai", "tusd", "usdp", "usdd", "gusd", "lusd",
]);

type MarketsCoin = {
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
};

type MarketChart = {
  prices: [number, number][];
};

type EnrichedCoin = {
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
};

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

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
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (res.status === 429) {
        const delay = (attempt + 1) * 5000;
        console.warn(`${label}: 429 Too Many Requests, retrying in ${delay}ms`);
        await sleep(delay);
        continue;
      }

      if (!res.ok) {
        throw new Error(`${label}: HTTP ${res.status}`);
      }

      return await res.json();
    } catch (err) {
      console.error(`${label} attempt ${attempt + 1} failed:`, err);
      if (attempt === MAX_RETRIES) throw err;
      await sleep((attempt + 1) * 3000);
    }
  }

  throw new Error(`${label}: failed after retries`);
}

function computeRsi(prices: number[], period = 14): number {
  if (prices.length <= period) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeAtr(closes: number[], period = 14): number {
  if (closes.length <= period) return 0;

  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.abs(closes[i] - closes[i - 1]));
  }

  if (trs.length < period) return 0;

  let atr = trs.slice(0, period).reduce((sum, v) => sum + v, 0) / period;

  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }

  return atr;
}

serve(async (req) => {
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

    const enriched: EnrichedCoin[] = [];

    for (let i = 0; i < filtered.length; i++) {
      const coin = filtered[i];
      console.log(`Processing coin ${i + 1}/${filtered.length}: ${coin.id}`);

      const chartJson = (await safeFetchJson(
        COINGECKO_CHART_URL(coin.id),
        `chart:${coin.id}`,
      )) as MarketChart;

      const closes = chartJson.prices.map(([, price]) => price);
      const closesTail = closes.length > 100 ? closes.slice(-100) : closes;

      const rsi = computeRsi(closesTail, 14);
      const atrAbs = computeAtr(closesTail, 14);

      const currentPrice = n(coin.current_price);
      const atrPct = currentPrice > 0 ? (atrAbs / currentPrice) * 100 : 0;

      let volatilityScore = 0;
      if (atrPct >= 3 && atrPct <= 15) volatilityScore = 10;
      else if (atrPct >= 1.5 && atrPct < 3) volatilityScore = 6;
      else if (atrPct > 15) volatilityScore = 4;

      const mcap = n(coin.market_cap);
      const vol = n(coin.total_volume);
      const volumeToMcap = mcap > 0 ? vol / mcap : 0;
      let liquidityScore = 0;
      if (vol >= 200_000_000) liquidityScore += 10;
      else if (vol >= 50_000_000) liquidityScore += 7;
      else if (vol >= 10_000_000) liquidityScore += 5;

      if (volumeToMcap > 0.10) liquidityScore += 4;
      else if (volumeToMcap > 0.05) liquidityScore += 2;

      enriched.push({
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        image: coin.image,
        currentPrice,
        marketCap: mcap,
        volume24h: vol,
        marketCapRank: coin.market_cap_rank ?? 9999,
        high24h: n(coin.high_24h),
        low24h: n(coin.low_24h),
        change1h: n(coin.price_change_percentage_1h_in_currency),
        change24h: n(coin.price_change_percentage_24h_in_currency),
        change7d: n(coin.price_change_percentage_7d_in_currency),
        change30d: n(coin.price_change_percentage_30d_in_currency),
        rsi14: Number(rsi.toFixed(2)),
        atr14: Number(atrPct.toFixed(3)),
        volatilityScore,
        liquidityScore,
        volumeToMcap: Number(volumeToMcap.toFixed(4)),
      });

      if (i < filtered.length - 1) {
        await sleep(REQUEST_INTERVAL_MS);
      }
    }

    const payload = {
      updatedAt: new Date().toISOString(),
      source: "coingecko",
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