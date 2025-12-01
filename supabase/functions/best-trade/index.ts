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

type TradeOpportunity = {
  coin: EnrichedCoin;
  action: TradeAction;
  score: number;
};

function scoreBuyOpportunity(coin: EnrichedCoin): number {
  let score = 0;

  const p1h = coin.change1h;
  const p24 = coin.change24h;
  const p7d = coin.change7d;
  const p30d = coin.change30d;
  const rsi = coin.rsi14;
  const atr = coin.atr14;

  // Liquidity scoring
  if (coin.volume24h >= 200_000_000) score += 14;
  else if (coin.volume24h >= 50_000_000) score += 10;
  else if (coin.volume24h >= 10_000_000) score += 6;

  // Market cap rank (safety)
  if (coin.marketCapRank <= 10) score += 11;
  else if (coin.marketCapRank <= 30) score += 8;
  else if (coin.marketCapRank <= 100) score += 5;
  else score += 2;

  // Multi-timeframe bullish momentum
  if (p30d > 20 && p7d > 10) score += 20;
  else if (p30d > 8 && p7d > 5) score += 15;
  else if (p7d > 2) score += 10;
  else if (p7d < -5) score -= 12; // Penalize downtrends

  // Daily momentum
  if (p24 > 5) score += 10;
  else if (p24 > 2) score += 7;
  else if (p24 > 0) score += 4;
  else if (p24 < -3) score -= 8;

  // Hourly momentum
  if (p1h > 1 && p1h < 6) score += 8;
  else if (p1h > 0.3 && p1h <= 1) score += 5;
  else if (p1h < -2) score -= 5;

  // RSI for BUY (looking for healthy or oversold)
  if (rsi >= 40 && rsi <= 60) score += 15; // Healthy continuation zone
  else if (rsi > 60 && rsi <= 70) score += 8; // Still acceptable
  else if (rsi < 30) score += 12; // Oversold bounce
  else if (rsi > 75) score -= 15; // Too overbought

  // Volatility for trading
  if (atr >= 3 && atr <= 12) score += 10;
  else if (atr >= 1.5 && atr < 3) score += 6;
  else if (atr > 18) score -= 5;

  // Volume to market cap ratio
  if (coin.volumeToMcap > 0.12 && coin.volumeToMcap <= 0.5) score += 8;
  else if (coin.volumeToMcap > 0.06) score += 5;
  else if (coin.volumeToMcap < 0.015) score -= 5;

  return Math.max(0, score);
}

function scoreSellOpportunity(coin: EnrichedCoin): number {
  let score = 0;

  const p1h = coin.change1h;
  const p24 = coin.change24h;
  const p7d = coin.change7d;
  const p30d = coin.change30d;
  const rsi = coin.rsi14;
  const atr = coin.atr14;

  // Liquidity scoring (same as buy)
  if (coin.volume24h >= 200_000_000) score += 14;
  else if (coin.volume24h >= 50_000_000) score += 10;
  else if (coin.volume24h >= 10_000_000) score += 6;

  // Market cap rank
  if (coin.marketCapRank <= 10) score += 11;
  else if (coin.marketCapRank <= 30) score += 8;
  else if (coin.marketCapRank <= 100) score += 5;
  else score += 2;

  // Multi-timeframe bearish momentum
  if (p30d < -15 && p7d < -8) score += 20;
  else if (p30d < -8 && p7d < -5) score += 15;
  else if (p7d < -3) score += 10;
  else if (p7d > 5) score -= 12; // Penalize uptrends

  // Daily bearish momentum
  if (p24 < -5) score += 10;
  else if (p24 < -2) score += 7;
  else if (p24 < 0) score += 4;
  else if (p24 > 3) score -= 8;

  // Hourly bearish momentum
  if (p1h < -1 && p1h > -6) score += 8;
  else if (p1h < -0.3 && p1h >= -1) score += 5;
  else if (p1h > 2) score -= 5;

  // RSI for SELL (looking for overbought or weakening)
  if (rsi >= 70) score += 15; // Overbought
  else if (rsi >= 60 && rsi < 70) score += 10; // Getting overbought
  else if (rsi >= 45 && rsi < 60) score += 5; // Neutral
  else if (rsi < 30) score -= 15; // Too oversold

  // Volatility for trading
  if (atr >= 3 && atr <= 12) score += 10;
  else if (atr >= 1.5 && atr < 3) score += 6;
  else if (atr > 18) score -= 5;

  // Volume to market cap ratio
  if (coin.volumeToMcap > 0.12 && coin.volumeToMcap <= 0.5) score += 8;
  else if (coin.volumeToMcap > 0.06) score += 5;
  else if (coin.volumeToMcap < 0.015) score -= 5;

  return Math.max(0, score);
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

  const { change24h: p24, change7d: p7d, change30d: p30d, change1h: p1h, rsi14: rsi, atr14: atr } = coin;

  if (trade.action === "BUY") {
    // Momentum analysis
    if (p30d > 15 && p7d > 8) {
      reasons.push(`strong multi-timeframe bullish momentum (+${p7d.toFixed(1)}% weekly, +${p30d.toFixed(1)}% monthly)`);
    } else if (p7d > 3) {
      reasons.push(`positive weekly trend (+${p7d.toFixed(1)}%)`);
    }
    
    if (p24 > 3) {
      reasons.push(`significant 24h gain (+${p24.toFixed(1)}%)`);
    } else if (p24 > 0) {
      reasons.push(`positive daily momentum (+${p24.toFixed(1)}%)`);
    }

    if (p1h > 0.5) {
      reasons.push(`recent bullish action (+${p1h.toFixed(2)}% in 1h)`);
    }

    // RSI analysis
    if (rsi >= 40 && rsi <= 60) {
      reasons.push(`optimal RSI zone (${rsi.toFixed(1)}) for trend continuation`);
    } else if (rsi < 30) {
      reasons.push(`oversold RSI (${rsi.toFixed(1)}) signaling potential reversal`);
    } else if (rsi > 60 && rsi <= 70) {
      reasons.push(`RSI ${rsi.toFixed(1)} shows strength but not yet overbought`);
    }

    // Volatility and liquidity
    if (atr >= 3 && atr <= 12) {
      reasons.push(`ideal volatility (ATR ${atr.toFixed(1)}%) for swing trading`);
    }
    if (coin.volumeToMcap > 0.1) {
      reasons.push(`exceptional liquidity (${(coin.volumeToMcap * 100).toFixed(1)}% volume/mcap ratio)`);
    } else if (coin.volumeToMcap > 0.06) {
      reasons.push("strong trading volume relative to market cap");
    }

    if (coin.marketCapRank <= 20) {
      reasons.push(`blue-chip asset (rank #${coin.marketCapRank}) with institutional backing`);
    } else if (coin.marketCapRank <= 50) {
      reasons.push(`established top-50 asset (rank #${coin.marketCapRank})`);
    }
  } else {
    // SELL reasoning
    if (p30d < -10 && p7d < -5) {
      reasons.push(`sustained bearish pressure (${p7d.toFixed(1)}% weekly, ${p30d.toFixed(1)}% monthly)`);
    } else if (p7d < -3) {
      reasons.push(`weakening weekly trend (${p7d.toFixed(1)}%)`);
    }
    
    if (p24 < -3) {
      reasons.push(`significant daily decline (${p24.toFixed(1)}%)`);
    } else if (p24 < 0) {
      reasons.push(`bearish daily pressure (${p24.toFixed(1)}%)`);
    }

    if (p1h < -0.5) {
      reasons.push(`recent selling pressure (${p1h.toFixed(2)}% in 1h)`);
    }

    // RSI for short
    if (rsi > 75) {
      reasons.push(`severely overbought RSI (${rsi.toFixed(1)}) indicating correction risk`);
    } else if (rsi > 70) {
      reasons.push(`overbought RSI (${rsi.toFixed(1)}) suggesting pullback potential`);
    } else if (rsi >= 60 && rsi <= 70) {
      reasons.push(`elevated RSI (${rsi.toFixed(1)}) with weakening momentum`);
    }

    // Volatility and liquidity
    if (atr >= 3 && atr <= 12) {
      reasons.push(`favorable volatility (ATR ${atr.toFixed(1)}%) for short positioning`);
    }
    if (coin.volumeToMcap > 0.1) {
      reasons.push(`high liquidity (${(coin.volumeToMcap * 100).toFixed(1)}% volume/mcap) allows clean exits`);
    }

    if (coin.marketCapRank <= 30) {
      reasons.push(`liquid large-cap (rank #${coin.marketCapRank}) suitable for short trades`);
    }
  }

  const base = `${coin.name} has been identified as today's highest-probability ${trade.action} opportunity with a ${trade.successProbability}% estimated success rate.`;
  const details = reasons.length
    ? ` Key factors: ${reasons.join("; ")}.`
    : "";
  const risk = ` Risk/reward ratio: ${trade.riskReward}:1.`;
  const caution =
    " This analysis combines technical indicators (RSI, ATR), momentum metrics, and liquidity factors. Always perform your own due diligence and apply proper risk management.";

  return base + details + risk + caution;
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

    // Evaluate all coins for both BUY and SELL opportunities
    const opportunities: TradeOpportunity[] = [];

    for (const coin of coins) {
      if (coin.currentPrice <= 0) continue;
      
      const buyScore = scoreBuyOpportunity(coin);
      const sellScore = scoreSellOpportunity(coin);

      if (buyScore > 0) {
        opportunities.push({ coin, action: "BUY", score: buyScore });
      }
      if (sellScore > 0) {
        opportunities.push({ coin, action: "SELL", score: sellScore });
      }
    }

    if (opportunities.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid trading opportunities found" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Select the opportunity with the highest score
    opportunities.sort((a, b) => b.score - a.score);
    const bestOpportunity = opportunities[0];
    
    const best = bestOpportunity.coin;
    const action = bestOpportunity.action;
    const bestScore = bestOpportunity.score;
    const successProbability = normalizeProbability(bestScore);

    console.log(`Best trade: ${action} ${best.name} with score ${bestScore} (${successProbability}% probability)`);

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