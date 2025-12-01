import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET_NAME = "market-cache";
const FILE_PATH = "daily/full_market.json";

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

type StoredPayload = {
  updatedAt: string;
  source: string;
  coins: EnrichedCoin[];
};

type TradeAction = "BUY" | "SELL";

type BestTrade = {
  coinId: string;
  coinName: string;
  coinSymbol: string;
  coinImage: string;
  action: TradeAction;
  currentPrice: number;
  buyPrice: number;
  targetPrice: number;
  stopLoss: number;
  successProbability: number;
  riskReward: number;
  rsi14: number;
  atr14: number;
  priceChange1h: number;
  priceChange24h: number;
  priceChange7d: number;
  priceChange30d: number;
  volume24h: number;
  marketCap: number;
  marketCapRank: number;
  volumeToMcap: number;
  reasoning: string;
  updatedAt: string;
};

function scoreCoin(coin: EnrichedCoin): number {
  let score = 0;

  const p1h = coin.change1h;
  const p24 = coin.change24h;
  const p7d = coin.change7d;
  const p30d = coin.change30d;
  const rsi = coin.rsi14;
  const atr = coin.atr14;

  if (coin.volume24h >= 200_000_000) score += 14;
  else if (coin.volume24h >= 50_000_000) score += 10;
  else if (coin.volume24h >= 10_000_000) score += 6;

  if (coin.marketCapRank <= 10) score += 11;
  else if (coin.marketCapRank <= 30) score += 8;
  else if (coin.marketCapRank <= 100) score += 5;
  else score += 2;

  if (p30d > 20 && p7d > 10) score += 18;
  else if (p30d > 8 && p7d > 5) score += 13;
  else if (p7d > 2) score += 8;

  if (p24 > 4) score += 7;
  else if (p24 > 1.5) score += 5;
  else if (p24 > 0) score += 3;
  else if (p24 < 0 && p7d > 10) score += 4;

  if (p1h > 0.5 && p1h < 5) score += 7;
  else if (p1h > -1 && p1h <= 0.5 && p24 > 2) score += 4;

  if (rsi >= 45 && rsi <= 65) score += 12;
  else if (rsi > 65 && rsi < 75) score += 7;
  else if (rsi > 75) score -= 6;
  else if (rsi < 30) score += 4;

  if (atr >= 3 && atr <= 12) score += 8;
  else if (atr >= 1.5 && atr < 3) score += 5;
  else if (atr > 18) score -= 5;

  if (coin.volumeToMcap > 0.12 && coin.volumeToMcap <= 0.5) score += 7;
  else if (coin.volumeToMcap > 0.06) score += 5;
  else if (coin.volumeToMcap < 0.015) score -= 3;

  return score;
}

function decideAction(coin: EnrichedCoin): TradeAction {
  const { change24h: p24, change7d: p7d, change30d: p30d, rsi14: rsi } = coin;

  const strongUp = p7d > 5 && p30d > 8;
  const shortBias = p7d < -8 && p30d < -15 && p24 < -3;

  if (strongUp && rsi < 72) return "BUY";
  if (shortBias && rsi > 35) return "SELL";

  if (p24 < -4 && p7d < -5) return "SELL";
  return "BUY";
}

function normalizeProbability(score: number): number {
  const minP = 32;
  const maxP = 92;
  const minScore = 20;
  const maxScore = 100;

  const clamped = Math.max(minScore, Math.min(maxScore, score));
  const ratio = (clamped - minScore) / (maxScore - minScore);
  const prob = minP + ratio * (maxP - minP);

  return Math.round(prob);
}

function calculateRiskReward(
  action: TradeAction,
  entry: number,
  target: number,
  stop: number,
): number {
  if (entry <= 0 || target <= 0 || stop <= 0) return 0;

  let reward: number;
  let risk: number;

  if (action === "BUY") {
    reward = target - entry;
    risk = entry - stop;
  } else {
    reward = entry - target;
    risk = stop - entry;
  }

  if (risk <= 0) return 0;
  return Math.abs(reward / risk);
}

function buildReasoning(coin: EnrichedCoin, trade: BestTrade): string {
  const reasons: string[] = [];

  const { change24h: p24, change7d: p7d, change30d: p30d, rsi14: rsi, atr14: atr } = coin;

  if (trade.action === "BUY") {
    if (p30d > 0 && p7d > 0) {
      reasons.push(
        `multi-timeframe uptrend (+${p7d.toFixed(1)}% weekly, +${p30d.toFixed(1)}% 30d)`,
      );
    }
    if (p24 > 0) {
      reasons.push(`bullish daily momentum (+${p24.toFixed(1)}% 24h)`);
    }
    if (rsi >= 45 && rsi <= 65) {
      reasons.push(`healthy RSI (${rsi.toFixed(1)}), trend continuation zone`);
    } else if (rsi < 30) {
      reasons.push(`RSI oversold (${rsi.toFixed(1)}), bounce potential`);
    }
    if (atr >= 3 && atr <= 12) {
      reasons.push(`tradable volatility (ATR ~${atr.toFixed(1)}% of price)`);
    }
    if (coin.volumeToMcap > 0.08) {
      reasons.push("strong liquidity and participation (high volume-to-mcap)");
    }
    if (coin.marketCapRank <= 30) {
      reasons.push(`large-cap safety (top ${coin.marketCapRank} by market cap)`);
    }
  } else {
    if (p7d < 0) {
      reasons.push(`weekly downtrend (${p7d.toFixed(1)}%)`);
    }
    if (p24 < 0) {
      reasons.push(`bearish daily move (${p24.toFixed(1)}% 24h)`);
    }
    if (rsi > 70) {
      reasons.push(`overbought RSI (${rsi.toFixed(1)})`);
    }
    reasons.push("short / defensive setup highlighted");
  }

  const base = `${coin.name} surfaced as today's strongest risk-adjusted trading candidate with an estimated ${trade.successProbability}% modeled success probability.`;
  const details = reasons.length
    ? ` ${trade.action} signal rationale: ${reasons.join(", ")}.`
    : "";
  const caution =
    " This is a quantitative screen based on cached market data (liquidity, momentum, RSI, ATR and volatility). Always combine with your own analysis and risk management.";

  return base + details + caution;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(FILE_PATH);

    if (error || !data) {
      console.error("best-trade: download error", error);
      return new Response(
        JSON.stringify({ error: "Failed to load cached market data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const text = await data.text();
    const payload = JSON.parse(text) as StoredPayload;
    const coins = payload.coins ?? [];

    if (!coins.length) {
      return new Response(
        JSON.stringify({ error: "No coins in cached data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let best: EnrichedCoin | null = null;
    let bestScore = -Infinity;

    for (const coin of coins) {
      if (coin.currentPrice <= 0) continue;
      const score = scoreCoin(coin);
      if (score > bestScore) {
        bestScore = score;
        best = coin;
      }
    }

    if (!best) {
      return new Response(
        JSON.stringify({ error: "Unable to determine best trade" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const action = decideAction(best);
    const successProbability = normalizeProbability(bestScore);

    const price = best.currentPrice;

    const atr = best.atr14;
    const atrFactor = Math.min(Math.max(atr, 2), 15) / 100;
    const trendBoost = Math.max(0, best.change7d) * 0.002;
    const targetFactorRaw = 1 + atrFactor + trendBoost;
    const targetFactor = Math.min(Math.max(targetFactorRaw, 1.04), 1.25);

    const stopFactorRaw = 1 - Math.max(atrFactor * 0.7, 0.03);
    const stopFactor = Math.max(stopFactorRaw, 0.88);

    let buyPrice = price;
    let targetPrice: number;
    let stopLoss: number;

    if (action === "BUY") {
      targetPrice = price * targetFactor;
      stopLoss = price * stopFactor;
    } else {
      const shortTargetFactor = 1 - (targetFactor - 1);
      const shortStopFactor = 2 - stopFactor;
      targetPrice = price * shortTargetFactor;
      stopLoss = price * shortStopFactor;
    }

    const rr = calculateRiskReward(action, buyPrice, targetPrice, stopLoss);

    const trade: BestTrade = {
      coinId: best.id,
      coinName: best.name,
      coinSymbol: best.symbol.toUpperCase(),
      coinImage: best.image,
      action,
      currentPrice: price,
      buyPrice,
      targetPrice,
      stopLoss,
      successProbability,
      riskReward: Number(rr.toFixed(2)),
      rsi14: best.rsi14,
      atr14: best.atr14,
      priceChange1h: best.change1h,
      priceChange24h: best.change24h,
      priceChange7d: best.change7d,
      priceChange30d: best.change30d,
      volume24h: best.volume24h,
      marketCap: best.marketCap,
      marketCapRank: best.marketCapRank,
      volumeToMcap: best.volumeToMcap,
      reasoning: "",
      updatedAt: payload.updatedAt,
    };

    trade.reasoning = buildReasoning(best, trade);

    return new Response(JSON.stringify(trade), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("best-trade: fatal error", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});