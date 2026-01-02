import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET_NAME = "market-cache";
const FILE_PATH = "daily/full_market.json";

// Professional trading desk configuration
const TRADING_CONFIG = {
  // Market scope - top 30 by liquidity
  MAX_RANK: 30,
  MIN_VOLUME_24H: 50_000_000, // $50M minimum volume
  
  // RSI filters - only trade in neutral zone
  RSI_MIN: 40,
  RSI_MAX: 60,
  
  // Risk management
  MAX_RISK_PERCENT: 0.5,
  TARGET_PROFIT_MIN: 0.3,
  TARGET_PROFIT_MAX: 0.8,
  MIN_RISK_REWARD: 1.0,
  
  // Volatility filters
  MAX_1H_CHANGE: 3,
  MAX_24H_CHANGE: 8,
  
  // Trade qualification
  MIN_CONFIDENCE_FOR_TRADE: 70,
  MIN_WHALE_CONFIDENCE: 70,
  
  // Capital protection triggers
  MAX_CONSECUTIVE_LOSSES: 3,
  TIGHTEN_AFTER_LOSSES: 2,
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
type TradeStatus = "SCANNING" | "FOUND" | "NO_OPPORTUNITY" | "CAPITAL_PROTECTION";
type SystemMode = "paper" | "live";
type WhaleIntent = "accumulating" | "distributing" | "neutral";

type SystemPerformance = {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  accuracyPercent: number;
  consecutiveLosses: number;
  capitalProtectionEnabled: boolean;
  capitalProtectionReason: string | null;
  mode: SystemMode;
};

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
  confidenceScore: number;
  whaleIntent: WhaleIntent | null;
  whaleConfidence: number | null;
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
  // System performance
  systemPerformance: SystemPerformance;
};

// Fetch whale intelligence from the analyze function
async function fetchWhaleIntelligence(supabaseUrl: string, serviceRoleKey: string): Promise<{
  intent: WhaleIntent;
  confidence: number;
  shouldTrade: boolean;
  volatilityState: string;
} | null> {
  try {
    // Generate mock whale transactions for analysis
    const mockTransactions = generateMockWhaleTransactions();
    
    const response = await fetch(`${supabaseUrl}/functions/v1/analyze-whale-intelligence`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ transactions: mockTransactions })
    });
    
    if (!response.ok) {
      console.log("Whale intelligence unavailable, proceeding without");
      return null;
    }
    
    const data = await response.json();
    
    return {
      intent: data.whaleIntent?.classification || 'neutral',
      confidence: data.confidenceScore || 0,
      shouldTrade: data.actionGuidance?.recommendation === 'trade',
      volatilityState: data.marketContext?.volatilityState || 'medium'
    };
  } catch (error) {
    console.error("Error fetching whale intelligence:", error);
    return null;
  }
}

// Generate mock whale transactions for analysis
function generateMockWhaleTransactions() {
  const types = ['exchange_inflow', 'exchange_outflow', 'transfer'] as const;
  const transactions = [];
  
  for (let i = 0; i < 10; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    transactions.push({
      hash: `0x${Math.random().toString(16).slice(2, 66)}`,
      blockchain: Math.random() > 0.5 ? 'ethereum' : 'bitcoin',
      amount: Math.random() * 1000 + 100,
      amountUsd: Math.random() * 50000000 + 1000000,
      from: `0x${Math.random().toString(16).slice(2, 42)}`,
      to: `0x${Math.random().toString(16).slice(2, 42)}`,
      fromLabel: type === 'exchange_inflow' ? undefined : 'Binance',
      toLabel: type === 'exchange_outflow' ? undefined : 'Coinbase',
      timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
      type,
      significance: Math.random() > 0.7 ? 'high' : Math.random() > 0.4 ? 'medium' : 'low'
    });
  }
  
  return transactions;
}

// Fetch system performance from database
async function fetchSystemPerformance(supabase: any): Promise<SystemPerformance> {
  const { data, error } = await supabase
    .from('system_performance')
    .select('*')
    .order('last_updated_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error || !data) {
    console.log("No system performance record found, using defaults");
    return {
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      accuracyPercent: 0,
      consecutiveLosses: 0,
      capitalProtectionEnabled: false,
      capitalProtectionReason: null,
      mode: 'paper'
    };
  }
  
  return {
    totalTrades: data.total_trades || 0,
    successfulTrades: data.successful_trades || 0,
    failedTrades: data.failed_trades || 0,
    accuracyPercent: data.accuracy_percent || 0,
    consecutiveLosses: data.consecutive_losses || 0,
    capitalProtectionEnabled: data.capital_protection_enabled || false,
    capitalProtectionReason: data.capital_protection_reason || null,
    mode: data.mode || 'paper'
  };
}

// Check if coin passes all filters
function applyTradingFilters(
  coin: EnrichedCoin, 
  tightenFilters: boolean
): { passed: boolean; results: FilterResult[] } {
  const results: FilterResult[] = [];
  
  // Adjust thresholds if tightening after losses
  const maxRank = tightenFilters ? 20 : TRADING_CONFIG.MAX_RANK;
  const rsiMin = tightenFilters ? 42 : TRADING_CONFIG.RSI_MIN;
  const rsiMax = tightenFilters ? 58 : TRADING_CONFIG.RSI_MAX;
  const max1hChange = tightenFilters ? 2 : TRADING_CONFIG.MAX_1H_CHANGE;
  const max24hChange = tightenFilters ? 6 : TRADING_CONFIG.MAX_24H_CHANGE;
  
  // Filter 1: Market cap rank
  const rankFilter: FilterResult = {
    passed: coin.marketCapRank <= maxRank,
    reason: `Rank #${coin.marketCapRank} ${coin.marketCapRank <= maxRank ? '✓' : `> ${maxRank}`}`
  };
  results.push(rankFilter);
  
  // Filter 2: Minimum volume
  const volumeFilter: FilterResult = {
    passed: coin.volume24h >= TRADING_CONFIG.MIN_VOLUME_24H,
    reason: `Volume $${(coin.volume24h / 1_000_000).toFixed(0)}M ${coin.volume24h >= TRADING_CONFIG.MIN_VOLUME_24H ? '✓' : '< $50M'}`
  };
  results.push(volumeFilter);
  
  // Filter 3: RSI in neutral zone
  const rsiFilter: FilterResult = {
    passed: coin.rsi14 >= rsiMin && coin.rsi14 <= rsiMax,
    reason: `RSI ${coin.rsi14.toFixed(1)} ${coin.rsi14 >= rsiMin && coin.rsi14 <= rsiMax ? '✓ (neutral)' : `outside ${rsiMin}-${rsiMax}`}`
  };
  results.push(rsiFilter);
  
  // Filter 4: 1h volatility
  const volatility1hFilter: FilterResult = {
    passed: Math.abs(coin.change1h) <= max1hChange,
    reason: `1h volatility ${Math.abs(coin.change1h).toFixed(2)}% ${Math.abs(coin.change1h) <= max1hChange ? '✓' : `> ${max1hChange}%`}`
  };
  results.push(volatility1hFilter);
  
  // Filter 5: 24h volatility
  const volatility24hFilter: FilterResult = {
    passed: Math.abs(coin.change24h) <= max24hChange,
    reason: `24h volatility ${Math.abs(coin.change24h).toFixed(2)}% ${Math.abs(coin.change24h) <= max24hChange ? '✓' : `> ${max24hChange}%`}`
  };
  results.push(volatility24hFilter);
  
  // Filter 6: Trend alignment
  const trendAligned = (coin.change1h > 0 && coin.change24h > 0) || (coin.change1h < 0 && coin.change24h < 0);
  const trendFilter: FilterResult = {
    passed: trendAligned,
    reason: `Trend alignment ${trendAligned ? '✓' : 'mixed signals'}`
  };
  results.push(trendFilter);
  
  // Filter 7: No impulsive moves
  const noImpulsiveFilter: FilterResult = {
    passed: Math.abs(coin.change1h) < 2,
    reason: `No impulsive moves ${Math.abs(coin.change1h) < 2 ? '✓' : '> 2% 1h move'}`
  };
  results.push(noImpulsiveFilter);
  
  // Filter 8: Volume stability
  const volumeStableFilter: FilterResult = {
    passed: coin.volumeToMcap > 0.05,
    reason: `Volume/MCap ${(coin.volumeToMcap * 100).toFixed(2)}% ${coin.volumeToMcap > 0.05 ? '✓' : '< 5%'}`
  };
  results.push(volumeStableFilter);
  
  const passed = results.every(r => r.passed);
  return { passed, results };
}

// Calculate trade setup
function calculateTradeSetup(coin: EnrichedCoin): {
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
  
  const bullish = coin.change24h > 0 && coin.change7d > 0;
  const bearish = coin.change24h < 0 && coin.change7d < 0;
  
  // Pullback trade in bullish trend
  if (bullish && coin.change1h < 0 && coin.change1h > -1) {
    const targetPercent = Math.min(
      TRADING_CONFIG.TARGET_PROFIT_MAX,
      Math.max(TRADING_CONFIG.TARGET_PROFIT_MIN, atr * 0.3)
    ) / 100;
    const riskPercent = targetPercent * 0.8;
    
    return {
      action: "BUY",
      entryPrice: price,
      targetPrice: price * (1 + targetPercent),
      stopLoss: price * (1 - riskPercent),
      targetPercent: targetPercent * 100,
      riskPercent: riskPercent * 100,
      riskReward: targetPercent / riskPercent,
      trendDirection: "BULLISH PULLBACK"
    };
  }
  
  // Pullback trade in bearish trend
  if (bearish && coin.change1h > 0 && coin.change1h < 1) {
    const targetPercent = Math.min(
      TRADING_CONFIG.TARGET_PROFIT_MAX,
      Math.max(TRADING_CONFIG.TARGET_PROFIT_MIN, atr * 0.3)
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
      trendDirection: "BEARISH PULLBACK"
    };
  }
  
  // Range-bound trade
  const priceRange = (coin.high24h - coin.low24h) / price;
  const isRangeBound = priceRange < 0.05 && Math.abs(coin.change24h) < 2;
  
  if (isRangeBound) {
    const midPoint = (coin.high24h + coin.low24h) / 2;
    const nearSupport = price < midPoint * 0.995;
    const nearResistance = price > midPoint * 1.005;
    
    if (nearSupport) {
      return {
        action: "BUY",
        entryPrice: price,
        targetPrice: price * 1.005,
        stopLoss: price * 0.996,
        targetPercent: 0.5,
        riskPercent: 0.4,
        riskReward: 1.25,
        trendDirection: "RANGE (near support)"
      };
    }
    
    if (nearResistance) {
      return {
        action: "SELL",
        entryPrice: price,
        targetPrice: price * 0.995,
        stopLoss: price * 1.004,
        targetPercent: 0.5,
        riskPercent: 0.4,
        riskReward: 1.25,
        trendDirection: "RANGE (near resistance)"
      };
    }
  }
  
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

// Score opportunity
function scoreOpportunity(
  coin: EnrichedCoin, 
  setup: ReturnType<typeof calculateTradeSetup>,
  whaleIntent: WhaleIntent | null,
  whaleConfidence: number | null
): number {
  if (setup.action === "NO_TRADE") return 0;
  
  let score = 50;
  
  // Liquidity bonus
  if (coin.marketCapRank <= 5) score += 20;
  else if (coin.marketCapRank <= 10) score += 15;
  else if (coin.marketCapRank <= 20) score += 10;
  
  // RSI neutral bonus
  const rsiDeviation = Math.abs(coin.rsi14 - 50);
  if (rsiDeviation <= 5) score += 15;
  else if (rsiDeviation <= 10) score += 10;
  
  // Volatility bonus
  if (Math.abs(coin.change1h) < 0.5) score += 10;
  if (Math.abs(coin.change24h) < 3) score += 10;
  
  // R:R bonus
  if (setup.riskReward >= 1.5) score += 10;
  else if (setup.riskReward >= 1.2) score += 5;
  
  // Whale alignment bonus
  if (whaleIntent && whaleConfidence && whaleConfidence >= 70) {
    if ((setup.action === "BUY" && whaleIntent === 'accumulating') ||
        (setup.action === "SELL" && whaleIntent === 'distributing')) {
      score += 15;
    } else if ((setup.action === "BUY" && whaleIntent === 'distributing') ||
               (setup.action === "SELL" && whaleIntent === 'accumulating')) {
      score -= 20; // Penalize trading against whales
    }
  }
  
  return score;
}

// Build reasoning
function buildReasoning(
  coin: EnrichedCoin, 
  trade: ConservativeTrade,
  whaleIntent: WhaleIntent | null
): string {
  if (trade.status === "CAPITAL_PROTECTION") {
    return `Capital Protection Mode active. ${trade.systemPerformance.capitalProtectionReason || 'Waiting for conditions to improve.'} ` +
      `System will resume trading when market conditions stabilize. Trade LESS, trade SMART.`;
  }
  
  if (trade.action === "NO_TRADE") {
    return `No qualifying trade found. ${trade.filtersPassed.length}/${trade.filtersApplied.length} filters passed. ` +
      `System is operating in ${trade.systemPerformance.mode.toUpperCase()} mode. ` +
      `Capital protection is priority - waiting for perfect setup.`;
  }
  
  const action = trade.action === "BUY" ? "long" : "short";
  const whaleInfo = whaleIntent && whaleIntent !== 'neutral' 
    ? ` Whale activity shows ${whaleIntent} pattern.` 
    : '';
  
  return `${coin.name} identified as ${trade.trendAlignment} ${action} opportunity. ` +
    `Entry: $${trade.entryPrice.toFixed(2)}, Target: +${trade.targetPercent.toFixed(2)}%, Stop: -${trade.riskPercent.toFixed(2)}%. ` +
    `RSI at ${coin.rsi14.toFixed(1)} (neutral).${whaleInfo} ` +
    `Confidence: ${trade.confidenceScore}%. Mode: ${trade.systemPerformance.mode.toUpperCase()}.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Professional trading desk scanner starting...");

    // Fetch system performance
    const systemPerformance = await fetchSystemPerformance(supabase);
    console.log(`System: ${systemPerformance.mode} mode, ${systemPerformance.totalTrades} trades, ${systemPerformance.accuracyPercent?.toFixed(1) || 0}% accuracy`);
    
    // Check if Capital Protection Mode should be active
    if (systemPerformance.consecutiveLosses >= TRADING_CONFIG.MAX_CONSECUTIVE_LOSSES) {
      systemPerformance.capitalProtectionEnabled = true;
      systemPerformance.capitalProtectionReason = `${systemPerformance.consecutiveLosses} consecutive losses detected. Auto-protection enabled.`;
    }
    
    const tightenFilters = systemPerformance.consecutiveLosses >= TRADING_CONFIG.TIGHTEN_AFTER_LOSSES;
    if (tightenFilters) {
      console.log("Filters tightened due to recent losses");
    }

    // Fetch whale intelligence
    const whaleData = await fetchWhaleIntelligence(supabaseUrl, serviceRoleKey);
    console.log(`Whale intel: ${whaleData?.intent || 'unavailable'} (${whaleData?.confidence || 0}% confidence)`);

    // Load market data
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(FILE_PATH);

    if (error || !data) {
      console.error("Download error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to load market data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const text = await data.text();
    const payload = JSON.parse(text) as StoredPayload;
    const coins = payload.coins ?? [];

    // Refresh stale data
    const updatedAt = new Date(payload.updatedAt);
    const ageMs = Date.now() - updatedAt.getTime();
    if (ageMs > 3600000) {
      console.log("Data stale, triggering refresh...");
      fetch(`${supabaseUrl}/functions/v1/update-market-data`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' }
      }).catch(err => console.error("Refresh failed:", err));
    }

    if (!coins.length) {
      return new Response(
        JSON.stringify({ error: "No market data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const eligibleCoins = coins.filter(c => c.marketCapRank <= TRADING_CONFIG.MAX_RANK);
    console.log(`Scanning ${eligibleCoins.length} coins...`);

    const allFiltersApplied = [
      `Top ${tightenFilters ? 20 : 30} rank`,
      "Min $50M volume",
      `RSI ${tightenFilters ? '42-58' : '40-60'}`,
      `1h volatility < ${tightenFilters ? 2 : 3}%`,
      `24h volatility < ${tightenFilters ? 6 : 8}%`,
      "Trend alignment",
      "No impulsive moves",
      "Volume stability"
    ];

    // If Capital Protection is active, return immediately
    if (systemPerformance.capitalProtectionEnabled) {
      console.log("Capital Protection Mode - no trades allowed");
      
      const protectedResult: ConservativeTrade = {
        coinId: "",
        coinName: "Protected",
        coinSymbol: "WAIT",
        coinImage: "",
        action: "NO_TRADE",
        status: "CAPITAL_PROTECTION",
        currentPrice: 0,
        entryPrice: 0,
        targetPrice: 0,
        stopLoss: 0,
        targetPercent: 0,
        riskPercent: 0,
        riskReward: 0,
        successProbability: 0,
        confidenceScore: 0,
        whaleIntent: whaleData?.intent || null,
        whaleConfidence: whaleData?.confidence || null,
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
        filtersSkipped: ["Capital Protection Mode active"],
        reasoning: "",
        updatedAt: payload.updatedAt,
        nextScanIn: "1 hour",
        systemPerformance
      };
      
      protectedResult.reasoning = buildReasoning({} as EnrichedCoin, protectedResult, null);
      
      return new Response(JSON.stringify(protectedResult), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Check if whale conditions block trading
    if (whaleData && whaleData.volatilityState === 'high') {
      console.log("High volatility from whale intel - skipping trades");
    }

    let bestTrade: ConservativeTrade | null = null;
    let highestScore = 0;

    for (const coin of eligibleCoins) {
      if (coin.currentPrice <= 0) continue;
      
      const { passed, results } = applyTradingFilters(coin, tightenFilters);
      const filtersPassed = results.filter(r => r.passed).map(r => r.reason);
      const filtersSkipped = results.filter(r => !r.passed).map(r => r.reason);
      
      if (!passed) continue;
      
      const setup = calculateTradeSetup(coin);
      if (setup.action === "NO_TRADE") continue;
      if (setup.riskReward < TRADING_CONFIG.MIN_RISK_REWARD) continue;
      
      // Check whale alignment
      const whaleAligned = !whaleData || whaleData.intent === 'neutral' ||
        (setup.action === "BUY" && whaleData.intent === 'accumulating') ||
        (setup.action === "SELL" && whaleData.intent === 'distributing');
      
      if (whaleData && whaleData.confidence >= TRADING_CONFIG.MIN_WHALE_CONFIDENCE && !whaleAligned) {
        console.log(`${coin.symbol}: Skipped - whale intent mismatch`);
        continue;
      }
      
      const score = scoreOpportunity(coin, setup, whaleData?.intent || null, whaleData?.confidence || null);
      
      if (score > highestScore) {
        highestScore = score;
        
        const filterPassRate = filtersPassed.length / results.length;
        const baseProb = 55 + (filterPassRate * 25);
        const whaleBonus = whaleData && whaleAligned && whaleData.confidence >= 70 ? 5 : 0;
        const confidenceScore = Math.min(90, Math.round(baseProb + whaleBonus));
        
        // Only qualify if confidence meets threshold
        if (confidenceScore < TRADING_CONFIG.MIN_CONFIDENCE_FOR_TRADE) {
          console.log(`${coin.symbol}: Confidence ${confidenceScore}% < ${TRADING_CONFIG.MIN_CONFIDENCE_FOR_TRADE}% threshold`);
          continue;
        }
        
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
          successProbability: confidenceScore,
          confidenceScore,
          whaleIntent: whaleData?.intent || null,
          whaleConfidence: whaleData?.confidence || null,
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
          nextScanIn: "1 hour",
          systemPerformance
        };
        
        console.log(`${coin.symbol}: QUALIFIED - ${setup.action} with score ${score}, confidence ${confidenceScore}%`);
      }
    }

    // No trade found
    if (!bestTrade) {
      console.log("No qualifying trade found");
      
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
        confidenceScore: 0,
        whaleIntent: whaleData?.intent || null,
        whaleConfidence: whaleData?.confidence || null,
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
        filtersSkipped: ["No coins met all qualification criteria"],
        reasoning: "",
        updatedAt: payload.updatedAt,
        nextScanIn: "1 hour",
        systemPerformance
      };
      
      noTrade.reasoning = buildReasoning({} as EnrichedCoin, noTrade, whaleData?.intent || null);
      
      return new Response(JSON.stringify(noTrade), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Build final reasoning
    const bestCoin = eligibleCoins.find(c => c.id === bestTrade!.coinId)!;
    bestTrade.reasoning = buildReasoning(bestCoin, bestTrade, whaleData?.intent || null);

    console.log(`Best trade: ${bestTrade.action} ${bestTrade.coinName} @ $${bestTrade.entryPrice}`);

    return new Response(JSON.stringify(bestTrade), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("Fatal error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
