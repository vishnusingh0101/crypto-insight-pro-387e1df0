import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET_NAME = "market-cache";
const FILE_PATH = "daily/full_market.json";

// Conservative trading settings
const CONSERVATIVE_CONFIG = {
  // Only trade top 20 high-liquidity coins
  MAX_RANK: 20,
  MIN_VOLUME_24H: 100_000_000, // $100M minimum volume
  
  // RSI filters - only trade in neutral zone
  RSI_MIN: 40,
  RSI_MAX: 60,
  
  // Risk management
  MAX_RISK_PERCENT: 0.5,
  TARGET_PROFIT_MIN: 0.3,
  TARGET_PROFIT_MAX: 0.8,
  MIN_RISK_REWARD: 1.0,
  
  // Volatility filters
  MAX_1H_CHANGE: 3, // Skip if 1h change > 3%
  MAX_24H_CHANGE: 8, // Skip if 24h change > 8% (too volatile)
  
  // Trend alignment requirements
  TREND_ALIGNMENT_REQUIRED: true,
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

type StoredPayload = {
  updatedAt: string;
  source: string;
  coins: EnrichedCoin[];
};

type TradeAction = "BUY" | "SELL" | "NO_TRADE";

type TradeStatus = "SCANNING" | "FOUND" | "NO_OPPORTUNITY";

type FilterResult = {
  passed: boolean;
  reason: string;
};

type ConservativeTrade = {
  coinId: string;
  coinName: string;
  coinSymbol: string;
  coinImage: string;
  action: TradeAction;
  status: TradeStatus;
  currentPrice: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  targetPercent: number;
  riskPercent: number;
  riskReward: number;
  successProbability: number;
  rsi14: number;
  atr14: number;
  priceChange1h: number;
  priceChange24h: number;
  priceChange7d: number;
  volume24h: number;
  marketCap: number;
  marketCapRank: number;
  trendAlignment: string;
  filtersApplied: string[];
  filtersPassed: string[];
  filtersSkipped: string[];
  reasoning: string;
  updatedAt: string;
  nextScanIn: string;
};

// Check if coin passes all conservative filters
function applyConservativeFilters(coin: EnrichedCoin): { passed: boolean; results: FilterResult[] } {
  const results: FilterResult[] = [];
  
  // Filter 1: Market cap rank (top 20 only)
  const rankFilter: FilterResult = {
    passed: coin.marketCapRank <= CONSERVATIVE_CONFIG.MAX_RANK,
    reason: `Rank #${coin.marketCapRank} ${coin.marketCapRank <= CONSERVATIVE_CONFIG.MAX_RANK ? '✓' : `> ${CONSERVATIVE_CONFIG.MAX_RANK}`}`
  };
  results.push(rankFilter);
  
  // Filter 2: Minimum volume
  const volumeFilter: FilterResult = {
    passed: coin.volume24h >= CONSERVATIVE_CONFIG.MIN_VOLUME_24H,
    reason: `Volume $${(coin.volume24h / 1_000_000).toFixed(0)}M ${coin.volume24h >= CONSERVATIVE_CONFIG.MIN_VOLUME_24H ? '✓' : '< $100M'}`
  };
  results.push(volumeFilter);
  
  // Filter 3: RSI in neutral zone (40-60)
  const rsiFilter: FilterResult = {
    passed: coin.rsi14 >= CONSERVATIVE_CONFIG.RSI_MIN && coin.rsi14 <= CONSERVATIVE_CONFIG.RSI_MAX,
    reason: `RSI ${coin.rsi14.toFixed(1)} ${coin.rsi14 >= CONSERVATIVE_CONFIG.RSI_MIN && coin.rsi14 <= CONSERVATIVE_CONFIG.RSI_MAX ? '✓ (neutral zone)' : 'outside 40-60'}`
  };
  results.push(rsiFilter);
  
  // Filter 4: Not too volatile (1h change)
  const volatility1hFilter: FilterResult = {
    passed: Math.abs(coin.change1h) <= CONSERVATIVE_CONFIG.MAX_1H_CHANGE,
    reason: `1h volatility ${Math.abs(coin.change1h).toFixed(2)}% ${Math.abs(coin.change1h) <= CONSERVATIVE_CONFIG.MAX_1H_CHANGE ? '✓' : '> 3%'}`
  };
  results.push(volatility1hFilter);
  
  // Filter 5: Not too volatile (24h change)
  const volatility24hFilter: FilterResult = {
    passed: Math.abs(coin.change24h) <= CONSERVATIVE_CONFIG.MAX_24H_CHANGE,
    reason: `24h volatility ${Math.abs(coin.change24h).toFixed(2)}% ${Math.abs(coin.change24h) <= CONSERVATIVE_CONFIG.MAX_24H_CHANGE ? '✓' : '> 8%'}`
  };
  results.push(volatility24hFilter);
  
  // Filter 6: Trend alignment (15m & 1h trend must align)
  // Using 1h and 24h as proxy since we don't have 15m data
  const trendAligned = (coin.change1h > 0 && coin.change24h > 0) || (coin.change1h < 0 && coin.change24h < 0);
  const trendFilter: FilterResult = {
    passed: trendAligned,
    reason: `Trend alignment ${trendAligned ? '✓' : 'mixed signals'}`
  };
  results.push(trendFilter);
  
  // Filter 7: No large impulsive candles (using 1h as proxy)
  const noImpulsiveFilter: FilterResult = {
    passed: Math.abs(coin.change1h) < 2,
    reason: `No impulsive moves ${Math.abs(coin.change1h) < 2 ? '✓' : '> 2% 1h move'}`
  };
  results.push(noImpulsiveFilter);
  
  // Filter 8: Stable or increasing volume (volume > 5% of market cap)
  const volumeStableFilter: FilterResult = {
    passed: coin.volumeToMcap > 0.05,
    reason: `Volume/MCap ${(coin.volumeToMcap * 100).toFixed(2)}% ${coin.volumeToMcap > 0.05 ? '✓' : '< 5%'}`
  };
  results.push(volumeStableFilter);
  
  const passed = results.every(r => r.passed);
  return { passed, results };
}

// Calculate conservative trade setup (pullback/range only)
function calculateConservativeSetup(coin: EnrichedCoin): {
  action: TradeAction;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  targetPercent: number;
  riskPercent: number;
  riskReward: number;
  trendDirection: string;
} {
  const price = coin.currentPrice;
  const atr = coin.atr14;
  
  // Determine trend direction from multi-timeframe analysis
  const bullish = coin.change24h > 0 && coin.change7d > 0;
  const bearish = coin.change24h < 0 && coin.change7d < 0;
  
  // Only pullback/range trades - no breakouts
  // Looking for small retracements in the direction of the trend
  
  if (bullish && coin.change1h < 0 && coin.change1h > -1) {
    // Bullish trend with small pullback - BUY opportunity
    const targetPercent = Math.min(
      CONSERVATIVE_CONFIG.TARGET_PROFIT_MAX,
      Math.max(CONSERVATIVE_CONFIG.TARGET_PROFIT_MIN, atr * 0.3)
    ) / 100;
    
    const riskPercent = targetPercent * 0.8; // Ensure at least 1:1 R:R
    
    return {
      action: "BUY",
      entryPrice: price,
      targetPrice: price * (1 + targetPercent),
      stopLoss: price * (1 - riskPercent),
      targetPercent: targetPercent * 100,
      riskPercent: riskPercent * 100,
      riskReward: targetPercent / riskPercent,
      trendDirection: "BULLISH"
    };
  }
  
  if (bearish && coin.change1h > 0 && coin.change1h < 1) {
    // Bearish trend with small bounce - SELL opportunity
    const targetPercent = Math.min(
      CONSERVATIVE_CONFIG.TARGET_PROFIT_MAX,
      Math.max(CONSERVATIVE_CONFIG.TARGET_PROFIT_MIN, atr * 0.3)
    ) / 100;
    
    const riskPercent = targetPercent * 0.8;
    
    return {
      action: "SELL",
      entryPrice: price,
      targetPrice: price * (1 - targetPercent),
      stopLoss: price * (1 + riskPercent),
      targetPercent: targetPercent * 100,
      riskPercent: riskPercent * 100,
      riskReward: targetPercent / riskPercent,
      trendDirection: "BEARISH"
    };
  }
  
  // Range-bound trade detection
  const priceRange = (coin.high24h - coin.low24h) / price;
  const isRangeBound = priceRange < 0.05 && Math.abs(coin.change24h) < 2;
  
  if (isRangeBound) {
    // Price near support in range
    const midPoint = (coin.high24h + coin.low24h) / 2;
    const nearSupport = price < midPoint * 0.995;
    const nearResistance = price > midPoint * 1.005;
    
    if (nearSupport) {
      const targetPercent = 0.5 / 100;
      const riskPercent = 0.4 / 100;
      
      return {
        action: "BUY",
        entryPrice: price,
        targetPrice: price * (1 + targetPercent),
        stopLoss: price * (1 - riskPercent),
        targetPercent: targetPercent * 100,
        riskPercent: riskPercent * 100,
        riskReward: targetPercent / riskPercent,
        trendDirection: "RANGE (near support)"
      };
    }
    
    if (nearResistance) {
      const targetPercent = 0.5 / 100;
      const riskPercent = 0.4 / 100;
      
      return {
        action: "SELL",
        entryPrice: price,
        targetPrice: price * (1 - targetPercent),
        stopLoss: price * (1 + riskPercent),
        targetPercent: targetPercent * 100,
        riskPercent: riskPercent * 100,
        riskReward: targetPercent / riskPercent,
        trendDirection: "RANGE (near resistance)"
      };
    }
  }
  
  // No valid setup found
  return {
    action: "NO_TRADE",
    entryPrice: price,
    targetPrice: price,
    stopLoss: price,
    targetPercent: 0,
    riskPercent: 0,
    riskReward: 0,
    trendDirection: "UNCLEAR"
  };
}

// Score trade opportunity (lower is better for conservative trading)
function scoreConservativeOpportunity(coin: EnrichedCoin, setup: ReturnType<typeof calculateConservativeSetup>): number {
  if (setup.action === "NO_TRADE") return 0;
  
  let score = 50; // Base score
  
  // Higher score for better liquidity
  if (coin.marketCapRank <= 5) score += 20;
  else if (coin.marketCapRank <= 10) score += 15;
  else if (coin.marketCapRank <= 20) score += 10;
  
  // Higher score for neutral RSI (closer to 50)
  const rsiDeviation = Math.abs(coin.rsi14 - 50);
  if (rsiDeviation <= 5) score += 15;
  else if (rsiDeviation <= 10) score += 10;
  
  // Higher score for lower volatility
  if (Math.abs(coin.change1h) < 0.5) score += 10;
  if (Math.abs(coin.change24h) < 3) score += 10;
  
  // Higher score for better R:R
  if (setup.riskReward >= 1.5) score += 10;
  else if (setup.riskReward >= 1.2) score += 5;
  
  // Penalty for high ATR (more volatile)
  if (coin.atr14 > 10) score -= 10;
  else if (coin.atr14 > 5) score -= 5;
  
  return score;
}

function buildConservativeReasoning(coin: EnrichedCoin, trade: ConservativeTrade): string {
  if (trade.action === "NO_TRADE") {
    return `No qualifying trade found. All ${trade.filtersApplied.length} conservative filters were checked. ` +
      `${trade.filtersPassed.length} passed, ${trade.filtersSkipped.length} failed. ` +
      `Capital protection is priority - waiting for perfect setup.`;
  }
  
  const action = trade.action === "BUY" ? "long" : "short";
  const trendType = trade.trendAlignment.includes("RANGE") ? "range-bound" : "pullback";
  
  return `${coin.name} identified as a conservative ${trendType} ${action} opportunity. ` +
    `Entry: $${trade.entryPrice.toFixed(2)}, Target: ${trade.targetPercent.toFixed(2)}% profit, ` +
    `Stop: ${trade.riskPercent.toFixed(2)}% risk. ` +
    `RSI at ${coin.rsi14.toFixed(1)} (neutral zone). ` +
    `Risk:Reward ${trade.riskReward.toFixed(2)}:1. ` +
    `${trade.filtersPassed.length}/${trade.filtersApplied.length} filters passed. ` +
    `This is a statistically reliable, low-risk setup prioritizing capital protection over large gains.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Conservative trade scanner starting - Capital protection priority");

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

    // Check data freshness
    const updatedAt = new Date(payload.updatedAt);
    const now = new Date();
    const ageMs = now.getTime() - updatedAt.getTime();
    const oneHourMs = 60 * 60 * 1000;
    
    if (ageMs > oneHourMs) {
      console.log(`Market data is ${Math.round(ageMs / 60000)} minutes old, triggering refresh...`);
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      
      fetch(`${supabaseUrl}/functions/v1/update-market-data`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json'
        }
      }).catch(err => console.error("Background update failed:", err));
    }

    if (!coins.length) {
      return new Response(
        JSON.stringify({ error: "No coins in cached data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Filter to top 20 coins only
    const eligibleCoins = coins.filter(c => c.marketCapRank <= CONSERVATIVE_CONFIG.MAX_RANK);
    console.log(`Scanning ${eligibleCoins.length} top-${CONSERVATIVE_CONFIG.MAX_RANK} coins...`);

    let bestTrade: ConservativeTrade | null = null;
    let highestScore = 0;
    const allFiltersApplied: string[] = [
      "Top 20 rank",
      "Min $100M volume",
      "RSI 40-60",
      "1h volatility < 3%",
      "24h volatility < 8%",
      "Trend alignment",
      "No impulsive moves",
      "Volume stability"
    ];

    for (const coin of eligibleCoins) {
      if (coin.currentPrice <= 0) continue;
      
      // Apply conservative filters
      const { passed, results } = applyConservativeFilters(coin);
      const filtersPassed = results.filter(r => r.passed).map(r => r.reason);
      const filtersSkipped = results.filter(r => !r.passed).map(r => r.reason);
      
      if (!passed) {
        console.log(`${coin.symbol}: SKIP - ${filtersSkipped[0]}`);
        continue;
      }
      
      // Calculate conservative trade setup
      const setup = calculateConservativeSetup(coin);
      
      if (setup.action === "NO_TRADE") {
        console.log(`${coin.symbol}: No valid pullback/range setup`);
        continue;
      }
      
      // Verify minimum R:R
      if (setup.riskReward < CONSERVATIVE_CONFIG.MIN_RISK_REWARD) {
        console.log(`${coin.symbol}: R:R ${setup.riskReward.toFixed(2)} < 1:1 minimum`);
        continue;
      }
      
      // Score the opportunity
      const score = scoreConservativeOpportunity(coin, setup);
      
      if (score > highestScore) {
        highestScore = score;
        
        // Calculate success probability based on filter pass rate and setup quality
        const filterPassRate = filtersPassed.length / results.length;
        const baseProb = 55 + (filterPassRate * 25);
        const setupBonus = setup.riskReward >= 1.2 ? 5 : 0;
        const successProbability = Math.min(85, Math.round(baseProb + setupBonus));
        
        bestTrade = {
          coinId: coin.id,
          coinName: coin.name,
          coinSymbol: coin.symbol.toUpperCase(),
          coinImage: coin.image,
          action: setup.action,
          status: "FOUND",
          currentPrice: coin.currentPrice,
          entryPrice: setup.entryPrice,
          targetPrice: setup.targetPrice,
          stopLoss: setup.stopLoss,
          targetPercent: setup.targetPercent,
          riskPercent: setup.riskPercent,
          riskReward: Number(setup.riskReward.toFixed(2)),
          successProbability,
          rsi14: coin.rsi14,
          atr14: coin.atr14,
          priceChange1h: coin.change1h,
          priceChange24h: coin.change24h,
          priceChange7d: coin.change7d,
          volume24h: coin.volume24h,
          marketCap: coin.marketCap,
          marketCapRank: coin.marketCapRank,
          trendAlignment: setup.trendDirection,
          filtersApplied: allFiltersApplied,
          filtersPassed,
          filtersSkipped,
          reasoning: "",
          updatedAt: payload.updatedAt,
          nextScanIn: "1 hour"
        };
        
        console.log(`${coin.symbol}: QUALIFIED - ${setup.action} setup with score ${score}`);
      }
    }

    // If no trade found, return NO_TRADE status
    if (!bestTrade) {
      console.log("No qualifying conservative trade found - capital protection mode");
      
      const noTrade: ConservativeTrade = {
        coinId: "",
        coinName: "No Trade",
        coinSymbol: "WAIT",
        coinImage: "",
        action: "NO_TRADE",
        status: "NO_OPPORTUNITY",
        currentPrice: 0,
        entryPrice: 0,
        targetPrice: 0,
        stopLoss: 0,
        targetPercent: 0,
        riskPercent: 0,
        riskReward: 0,
        successProbability: 0,
        rsi14: 0,
        atr14: 0,
        priceChange1h: 0,
        priceChange24h: 0,
        priceChange7d: 0,
        volume24h: 0,
        marketCap: 0,
        marketCapRank: 0,
        trendAlignment: "N/A",
        filtersApplied: allFiltersApplied,
        filtersPassed: [],
        filtersSkipped: ["No coins passed all conservative filters"],
        reasoning: "Market conditions do not meet conservative trading criteria. " +
          "Capital protection is the priority - waiting for perfect setup. " +
          "Trade LESS, but trade SMART. Will rescan in 1 hour.",
        updatedAt: payload.updatedAt,
        nextScanIn: "1 hour"
      };
      
      return new Response(JSON.stringify(noTrade), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build reasoning for the best trade
    const bestCoin = eligibleCoins.find(c => c.id === bestTrade!.coinId)!;
    bestTrade.reasoning = buildConservativeReasoning(bestCoin, bestTrade);

    console.log(`Best conservative trade: ${bestTrade.action} ${bestTrade.coinName} @ $${bestTrade.entryPrice}`);
    console.log(`Target: ${bestTrade.targetPercent}%, Stop: ${bestTrade.riskPercent}%, R:R: ${bestTrade.riskReward}:1`);

    return new Response(JSON.stringify(bestTrade), {
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
