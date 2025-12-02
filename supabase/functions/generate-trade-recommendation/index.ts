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

type TradeAction = "BUY" | "SELL" | "HOLD";

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
  else if (p7d < -5) score -= 12;

  // Daily momentum
  if (p24 > 5) score += 10;
  else if (p24 > 2) score += 7;
  else if (p24 > 0) score += 4;
  else if (p24 < -3) score -= 8;

  // Hourly momentum
  if (p1h > 1 && p1h < 6) score += 8;
  else if (p1h > 0.3 && p1h <= 1) score += 5;
  else if (p1h < -2) score -= 5;

  // RSI for BUY
  if (rsi >= 40 && rsi <= 60) score += 15;
  else if (rsi > 60 && rsi <= 70) score += 8;
  else if (rsi < 30) score += 12;
  else if (rsi > 75) score -= 15;

  // Volatility
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

  // Liquidity scoring
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
  else if (p7d > 5) score -= 12;

  // Daily bearish momentum
  if (p24 < -5) score += 10;
  else if (p24 < -2) score += 7;
  else if (p24 < 0) score += 4;
  else if (p24 > 3) score -= 8;

  // Hourly bearish momentum
  if (p1h < -1 && p1h > -6) score += 8;
  else if (p1h < -0.3 && p1h >= -1) score += 5;
  else if (p1h > 2) score -= 5;

  // RSI for SELL
  if (rsi >= 70) score += 15;
  else if (rsi >= 60 && rsi < 70) score += 10;
  else if (rsi >= 45 && rsi < 60) score += 5;
  else if (rsi < 30) score -= 15;

  // Volatility
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

function calculateTargets(coin: EnrichedCoin, action: TradeAction) {
  const price = coin.currentPrice;
  const atr = coin.atr14;
  
  const atrFactor = Math.min(Math.max(atr, 2), 15) / 100;
  const trendBoost = Math.max(0, coin.change7d) * 0.002;
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
  } else if (action === "SELL") {
    const shortTargetFactor = 1 - (targetFactor - 1);
    const shortStopFactor = 2 - stopFactor;
    targetPrice = price * shortTargetFactor;
    stopLoss = price * shortStopFactor;
  } else {
    // HOLD - use neutral targets
    targetPrice = price * 1.05;
    stopLoss = price * 0.95;
  }

  return { buyPrice, targetPrice, stopLoss };
}

function getTechnicalSummary(coin: EnrichedCoin, technicalScore: number): string {
  const { change24h, change7d, rsi14, atr14, volumeToMcap } = coin;
  
  const parts: string[] = [];
  
  if (change24h > 5) parts.push(`strong 24h momentum (+${change24h.toFixed(1)}%)`);
  else if (change24h > 0) parts.push(`positive 24h change (+${change24h.toFixed(1)}%)`);
  else if (change24h < -5) parts.push(`significant 24h decline (${change24h.toFixed(1)}%)`);
  else if (change24h < 0) parts.push(`slight 24h pullback (${change24h.toFixed(1)}%)`);
  
  if (rsi14 < 30) parts.push(`RSI oversold (${rsi14.toFixed(1)})`);
  else if (rsi14 > 70) parts.push(`RSI overbought (${rsi14.toFixed(1)})`);
  else parts.push(`RSI neutral zone (${rsi14.toFixed(1)})`);
  
  if (volumeToMcap > 0.1) parts.push("exceptional trading volume");
  
  if (technicalScore >= 60) {
    return `Strong bullish technical setup: ${parts.join(", ")}.`;
  } else if (technicalScore >= 40) {
    return `Neutral technical indicators: ${parts.join(", ")}.`;
  } else {
    return `Weak technical profile: ${parts.join(", ")}.`;
  }
}

function getFundamentalSummary(coin: EnrichedCoin, fundamentalScore: number): string {
  const { marketCapRank, marketCap, volume24h } = coin;
  
  const parts: string[] = [];
  
  if (marketCapRank <= 10) parts.push(`top-10 cryptocurrency (rank #${marketCapRank})`);
  else if (marketCapRank <= 30) parts.push(`established top-30 asset (rank #${marketCapRank})`);
  else if (marketCapRank <= 100) parts.push(`mid-cap cryptocurrency (rank #${marketCapRank})`);
  else parts.push(`smaller cap asset (rank #${marketCapRank})`);
  
  const mcapInB = marketCap / 1_000_000_000;
  if (mcapInB > 10) parts.push(`$${mcapInB.toFixed(1)}B market cap`);
  
  if (fundamentalScore >= 60) {
    return `Strong fundamentals: ${parts.join(", ")}. Solid market position with institutional-grade liquidity.`;
  } else if (fundamentalScore >= 40) {
    return `Decent fundamentals: ${parts.join(", ")}. Moderate market presence.`;
  } else {
    return `Weaker fundamentals: ${parts.join(", ")}. Higher risk profile.`;
  }
}

function getNewsSummary(coin: EnrichedCoin, newsScore: number): string {
  const { change24h, change7d } = coin;
  const sentimentTrend = change24h + (change7d * 0.3);
  
  if (newsScore >= 25) {
    return sentimentTrend > 0 
      ? "Positive market sentiment with bullish community outlook and favorable news coverage."
      : "Mixed sentiment but overall positive outlook based on market indicators.";
  } else if (newsScore >= 15) {
    return "Neutral sentiment in recent news coverage. Market awaiting catalysts.";
  } else {
    return "Cautious to negative sentiment in recent coverage. Monitor for developments.";
  }
}

function generateReasoning(
  coin: EnrichedCoin,
  action: TradeAction,
  buyScore: number,
  sellScore: number,
  successProbability: number,
  riskReward: number
): string {
  const reasons: string[] = [];
  const { change1h, change24h, change7d, change30d, rsi14, atr14, volumeToMcap, marketCapRank } = coin;

  if (action === "BUY") {
    if (change30d > 15 && change7d > 8) {
      reasons.push(`strong multi-timeframe bullish momentum (+${change7d.toFixed(1)}% weekly, +${change30d.toFixed(1)}% monthly)`);
    } else if (change7d > 3) {
      reasons.push(`positive weekly trend (+${change7d.toFixed(1)}%)`);
    }
    
    if (change24h > 3) {
      reasons.push(`significant 24h gain (+${change24h.toFixed(1)}%)`);
    } else if (change24h > 0) {
      reasons.push(`positive daily momentum (+${change24h.toFixed(1)}%)`);
    }

    if (change1h > 0.5) {
      reasons.push(`recent bullish action (+${change1h.toFixed(2)}% in 1h)`);
    }

    if (rsi14 >= 40 && rsi14 <= 60) {
      reasons.push(`optimal RSI zone (${rsi14.toFixed(1)}) for trend continuation`);
    } else if (rsi14 < 30) {
      reasons.push(`oversold RSI (${rsi14.toFixed(1)}) signaling potential reversal`);
    }

    if (atr14 >= 3 && atr14 <= 12) {
      reasons.push(`ideal volatility (ATR ${atr14.toFixed(1)}%) for swing trading`);
    }
    
    if (volumeToMcap > 0.1) {
      reasons.push(`exceptional liquidity (${(volumeToMcap * 100).toFixed(1)}% volume/mcap ratio)`);
    }

    if (marketCapRank <= 20) {
      reasons.push(`blue-chip asset (rank #${marketCapRank})`);
    }
  } else if (action === "SELL") {
    if (change30d < -10 && change7d < -5) {
      reasons.push(`sustained bearish pressure (${change7d.toFixed(1)}% weekly, ${change30d.toFixed(1)}% monthly)`);
    } else if (change7d < -3) {
      reasons.push(`weakening weekly trend (${change7d.toFixed(1)}%)`);
    }
    
    if (change24h < -3) {
      reasons.push(`significant daily decline (${change24h.toFixed(1)}%)`);
    }

    if (rsi14 > 70) {
      reasons.push(`overbought RSI (${rsi14.toFixed(1)}) suggesting pullback`);
    }

    if (volumeToMcap > 0.1) {
      reasons.push(`high liquidity allows clean exits`);
    }
  } else {
    reasons.push("mixed signals suggest waiting for clearer confirmation");
    reasons.push(`buy score (${buyScore}) and sell score (${sellScore}) are similar`);
  }

  const base = `${action} recommendation for ${coin.name} with ${successProbability}% estimated success rate.`;
  const details = reasons.length ? ` Key factors: ${reasons.join("; ")}.` : "";
  const risk = ` Risk/reward ratio: ${riskReward.toFixed(2)}:1.`;
  const caution = " This analysis combines technical indicators (RSI, ATR), momentum metrics, and liquidity factors. Always perform your own due diligence.";

  return base + details + risk + caution;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cryptoId } = await req.json();
    console.log("Generating trade recommendation for:", cryptoId);

    if (!cryptoId || typeof cryptoId !== 'string') {
      return new Response(
        JSON.stringify({ error: "Invalid cryptoId parameter" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Try to get coin from cached market data first (same source as best-trade)
    const { data: cacheData, error: cacheError } = await supabase.storage
      .from(BUCKET_NAME)
      .download(FILE_PATH);

    let coin: EnrichedCoin | null = null;

    if (!cacheError && cacheData) {
      const text = await cacheData.text();
      const payload = JSON.parse(text) as StoredPayload;
      coin = payload.coins.find(c => c.id === cryptoId) || null;
      console.log("Found coin in cache:", coin?.name);
    }

    // Fallback to CoinGecko if not in cache
    if (!coin) {
      console.log("Coin not in cache, fetching from CoinGecko...");
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/${cryptoId}?localization=false&tickers=false&community_data=false&developer_data=false`,
        { headers: { 'Accept': 'application/json' } }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch crypto data: ${response.status}`);
      }

      const cryptoData = await response.json();
      const marketData = cryptoData.market_data;

      // Build EnrichedCoin from CoinGecko data
      const currentPrice = marketData.current_price?.usd || 0;
      const high24h = marketData.high_24h?.usd || currentPrice;
      const low24h = marketData.low_24h?.usd || currentPrice;
      const atr14 = currentPrice > 0 ? ((high24h - low24h) / currentPrice) * 100 : 5;
      const volumeToMcap = marketData.total_volume?.usd && marketData.market_cap?.usd 
        ? marketData.total_volume.usd / marketData.market_cap.usd 
        : 0.05;

      coin = {
        id: cryptoId,
        symbol: cryptoData.symbol || "",
        name: cryptoData.name || cryptoId,
        image: cryptoData.image?.small || "",
        currentPrice,
        marketCap: marketData.market_cap?.usd || 0,
        volume24h: marketData.total_volume?.usd || 0,
        marketCapRank: cryptoData.market_cap_rank || 100,
        high24h,
        low24h,
        change1h: marketData.price_change_percentage_1h_in_currency?.usd || 0,
        change24h: marketData.price_change_percentage_24h || 0,
        change7d: marketData.price_change_percentage_7d || 0,
        change30d: marketData.price_change_percentage_30d || 0,
        rsi14: 50 + (marketData.price_change_percentage_24h || 0) / 2,
        atr14,
        volatilityScore: Math.min(atr14 / 10, 1),
        liquidityScore: Math.min(volumeToMcap * 5, 1),
        volumeToMcap,
      };
    }

    // Use the same scoring logic as best-trade
    const buyScore = scoreBuyOpportunity(coin);
    const sellScore = scoreSellOpportunity(coin);

    // Determine action
    let action: TradeAction;
    let primaryScore: number;

    if (buyScore > sellScore && buyScore > 30) {
      action = "BUY";
      primaryScore = buyScore;
    } else if (sellScore > buyScore && sellScore > 30) {
      action = "SELL";
      primaryScore = sellScore;
    } else {
      action = "HOLD";
      primaryScore = Math.max(buyScore, sellScore);
    }

    const successProbability = normalizeProbability(primaryScore);
    const { buyPrice, targetPrice, stopLoss } = calculateTargets(coin, action);
    const riskReward = calculateRiskReward(action, buyPrice, targetPrice, stopLoss);

    // Calculate component scores for display
    const technicalScore = Math.min(100, Math.round(
      (coin.change24h > 0 ? 20 : 0) +
      (coin.change7d > 0 ? 20 : 0) +
      (coin.volumeToMcap > 0.1 ? 15 : coin.volumeToMcap > 0.05 ? 10 : 5) +
      (coin.rsi14 > 30 && coin.rsi14 < 70 ? 15 : 5) +
      (coin.atr14 >= 3 && coin.atr14 <= 12 ? 15 : 8)
    ));

    const fundamentalScore = Math.min(100, Math.round(
      (coin.marketCapRank <= 10 ? 40 : coin.marketCapRank <= 30 ? 30 : coin.marketCapRank <= 100 ? 20 : 10) +
      (coin.volume24h > 100_000_000 ? 30 : coin.volume24h > 10_000_000 ? 20 : 10) +
      (coin.liquidityScore * 30)
    ));

    const sentimentIndicator = coin.change24h + (coin.change7d * 0.3);
    const newsScore = sentimentIndicator > 5 ? 30 : sentimentIndicator > 2 ? 20 : sentimentIndicator > 0 ? 15 : sentimentIndicator > -2 ? 10 : 5;

    const recommendation = {
      action,
      successProbability,
      currentPrice: coin.currentPrice,
      buyPrice: parseFloat(buyPrice.toFixed(6)),
      targetPrice: parseFloat(targetPrice.toFixed(6)),
      stopLoss: parseFloat(stopLoss.toFixed(6)),
      riskReward: parseFloat(riskReward.toFixed(2)),
      analysis: {
        technical: {
          score: technicalScore,
          indicators: {
            priceChange24h: parseFloat(coin.change24h.toFixed(2)),
            priceChange7d: parseFloat(coin.change7d.toFixed(2)),
            volumeRatio: parseFloat(coin.volumeToMcap.toFixed(4)),
            rsi: parseFloat(coin.rsi14.toFixed(2)),
            atr: parseFloat(coin.atr14.toFixed(2)),
          },
          summary: getTechnicalSummary(coin, technicalScore),
        },
        fundamental: {
          score: fundamentalScore,
          indicators: {
            marketCapRank: coin.marketCapRank,
            marketCap: coin.marketCap,
            volume24h: coin.volume24h,
          },
          summary: getFundamentalSummary(coin, fundamentalScore),
        },
        news: {
          score: newsScore,
          sentiment: sentimentIndicator > 0 ? "Positive" : sentimentIndicator < -2 ? "Negative" : "Neutral",
          summary: getNewsSummary(coin, newsScore),
        }
      },
      reasoning: generateReasoning(coin, action, buyScore, sellScore, successProbability, riskReward),
      timestamp: new Date().toISOString(),
    };

    console.log(`Generated recommendation: ${action} with ${successProbability}% probability`);

    return new Response(JSON.stringify(recommendation), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-trade-recommendation:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
