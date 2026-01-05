import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET_NAME = "market-cache";
const FILE_PATH = "daily/full_market.json";

// ═══════════════════════════════════════════════════════════════════════════════
// ELITE SWING TRADING SYSTEM - Probability First, Speed Second
// Trade less, but trade better. Missing trades is better than bad trades.
// ═══════════════════════════════════════════════════════════════════════════════

const TRADING_CONFIG = {
  // Market scope - TOP 30 crypto assets by market cap and liquidity
  MAX_RANK: 30,
  MIN_VOLUME_24H: 50_000_000, // $50M minimum volume - exclude illiquid assets
  
  // ═══════ SWING TRADING - PROBABILITY SCORING ═══════
  MIN_PROBABILITY_SCORE: 70,  // Only trade if success probability >= 70%
  
  // ═══════ RISK MANAGEMENT - SWING STYLE ═══════
  MIN_STOP_LOSS: 2.0,        // Minimum 2% stop loss
  MAX_STOP_LOSS: 5.0,        // Maximum 5% stop loss
  MIN_RISK_REWARD: 2.5,      // Minimum 2.5R target
  PREFERRED_MIN_RR: 3.0,     // Prefer 3R-5R targets
  PREFERRED_MAX_RR: 5.0,     // Targets based on daily structure
  
  // ═══════ TIME SYSTEM (SWING) ═══════
  SCAN_INTERVAL: 60,              // Scan every 1 hour
  TRADE_MONITOR_INTERVAL: 15,     // Monitor active trades every 15 minutes
  ENTRY_TIMEOUT_HOURS: 24,        // Allow 24 hours for entry (swing timeframe)
  COOLDOWN_MIN_HOURS: 1,          // Minimum 1 hour after trade closes
  CAPITAL_PROTECTION_HOURS: 24,   // 24 hours pause after 3 consecutive losses
  
  // Capital protection triggers
  MAX_CONSECUTIVE_LOSSES: 3,
  TIGHTEN_AFTER_LOSSES: 2,
};

// ═══════ TYPE DEFINITIONS ═══════

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

// ═══════ STRICT OUTPUT STATES ═══════
type SystemState = "WAITING" | "TRADE_READY" | "TRADE_ACTIVE" | "TRADE_CLOSED" | "NOT_EXECUTED" | "COOLDOWN" | "CAPITAL_PROTECTION";

// ═══════ MARKET REGIMES ═══════
type MarketRegime = "TREND_UP" | "DIP_UP" | "TREND_DOWN" | "CHOPPY";

type SystemMode = "paper" | "live";
type WhaleIntent = "accumulating" | "distributing" | "neutral";

type SystemPerformance = {
  id: string;
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  accuracyPercent: number;
  consecutiveLosses: number;
  capitalProtectionEnabled: boolean;
  capitalProtectionReason: string | null;
  mode: SystemMode;
  currentState: SystemState;
  activeTradeId: string | null;
  lastTradeClosedAt: string | null;
  cooldownEndsAt: string | null;
  lastScanAt: string | null;
  lastWhaleEventAt: string | null;
  lastTradeEntryPrice: number | null;
  lastTradeExitPrice: number | null;
};

type ActiveTrade = {
  id: string;
  coinId: string;
  coinName: string;
  coinSymbol: string;
  action: "BUY" | "SELL";
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  entryType: "IMMEDIATE" | "LIMIT";
  entryFilled: boolean;
  createdAt: string;
  lastMonitoredAt: string;
};

type ScoredOpportunity = {
  coin: EnrichedCoin;
  action: TradeAction;
  probabilityScore: number;
  expectedTimeToTarget: number; // in hours
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  targetPercent: number;
  riskPercent: number;
  riskReward: number;
  trendDirection: string;
  reasonsForSelection: string[];
  filtersPassedList: string[];
};

type TradeResult = {
  coinId: string;
  coinName: string;
  coinSymbol: string;
  coinImage: string;
  action: TradeAction;
  status: SystemState;
  currentPrice: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  targetPercent: number;
  riskPercent: number;
  riskReward: number;
  probabilityScore: number;
  expectedTimeToTarget: string;
  confidenceScore: number;
  entryType: "IMMEDIATE" | "LIMIT";
  marketRegime: MarketRegime;
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
  timeUntilNextAction: string;
  systemPerformance: SystemPerformance;
  activeTrade: ActiveTrade | null;
  tradeProgress: {
    currentPnL: number;
    distanceToTarget: number;
    distanceToStop: number;
    timeInTrade: number;
    entryFilled: boolean;
    hoursUntilTimeout: number;
  } | null;
};

// ═══════ MARKET REGIME DETECTION ═══════
function detectMarketRegime(coins: EnrichedCoin[]): MarketRegime {
  const btc = coins.find(c => c.symbol.toLowerCase() === 'btc');
  const eth = coins.find(c => c.symbol.toLowerCase() === 'eth');
  
  if (!btc || !eth) return "CHOPPY";
  
  const btc7d = btc.change7d;
  const eth7d = eth.change7d;
  const btc24h = btc.change24h;
  const eth24h = eth.change24h;
  
  // TREND_UP: Both BTC and ETH trending up across timeframes
  if (btc7d > 2 && eth7d > 2 && btc24h > 0 && eth24h > 0) {
    return "TREND_UP";
  }
  
  // DIP_UP: Weekly trend up but short-term pullback (buying opportunity)
  if (btc7d > 2 && eth7d > 2 && (btc24h < -1 || btc.change1h < -0.5)) {
    return "DIP_UP";
  }
  
  // TREND_DOWN: Both BTC and ETH trending down
  if (btc7d < -2 && eth7d < -2 && btc24h < 0 && eth24h < 0) {
    return "TREND_DOWN";
  }
  
  // CHOPPY: Mixed signals, no clear direction
  return "CHOPPY";
}

// ═══════ WHALE INTELLIGENCE ═══════
async function fetchWhaleIntelligence(supabaseUrl: string, serviceRoleKey: string): Promise<{
  intent: WhaleIntent;
  confidence: number;
  shouldTrade: boolean;
  volatilityState: string;
  hasNewEvent: boolean;
} | null> {
  try {
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
    const hasNewEvent = data.confidenceScore >= 75 && data.whaleIntent?.classification !== 'neutral';
    
    return {
      intent: data.whaleIntent?.classification || 'neutral',
      confidence: data.confidenceScore || 0,
      shouldTrade: data.actionGuidance?.recommendation === 'trade',
      volatilityState: data.marketContext?.volatilityState || 'medium',
      hasNewEvent
    };
  } catch (error) {
    console.error("Error fetching whale intelligence:", error);
    return null;
  }
}

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

// ═══════ SYSTEM PERFORMANCE TRACKING ═══════
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
      id: '',
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      accuracyPercent: 0,
      consecutiveLosses: 0,
      capitalProtectionEnabled: false,
      capitalProtectionReason: null,
      mode: 'paper',
      currentState: 'WAITING',
      activeTradeId: null,
      lastTradeClosedAt: null,
      cooldownEndsAt: null,
      lastScanAt: null,
      lastWhaleEventAt: null,
      lastTradeEntryPrice: null,
      lastTradeExitPrice: null
    };
  }
  
  return {
    id: data.id,
    totalTrades: data.total_trades || 0,
    successfulTrades: data.successful_trades || 0,
    failedTrades: data.failed_trades || 0,
    accuracyPercent: data.accuracy_percent || 0,
    consecutiveLosses: data.consecutive_losses || 0,
    capitalProtectionEnabled: data.capital_protection_enabled || false,
    capitalProtectionReason: data.capital_protection_reason || null,
    mode: data.mode || 'paper',
    currentState: data.current_state || 'WAITING',
    activeTradeId: data.active_trade_id || null,
    lastTradeClosedAt: data.last_trade_closed_at || null,
    cooldownEndsAt: data.cooldown_ends_at || null,
    lastScanAt: data.last_scan_at || null,
    lastWhaleEventAt: data.last_whale_event_at || null,
    lastTradeEntryPrice: data.last_trade_entry_price || null,
    lastTradeExitPrice: data.last_trade_exit_price || null
  };
}

// ═══════ ACTIVE TRADE HANDLING ═══════
async function fetchActiveTrade(supabase: any, tradeId: string): Promise<ActiveTrade | null> {
  const { data, error } = await supabase
    .from('trade_history')
    .select('*')
    .eq('id', tradeId)
    .eq('result', 'PENDING')
    .single();
  
  if (error || !data) return null;
  
  return {
    id: data.id,
    coinId: data.coin_id,
    coinName: data.coin_name,
    coinSymbol: data.coin_symbol,
    action: data.action,
    entryPrice: parseFloat(data.entry_price),
    targetPrice: parseFloat(data.target_price),
    stopLoss: parseFloat(data.stop_loss),
    entryType: data.reasoning?.includes('IMMEDIATE') ? 'IMMEDIATE' : 'LIMIT',
    entryFilled: data.reasoning?.includes('FILLED') || data.reasoning?.includes('IMMEDIATE') || false,
    createdAt: data.created_at,
    lastMonitoredAt: data.last_monitored_at
  };
}

// ═══════ STATE UPDATES ═══════
async function updateSystemState(
  supabase: any, 
  performanceId: string, 
  updates: Record<string, any>
) {
  if (!performanceId) {
    const { data, error } = await supabase
      .from('system_performance')
      .insert({ 
        ...updates, 
        last_updated_at: new Date().toISOString() 
      })
      .select('id')
      .single();
    
    if (error) console.error("Failed to create system performance:", error);
    return data?.id;
  }
  
  const { error } = await supabase
    .from('system_performance')
    .update({ ...updates, last_updated_at: new Date().toISOString() })
    .eq('id', performanceId);
  
  if (error) console.error("Failed to update system state:", error);
}

async function createTradeRecord(supabase: any, trade: TradeResult): Promise<string | null> {
  const { data, error } = await supabase
    .from('trade_history')
    .insert({
      coin_id: trade.coinId,
      coin_name: trade.coinName,
      coin_symbol: trade.coinSymbol,
      action: trade.action,
      entry_price: trade.entryPrice,
      target_price: trade.targetPrice,
      stop_loss: trade.stopLoss,
      confidence_score: trade.confidenceScore,
      whale_intent: trade.whaleIntent,
      reasoning: `${trade.entryType} entry | Prob: ${trade.probabilityScore}% | ETA: ${trade.expectedTimeToTarget} | ${trade.reasoning}`,
      result: 'PENDING',
      capital_protection_active: false,
      last_monitored_at: new Date().toISOString()
    })
    .select('id')
    .single();
  
  if (error) {
    console.error("Failed to create trade record:", error);
    return null;
  }
  
  return data.id;
}

async function closeTrade(
  supabase: any, 
  tradeId: string, 
  result: 'SUCCESS' | 'FAILED' | 'NOT_EXECUTED',
  exitPrice: number,
  entryPrice: number,
  action: 'BUY' | 'SELL'
): Promise<void> {
  const profitLossPercent = result === 'NOT_EXECUTED' ? 0 :
    action === 'BUY' 
      ? ((exitPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - exitPrice) / entryPrice) * 100;
  
  await supabase
    .from('trade_history')
    .update({
      result,
      exit_price: result === 'NOT_EXECUTED' ? null : exitPrice,
      profit_loss_percent: profitLossPercent,
      closed_at: new Date().toISOString()
    })
    .eq('id', tradeId);
}

// ═══════ COOLDOWN LOGIC ═══════
function checkCooldownExit(
  systemPerformance: SystemPerformance,
  whaleData: { hasNewEvent: boolean; volatilityState: string } | null
): { canExit: boolean; reason: string } {
  const now = new Date();
  
  // Must wait minimum cooldown hours
  if (systemPerformance.cooldownEndsAt) {
    const cooldownEnd = new Date(systemPerformance.cooldownEndsAt);
    if (now < cooldownEnd) {
      const hoursLeft = Math.ceil((cooldownEnd.getTime() - now.getTime()) / 3600000);
      return { canExit: false, reason: `Minimum cooldown: ${hoursLeft}h remaining` };
    }
  }
  
  // Check exit conditions
  const conditions: string[] = [];
  
  if (whaleData?.hasNewEvent) {
    conditions.push("New whale transaction detected");
  }
  
  if (whaleData?.volatilityState === 'low' || whaleData?.volatilityState === 'medium') {
    conditions.push("Volatility normalized");
  }
  
  // In swing trading, we can exit cooldown after minimum time if conditions are good
  if (systemPerformance.lastTradeClosedAt) {
    const hoursSinceClose = (Date.now() - new Date(systemPerformance.lastTradeClosedAt).getTime()) / 3600000;
    if (hoursSinceClose >= TRADING_CONFIG.COOLDOWN_MIN_HOURS) {
      conditions.push("Minimum cooldown passed");
    }
  }
  
  if (conditions.length > 0) {
    return { canExit: true, reason: conditions[0] };
  }
  
  return { canExit: false, reason: "Waiting for cooldown to end or market conditions to improve" };
}

// ═══════ STAGE 1: SETUP FILTERING ═══════
function passesSetupFiltering(coin: EnrichedCoin, regime: MarketRegime): { passes: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const failures: string[] = [];
  
  // 1. Trend alignment with 4H/1D (approximated by 24h and 7d trends)
  const trend24h = coin.change24h;
  const trend7d = coin.change7d;
  const trend30d = coin.change30d;
  
  const bullishTrend = trend24h > -1 && trend7d > 0 && (trend30d === undefined || trend30d > -5);
  const bearishTrend = trend24h < 1 && trend7d < 0 && (trend30d === undefined || trend30d < 5);
  
  if (regime === 'TREND_UP' || regime === 'DIP_UP') {
    if (bullishTrend) {
      reasons.push(`Aligned with uptrend (7d: +${trend7d.toFixed(1)}%)`);
    } else {
      failures.push(`Not aligned with 4H/1D trend (7d: ${trend7d.toFixed(1)}%)`);
    }
  } else if (regime === 'TREND_DOWN') {
    if (bearishTrend) {
      reasons.push(`Aligned with downtrend (7d: ${trend7d.toFixed(1)}%)`);
    } else {
      failures.push(`Not aligned with downtrend`);
    }
  } else {
    // CHOPPY - only accept very clean setups
    if (Math.abs(trend7d) < 3) {
      failures.push(`Choppy market - unclear trend direction`);
    } else {
      reasons.push(`Clear direction despite choppy regime`);
    }
  }
  
  // 2. Clean market structure (RSI not extreme)
  if (coin.rsi14 >= 35 && coin.rsi14 <= 65) {
    reasons.push(`Clean RSI structure (${coin.rsi14.toFixed(1)})`);
  } else {
    failures.push(`RSI at extreme levels (${coin.rsi14.toFixed(1)})`);
  }
  
  // 3. No major resistance overhead (approximated by ATH distance)
  // For swing trades, we check if price isn't at recent highs with low momentum
  const volatilityCheck = Math.abs(coin.change1h) < 2 && Math.abs(coin.change24h) < 8;
  if (volatilityCheck) {
    reasons.push("Stable volatility - no news spike");
  } else {
    failures.push(`Volatile conditions (1h: ${coin.change1h.toFixed(1)}%, 24h: ${coin.change24h.toFixed(1)}%)`);
  }
  
  // 4. Volume confirmation
  if (coin.volumeToMcap > 0.04) {
    reasons.push(`Strong volume confirmation (${(coin.volumeToMcap * 100).toFixed(1)}% vol/mcap)`);
  } else if (coin.volumeToMcap > 0.025) {
    reasons.push("Adequate volume");
  } else {
    failures.push(`Low volume (${(coin.volumeToMcap * 100).toFixed(2)}% vol/mcap)`);
  }
  
  // 5. Liquidity check
  if (coin.volume24h >= TRADING_CONFIG.MIN_VOLUME_24H) {
    reasons.push(`Liquid ($${(coin.volume24h / 1_000_000).toFixed(0)}M vol)`);
  } else {
    failures.push(`Illiquid ($${(coin.volume24h / 1_000_000).toFixed(0)}M vol)`);
  }
  
  // Must pass all filters
  const passes = failures.length === 0;
  
  return { passes, reasons: passes ? reasons : failures };
}

// ═══════ STAGE 2: SUCCESS PROBABILITY SCORING ═══════
function calculateProbabilityScore(
  coin: EnrichedCoin,
  regime: MarketRegime,
  action: TradeAction,
  whaleIntent: WhaleIntent | null,
  whaleConfidence: number | null
): number {
  if (action === "NO_TRADE") return 0;
  
  let score = 40; // Base score
  
  // 1. Trend strength and consistency (+25 max)
  const trend7d = coin.change7d;
  const trend24h = coin.change24h;
  const trend30d = coin.change30d || 0;
  
  if (action === "BUY") {
    if (trend7d > 5 && trend24h > 0) score += 20;
    else if (trend7d > 2 && trend24h > -1) score += 15;
    else if (trend7d > 0) score += 8;
    
    if (trend30d > 5) score += 5;
  } else {
    if (trend7d < -5 && trend24h < 0) score += 20;
    else if (trend7d < -2 && trend24h < 1) score += 15;
    else if (trend7d < 0) score += 8;
    
    if (trend30d < -5) score += 5;
  }
  
  // 2. Structure quality - RSI position (+15 max)
  const rsiDeviation = Math.abs(coin.rsi14 - 50);
  if (rsiDeviation <= 8) score += 15;
  else if (rsiDeviation <= 15) score += 10;
  else if (rsiDeviation <= 20) score += 5;
  
  // 3. Volume and whale alignment (+20 max)
  if (coin.volumeToMcap > 0.08) score += 10;
  else if (coin.volumeToMcap > 0.05) score += 7;
  else if (coin.volumeToMcap > 0.03) score += 4;
  
  if (whaleIntent && whaleConfidence && whaleConfidence >= 70) {
    if ((action === "BUY" && whaleIntent === 'accumulating') ||
        (action === "SELL" && whaleIntent === 'distributing')) {
      score += 10;
    } else if ((action === "BUY" && whaleIntent === 'distributing') ||
               (action === "SELL" && whaleIntent === 'accumulating')) {
      score -= 15;
    }
  }
  
  // 4. Risk clarity - ATR stability (+10 max)
  if (coin.atr14 >= 1.5 && coin.atr14 <= 4) score += 10;
  else if (coin.atr14 >= 1 && coin.atr14 <= 6) score += 5;
  
  // 5. Market regime alignment (+10 max)
  if (regime === "TREND_UP" && action === "BUY") score += 10;
  else if (regime === "DIP_UP" && action === "BUY") score += 10;
  else if (regime === "TREND_DOWN" && action === "SELL") score += 10;
  else if (regime === "CHOPPY") score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

// ═══════ STAGE 3: SPEED OPTIMIZATION - Expected Time to Target ═══════
function calculateExpectedTimeToTarget(coin: EnrichedCoin, targetPercent: number): number {
  // Calculate based on ATR expansion, recent impulse speed, and distance to target
  
  // Average daily range from ATR
  const dailyRangePercent = coin.atr14 || 2;
  
  // Recent impulse speed (24h and 7d movement)
  const recentSpeedDaily = Math.abs(coin.change24h);
  const avgSpeedDaily = Math.abs(coin.change7d) / 7;
  
  // Weighted average speed
  const weightedSpeed = (recentSpeedDaily * 0.6) + (avgSpeedDaily * 0.4);
  const effectiveSpeed = Math.max(weightedSpeed, dailyRangePercent * 0.3);
  
  // Estimate hours to target
  const daysToTarget = targetPercent / effectiveSpeed;
  const hoursToTarget = daysToTarget * 24;
  
  // Clamp between 4 hours and 7 days
  return Math.max(4, Math.min(168, hoursToTarget));
}

// ═══════ TRADE SETUP CALCULATION - SWING STYLE ═══════
function calculateSwingTradeSetup(
  coin: EnrichedCoin,
  regime: MarketRegime
): {
  action: TradeAction;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  targetPercent: number;
  riskPercent: number;
  riskReward: number;
  trendDirection: string;
  entryType: "IMMEDIATE" | "LIMIT";
} | null {
  const price = coin.currentPrice;
  const atr = coin.atr14;
  
  // Determine action based on regime and coin trend
  let action: TradeAction = "NO_TRADE";
  let trendDirection = "UNCLEAR";
  
  const bullish = coin.change24h > -1 && coin.change7d > 0;
  const bearish = coin.change24h < 1 && coin.change7d < 0;
  
  if (regime === "TREND_UP" || regime === "DIP_UP") {
    if (bullish) {
      action = "BUY";
      trendDirection = regime === "DIP_UP" ? "SWING BUY - DIP IN UPTREND" : "SWING BUY - TREND CONTINUATION";
    }
  } else if (regime === "TREND_DOWN") {
    if (bearish) {
      action = "SELL";
      trendDirection = "SWING SELL - DOWNTREND";
    }
  } else if (regime === "CHOPPY") {
    // Only very clear setups in choppy markets
    if (bullish && coin.rsi14 < 50 && coin.change7d > 3) {
      action = "BUY";
      trendDirection = "SWING BUY - OVERSOLD BOUNCE";
    } else if (bearish && coin.rsi14 > 50 && coin.change7d < -3) {
      action = "SELL";
      trendDirection = "SWING SELL - OVERBOUGHT FADE";
    }
  }
  
  if (action === "NO_TRADE") {
    return null;
  }
  
  // ═══════ SWING ENTRY LOGIC ═══════
  // For swing trades, we prefer shallow retracements or market entry
  // Do NOT wait for deep pullbacks
  
  const shallowPullback = atr * 0.15; // 15% of ATR for shallow entry
  let entryPrice: number;
  let entryType: "IMMEDIATE" | "LIMIT";
  
  // Check if we're at a good entry point (near support/resistance)
  const nearGoodEntry = Math.abs(coin.change1h) < 0.5 && 
                        Math.abs(coin.change24h - coin.change7d / 7) < 2;
  
  if (nearGoodEntry) {
    entryPrice = price;
    entryType = "IMMEDIATE";
  } else {
    entryPrice = action === "BUY" 
      ? price * (1 - shallowPullback / 100)
      : price * (1 + shallowPullback / 100);
    entryType = "LIMIT";
  }
  
  // ═══════ SWING STOP LOSS (2-5%) ═══════
  // Place stop below higher-timeframe structure
  const riskPercent = Math.max(
    TRADING_CONFIG.MIN_STOP_LOSS,
    Math.min(TRADING_CONFIG.MAX_STOP_LOSS, atr * 0.8)
  );
  
  const stopLoss = action === "BUY"
    ? entryPrice * (1 - riskPercent / 100)
    : entryPrice * (1 + riskPercent / 100);
  
  // ═══════ SWING TAKE PROFIT (2.5R - 5R) ═══════
  // Targets based on daily structure or range expansion
  const minTargetPercent = riskPercent * TRADING_CONFIG.MIN_RISK_REWARD;
  const preferredTargetPercent = riskPercent * TRADING_CONFIG.PREFERRED_MIN_RR;
  
  // Use the larger of minimum and ATR-based target
  const targetPercent = Math.min(
    riskPercent * TRADING_CONFIG.PREFERRED_MAX_RR,
    Math.max(minTargetPercent, preferredTargetPercent, atr * 1.5)
  );
  
  const targetPrice = action === "BUY"
    ? entryPrice * (1 + targetPercent / 100)
    : entryPrice * (1 - targetPercent / 100);
  
  const riskReward = targetPercent / riskPercent;
  
  // Validate minimum R:R
  if (riskReward < TRADING_CONFIG.MIN_RISK_REWARD) {
    return null;
  }
  
  return {
    action,
    entryPrice,
    targetPrice,
    stopLoss,
    targetPercent,
    riskPercent,
    riskReward,
    trendDirection,
    entryType
  };
}

function formatTimeRemaining(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes}m`;
  }
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER - Elite Swing Trading System
// ═══════════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    console.log("═══════════════════════════════════════════════════════");
    console.log("    ELITE SWING TRADING SYSTEM - PROBABILITY FIRST");
    console.log("═══════════════════════════════════════════════════════");

    // Fetch system performance
    let systemPerformance = await fetchSystemPerformance(supabase);
    
    // Ensure we have a performance record
    if (!systemPerformance.id) {
      const newId = await updateSystemState(supabaseAdmin, '', {
        current_state: 'WAITING',
        mode: 'paper',
        total_trades: 0,
        successful_trades: 0,
        failed_trades: 0
      });
      if (newId) systemPerformance.id = newId;
    }
    
    console.log(`State: ${systemPerformance.currentState} | Mode: ${systemPerformance.mode} | Trades: ${systemPerformance.totalTrades} | Win Rate: ${systemPerformance.accuracyPercent?.toFixed(1) || 0}%`);
    
    // Check for Capital Protection (24 hour pause)
    if (systemPerformance.consecutiveLosses >= TRADING_CONFIG.MAX_CONSECUTIVE_LOSSES) {
      systemPerformance.capitalProtectionEnabled = true;
      systemPerformance.capitalProtectionReason = `${systemPerformance.consecutiveLosses} consecutive losses - 24h pause`;
      systemPerformance.currentState = 'CAPITAL_PROTECTION';
    }
    
    // Fetch whale intelligence
    const whaleData = await fetchWhaleIntelligence(supabaseUrl, serviceRoleKey);
    console.log(`Whale: ${whaleData?.intent || 'unavailable'} (${whaleData?.confidence || 0}%)`);

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

    // Refresh stale data in background
    const updatedAt = new Date(payload.updatedAt);
    const ageMs = Date.now() - updatedAt.getTime();
    if (ageMs > 3600000) {
      console.log("Data stale, triggering background refresh...");
      fetch(`${supabaseUrl}/functions/v1/update-market-data`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' }
      }).catch(err => console.error("Refresh failed:", err));
    }

    if (!coins.length) {
      return new Response(
        JSON.stringify({ error: "No market data available" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Detect market regime
    const marketRegime = detectMarketRegime(coins);
    console.log(`Market Regime: ${marketRegime}`);
    
    const eligibleCoins = coins.filter(c => c.marketCapRank <= TRADING_CONFIG.MAX_RANK);
    const allFiltersApplied = [
      "4H/1D trend alignment",
      "Clean market structure",
      "No major resistance overhead",
      "Volume confirmation",
      "Stable volatility",
      "Top 30 rank"
    ];

    // ═══════════════════════════════════════════════════════════════════════════════
    // STATE MACHINE - SWING TRADING
    // ═══════════════════════════════════════════════════════════════════════════════
    
    // ═══════ STATE: CAPITAL_PROTECTION (24 hour pause) ═══════
    if (systemPerformance.currentState === 'CAPITAL_PROTECTION' || systemPerformance.capitalProtectionEnabled) {
      console.log("═══ CAPITAL PROTECTION MODE - 24H PAUSE ═══");
      
      await updateSystemState(supabaseAdmin, systemPerformance.id, {
        last_scan_at: new Date().toISOString(),
        current_state: 'CAPITAL_PROTECTION'
      });
      
      const lastScan = systemPerformance.lastScanAt ? new Date(systemPerformance.lastScanAt) : new Date(0);
      const hoursSinceLastScan = (Date.now() - lastScan.getTime()) / 3600000;
      const nextReevaluate = Math.max(0, TRADING_CONFIG.CAPITAL_PROTECTION_HOURS - hoursSinceLastScan);
      
      const result: TradeResult = {
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
        probabilityScore: 0,
        expectedTimeToTarget: "N/A",
        confidenceScore: 0,
        entryType: "LIMIT",
        marketRegime,
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
        filtersSkipped: ["Capital Protection Mode - 24h pause"],
        reasoning: `CAPITAL PROTECTION MODE. ${systemPerformance.capitalProtectionReason}. Re-evaluating market conditions in ${formatTimeRemaining(nextReevaluate)}. Probability first > trade frequency.`,
        updatedAt: payload.updatedAt,
        nextScanIn: formatTimeRemaining(TRADING_CONFIG.CAPITAL_PROTECTION_HOURS),
        timeUntilNextAction: formatTimeRemaining(nextReevaluate),
        systemPerformance,
        activeTrade: null,
        tradeProgress: null
      };
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ═══════ STATE: TRADE_ACTIVE - Monitor existing trade (every 15 min) ═══════
    if ((systemPerformance.currentState === 'TRADE_ACTIVE' || systemPerformance.currentState === 'TRADE_READY') && systemPerformance.activeTradeId) {
      console.log("═══ TRADE ACTIVE - MONITORING (15m interval) ═══");
      
      const activeTrade = await fetchActiveTrade(supabase, systemPerformance.activeTradeId);
      
      if (!activeTrade) {
        console.log("Active trade not found, entering cooldown");
        await updateSystemState(supabaseAdmin, systemPerformance.id, {
          current_state: 'COOLDOWN',
          active_trade_id: null,
          last_trade_closed_at: new Date().toISOString(),
          cooldown_ends_at: new Date(Date.now() + TRADING_CONFIG.COOLDOWN_MIN_HOURS * 3600000).toISOString()
        });
        systemPerformance.currentState = 'COOLDOWN';
      } else {
        const tradedCoin = coins.find(c => c.id === activeTrade.coinId);
        const currentPrice = tradedCoin?.currentPrice || activeTrade.entryPrice;
        const hoursInTrade = (Date.now() - new Date(activeTrade.createdAt).getTime()) / 3600000;
        const hoursUntilTimeout = TRADING_CONFIG.ENTRY_TIMEOUT_HOURS - hoursInTrade;
        
        // ═══════ ENTRY TIMEOUT CHECK (24 hours for swing) ═══════
        if (!activeTrade.entryFilled && activeTrade.entryType === 'LIMIT') {
          const entryReached = activeTrade.action === 'BUY'
            ? currentPrice <= activeTrade.entryPrice
            : currentPrice >= activeTrade.entryPrice;
          
          if (entryReached) {
            activeTrade.entryFilled = true;
            await supabaseAdmin
              .from('trade_history')
              .update({ 
                reasoning: `LIMIT FILLED at $${currentPrice.toFixed(2)}`,
                last_monitored_at: new Date().toISOString() 
              })
              .eq('id', activeTrade.id);
            console.log(`Entry FILLED at $${currentPrice}`);
          } else if (hoursInTrade >= TRADING_CONFIG.ENTRY_TIMEOUT_HOURS) {
            console.log("Entry timeout - marking as NOT_EXECUTED");
            
            await closeTrade(supabaseAdmin, activeTrade.id, 'NOT_EXECUTED', currentPrice, activeTrade.entryPrice, activeTrade.action);
            
            await updateSystemState(supabaseAdmin, systemPerformance.id, {
              current_state: 'WAITING',
              active_trade_id: null,
              last_scan_at: new Date().toISOString()
            });
            
            const notExecutedResult: TradeResult = {
              coinId: activeTrade.coinId,
              coinName: activeTrade.coinName,
              coinSymbol: activeTrade.coinSymbol,
              coinImage: tradedCoin?.image || "",
              action: activeTrade.action,
              status: "NOT_EXECUTED",
              currentPrice,
              entryPrice: activeTrade.entryPrice,
              targetPrice: activeTrade.targetPrice,
              stopLoss: activeTrade.stopLoss,
              targetPercent: Math.abs((activeTrade.targetPrice - activeTrade.entryPrice) / activeTrade.entryPrice * 100),
              riskPercent: Math.abs((activeTrade.entryPrice - activeTrade.stopLoss) / activeTrade.entryPrice * 100),
              riskReward: Math.abs((activeTrade.targetPrice - activeTrade.entryPrice) / (activeTrade.entryPrice - activeTrade.stopLoss)),
              probabilityScore: 0,
              expectedTimeToTarget: "N/A",
              confidenceScore: 0,
              entryType: activeTrade.entryType,
              marketRegime,
              whaleIntent: whaleData?.intent || null,
              whaleConfidence: whaleData?.confidence || null,
              rsi14: tradedCoin?.rsi14 || 0,
              atr14: tradedCoin?.atr14 || 0,
              priceChange1h: tradedCoin?.change1h || 0,
              priceChange24h: tradedCoin?.change24h || 0,
              priceChange7d: tradedCoin?.change7d || 0,
              volume24h: tradedCoin?.volume24h || 0,
              marketCap: tradedCoin?.marketCap || 0,
              marketCapRank: tradedCoin?.marketCapRank || 0,
              trendAlignment: "NOT_EXECUTED",
              filtersApplied: [],
              filtersPassed: [],
              filtersSkipped: [],
              reasoning: `Trade NOT EXECUTED. Entry price $${activeTrade.entryPrice.toFixed(2)} not reached within ${TRADING_CONFIG.ENTRY_TIMEOUT_HOURS}h timeout. Missing a trade is acceptable. Resuming scan.`,
              updatedAt: payload.updatedAt,
              nextScanIn: formatTimeRemaining(TRADING_CONFIG.SCAN_INTERVAL / 60),
              timeUntilNextAction: "Resuming scan",
              systemPerformance,
              activeTrade: null,
              tradeProgress: null
            };
            
            return new Response(JSON.stringify(notExecutedResult), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
        }
        
        // Calculate P&L (only if entry is filled or immediate)
        const entryFilled = activeTrade.entryType === 'IMMEDIATE' || activeTrade.entryFilled;
        const pnl = entryFilled
          ? (activeTrade.action === 'BUY'
              ? ((currentPrice - activeTrade.entryPrice) / activeTrade.entryPrice) * 100
              : ((activeTrade.entryPrice - currentPrice) / activeTrade.entryPrice) * 100)
          : 0;
        
        const distanceToTarget = activeTrade.action === 'BUY'
          ? ((activeTrade.targetPrice - currentPrice) / currentPrice) * 100
          : ((currentPrice - activeTrade.targetPrice) / currentPrice) * 100;
        
        const distanceToStop = activeTrade.action === 'BUY'
          ? ((currentPrice - activeTrade.stopLoss) / currentPrice) * 100
          : ((activeTrade.stopLoss - currentPrice) / currentPrice) * 100;
        
        // Check SL/TP hit - DO NOT EXIT EARLY
        let tradeResult: 'SUCCESS' | 'FAILED' | null = null;
        
        if (entryFilled) {
          if (activeTrade.action === 'BUY') {
            if (currentPrice >= activeTrade.targetPrice) tradeResult = 'SUCCESS';
            else if (currentPrice <= activeTrade.stopLoss) tradeResult = 'FAILED';
          } else {
            if (currentPrice <= activeTrade.targetPrice) tradeResult = 'SUCCESS';
            else if (currentPrice >= activeTrade.stopLoss) tradeResult = 'FAILED';
          }
        }
        
        if (tradeResult) {
          console.log(`Trade ${tradeResult}: ${activeTrade.coinSymbol} at $${currentPrice}`);
          
          await closeTrade(supabaseAdmin, activeTrade.id, tradeResult, currentPrice, activeTrade.entryPrice, activeTrade.action);
          
          const newConsecutiveLosses = tradeResult === 'FAILED' ? systemPerformance.consecutiveLosses + 1 : 0;
          const newSuccessful = tradeResult === 'SUCCESS' ? systemPerformance.successfulTrades + 1 : systemPerformance.successfulTrades;
          const newFailed = tradeResult === 'FAILED' ? systemPerformance.failedTrades + 1 : systemPerformance.failedTrades;
          const newTotal = systemPerformance.totalTrades + 1;
          const newAccuracy = newTotal > 0 ? (newSuccessful / newTotal) * 100 : 0;
          
          const rMultiple = pnl / Math.abs((activeTrade.entryPrice - activeTrade.stopLoss) / activeTrade.entryPrice * 100);
          
          await updateSystemState(supabaseAdmin, systemPerformance.id, {
            current_state: 'TRADE_CLOSED',
            active_trade_id: null,
            last_trade_closed_at: new Date().toISOString(),
            cooldown_ends_at: new Date(Date.now() + TRADING_CONFIG.COOLDOWN_MIN_HOURS * 3600000).toISOString(),
            consecutive_losses: newConsecutiveLosses,
            successful_trades: newSuccessful,
            failed_trades: newFailed,
            total_trades: newTotal,
            accuracy_percent: newAccuracy,
            last_trade_entry_price: activeTrade.entryPrice,
            last_trade_exit_price: currentPrice,
            capital_protection_enabled: newConsecutiveLosses >= TRADING_CONFIG.MAX_CONSECUTIVE_LOSSES,
            capital_protection_reason: newConsecutiveLosses >= TRADING_CONFIG.MAX_CONSECUTIVE_LOSSES 
              ? `${newConsecutiveLosses} consecutive losses - 24h pause` 
              : null
          });
          
          const closedResult: TradeResult = {
            coinId: activeTrade.coinId,
            coinName: activeTrade.coinName,
            coinSymbol: activeTrade.coinSymbol,
            coinImage: tradedCoin?.image || "",
            action: activeTrade.action,
            status: "TRADE_CLOSED",
            currentPrice,
            entryPrice: activeTrade.entryPrice,
            targetPrice: activeTrade.targetPrice,
            stopLoss: activeTrade.stopLoss,
            targetPercent: Math.abs((activeTrade.targetPrice - activeTrade.entryPrice) / activeTrade.entryPrice * 100),
            riskPercent: Math.abs((activeTrade.entryPrice - activeTrade.stopLoss) / activeTrade.entryPrice * 100),
            riskReward: Math.abs((activeTrade.targetPrice - activeTrade.entryPrice) / (activeTrade.entryPrice - activeTrade.stopLoss)),
            probabilityScore: 0,
            expectedTimeToTarget: "N/A",
            confidenceScore: 0,
            entryType: activeTrade.entryType,
            marketRegime,
            whaleIntent: whaleData?.intent || null,
            whaleConfidence: whaleData?.confidence || null,
            rsi14: tradedCoin?.rsi14 || 0,
            atr14: tradedCoin?.atr14 || 0,
            priceChange1h: tradedCoin?.change1h || 0,
            priceChange24h: tradedCoin?.change24h || 0,
            priceChange7d: tradedCoin?.change7d || 0,
            volume24h: tradedCoin?.volume24h || 0,
            marketCap: tradedCoin?.marketCap || 0,
            marketCapRank: tradedCoin?.marketCapRank || 0,
            trendAlignment: tradeResult,
            filtersApplied: [],
            filtersPassed: [],
            filtersSkipped: [],
            reasoning: `Trade CLOSED: ${tradeResult}. ${tradeResult === 'SUCCESS' ? 'Target' : 'Stop loss'} hit at $${currentPrice.toFixed(2)}. P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}% (${rMultiple.toFixed(1)}R). Duration: ${formatTimeRemaining(hoursInTrade)}. Entering cooldown.`,
            updatedAt: payload.updatedAt,
            nextScanIn: formatTimeRemaining(TRADING_CONFIG.COOLDOWN_MIN_HOURS),
            timeUntilNextAction: "Entering cooldown",
            systemPerformance: {
              ...systemPerformance,
              totalTrades: newTotal,
              successfulTrades: newSuccessful,
              failedTrades: newFailed,
              accuracyPercent: newAccuracy,
              consecutiveLosses: newConsecutiveLosses
            },
            activeTrade: null,
            tradeProgress: {
              currentPnL: pnl,
              distanceToTarget: 0,
              distanceToStop: 0,
              timeInTrade: hoursInTrade,
              entryFilled: true,
              hoursUntilTimeout: 0
            }
          };
          
          return new Response(JSON.stringify(closedResult), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        
        // Update monitoring timestamp
        await supabaseAdmin
          .from('trade_history')
          .update({ last_monitored_at: new Date().toISOString() })
          .eq('id', activeTrade.id);
        
        // Return active trade status
        const result: TradeResult = {
          coinId: activeTrade.coinId,
          coinName: activeTrade.coinName,
          coinSymbol: activeTrade.coinSymbol,
          coinImage: tradedCoin?.image || "",
          action: activeTrade.action,
          status: "TRADE_ACTIVE",
          currentPrice,
          entryPrice: activeTrade.entryPrice,
          targetPrice: activeTrade.targetPrice,
          stopLoss: activeTrade.stopLoss,
          targetPercent: Math.abs((activeTrade.targetPrice - activeTrade.entryPrice) / activeTrade.entryPrice * 100),
          riskPercent: Math.abs((activeTrade.entryPrice - activeTrade.stopLoss) / activeTrade.entryPrice * 100),
          riskReward: Math.abs((activeTrade.targetPrice - activeTrade.entryPrice) / (activeTrade.entryPrice - activeTrade.stopLoss)),
          probabilityScore: 0,
          expectedTimeToTarget: "Monitoring",
          confidenceScore: 0,
          entryType: activeTrade.entryType,
          marketRegime,
          whaleIntent: whaleData?.intent || null,
          whaleConfidence: whaleData?.confidence || null,
          rsi14: tradedCoin?.rsi14 || 0,
          atr14: tradedCoin?.atr14 || 0,
          priceChange1h: tradedCoin?.change1h || 0,
          priceChange24h: tradedCoin?.change24h || 0,
          priceChange7d: tradedCoin?.change7d || 0,
          volume24h: tradedCoin?.volume24h || 0,
          marketCap: tradedCoin?.marketCap || 0,
          marketCapRank: tradedCoin?.marketCapRank || 0,
          trendAlignment: "HOLDING",
          filtersApplied: [],
          filtersPassed: [],
          filtersSkipped: [],
          reasoning: entryFilled 
            ? `HOLDING ${activeTrade.action} ${activeTrade.coinSymbol} | P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}% | Target: ${distanceToTarget.toFixed(2)}% away | Stop: ${distanceToStop.toFixed(2)}% buffer | Duration: ${formatTimeRemaining(hoursInTrade)}`
            : `WAITING FOR ENTRY | Limit order at $${activeTrade.entryPrice.toFixed(2)} | Current: $${currentPrice.toFixed(2)} | Timeout in ${formatTimeRemaining(hoursUntilTimeout)}`,
          updatedAt: payload.updatedAt,
          nextScanIn: `${TRADING_CONFIG.TRADE_MONITOR_INTERVAL}m`,
          timeUntilNextAction: `Monitoring every ${TRADING_CONFIG.TRADE_MONITOR_INTERVAL}m`,
          systemPerformance,
          activeTrade,
          tradeProgress: {
            currentPnL: pnl,
            distanceToTarget,
            distanceToStop,
            timeInTrade: hoursInTrade,
            entryFilled,
            hoursUntilTimeout: Math.max(0, hoursUntilTimeout)
          }
        };
        
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ═══════ STATE: COOLDOWN or TRADE_CLOSED ═══════
    if (systemPerformance.currentState === 'COOLDOWN' || systemPerformance.currentState === 'TRADE_CLOSED') {
      console.log("═══ COOLDOWN STATE ═══");
      
      const cooldownCheck = checkCooldownExit(systemPerformance, whaleData);
      
      if (!cooldownCheck.canExit) {
        const cooldownEnd = systemPerformance.cooldownEndsAt ? new Date(systemPerformance.cooldownEndsAt) : new Date();
        const hoursLeft = Math.max(0, (cooldownEnd.getTime() - Date.now()) / 3600000);
        
        const result: TradeResult = {
          coinId: "",
          coinName: "Cooldown",
          coinSymbol: "WAIT",
          coinImage: "",
          action: "NO_TRADE",
          status: "COOLDOWN",
          currentPrice: 0,
          entryPrice: 0,
          targetPrice: 0,
          stopLoss: 0,
          targetPercent: 0,
          riskPercent: 0,
          riskReward: 0,
          probabilityScore: 0,
          expectedTimeToTarget: "N/A",
          confidenceScore: 0,
          entryType: "LIMIT",
          marketRegime,
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
          filtersSkipped: ["Cooldown active"],
          reasoning: `COOLDOWN active. ${cooldownCheck.reason}. Trade less, but trade better.`,
          updatedAt: payload.updatedAt,
          nextScanIn: formatTimeRemaining(hoursLeft),
          timeUntilNextAction: cooldownCheck.reason,
          systemPerformance,
          activeTrade: null,
          tradeProgress: null
        };
        
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      
      console.log(`Exiting cooldown: ${cooldownCheck.reason}`);
      await updateSystemState(supabaseAdmin, systemPerformance.id, {
        current_state: 'WAITING',
        cooldown_ends_at: null,
        last_scan_at: new Date().toISOString()
      });
      systemPerformance.currentState = 'WAITING';
    }

    // ═══════ STATE: WAITING - Scan for opportunities (every 1 hour) ═══════
    console.log("═══ WAITING STATE - SCANNING (1h interval) ═══");
    console.log(`Market Regime: ${marketRegime} | Min Probability Required: ${TRADING_CONFIG.MIN_PROBABILITY_SCORE}%`);
    
    await updateSystemState(supabaseAdmin, systemPerformance.id, {
      last_scan_at: new Date().toISOString(),
      current_state: 'WAITING'
    });

    // ═══════ 3-STAGE SELECTION PROCESS ═══════
    const qualifiedOpportunities: ScoredOpportunity[] = [];

    for (const coin of eligibleCoins) {
      if (coin.currentPrice <= 0) continue;
      
      // STAGE 1: Setup Filtering
      const filterResult = passesSetupFiltering(coin, marketRegime);
      if (!filterResult.passes) {
        console.log(`${coin.symbol}: Failed filters - ${filterResult.reasons[0]}`);
        continue;
      }
      
      // Calculate trade setup
      const setup = calculateSwingTradeSetup(coin, marketRegime);
      if (!setup || setup.action === "NO_TRADE") {
        console.log(`${coin.symbol}: No valid setup`);
        continue;
      }
      
      // Whale alignment check
      const whaleAligned = !whaleData || whaleData.intent === 'neutral' ||
        (setup.action === "BUY" && whaleData.intent === 'accumulating') ||
        (setup.action === "SELL" && whaleData.intent === 'distributing');
      
      if (whaleData && whaleData.confidence >= 70 && !whaleAligned) {
        console.log(`${coin.symbol}: Whale intent mismatch`);
        continue;
      }
      
      // STAGE 2: Probability Scoring
      const probabilityScore = calculateProbabilityScore(
        coin, marketRegime, setup.action, 
        whaleData?.intent || null, whaleData?.confidence || null
      );
      
      if (probabilityScore < TRADING_CONFIG.MIN_PROBABILITY_SCORE) {
        console.log(`${coin.symbol}: Probability ${probabilityScore}% < ${TRADING_CONFIG.MIN_PROBABILITY_SCORE}% threshold`);
        continue;
      }
      
      // STAGE 3: Speed Optimization
      const expectedTimeToTarget = calculateExpectedTimeToTarget(coin, setup.targetPercent);
      
      qualifiedOpportunities.push({
        coin,
        action: setup.action,
        probabilityScore,
        expectedTimeToTarget,
        entryPrice: setup.entryPrice,
        targetPrice: setup.targetPrice,
        stopLoss: setup.stopLoss,
        targetPercent: setup.targetPercent,
        riskPercent: setup.riskPercent,
        riskReward: setup.riskReward,
        trendDirection: setup.trendDirection,
        reasonsForSelection: filterResult.reasons,
        filtersPassedList: filterResult.reasons
      });
      
      console.log(`${coin.symbol}: QUALIFIED - Prob: ${probabilityScore}% | ETA: ${formatTimeRemaining(expectedTimeToTarget)} | RR: ${setup.riskReward.toFixed(1)}`);
    }

    // No qualified opportunities
    if (qualifiedOpportunities.length === 0) {
      console.log("No qualifying trade found - will rescan in 1 hour");
      
      const result: TradeResult = {
        coinId: "",
        coinName: "No Trade",
        coinSymbol: "WAIT",
        coinImage: "",
        action: "NO_TRADE",
        status: "WAITING",
        currentPrice: 0,
        entryPrice: 0,
        targetPrice: 0,
        stopLoss: 0,
        targetPercent: 0,
        riskPercent: 0,
        riskReward: 0,
        probabilityScore: 0,
        expectedTimeToTarget: "N/A",
        confidenceScore: 0,
        entryType: "LIMIT",
        marketRegime,
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
        filtersSkipped: [`No coins passed ${TRADING_CONFIG.MIN_PROBABILITY_SCORE}% probability threshold`],
        reasoning: `WAITING. No qualifying trade found. Scanned ${eligibleCoins.length} coins in ${marketRegime} regime. Min probability: ${TRADING_CONFIG.MIN_PROBABILITY_SCORE}%. Missing trades is better than bad trades. Trade less, but trade better.`,
        updatedAt: payload.updatedAt,
        nextScanIn: formatTimeRemaining(TRADING_CONFIG.SCAN_INTERVAL / 60),
        timeUntilNextAction: `Auto-rescan in ${TRADING_CONFIG.SCAN_INTERVAL / 60}h`,
        systemPerformance,
        activeTrade: null,
        tradeProgress: null
      };
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ═══════ SELECT BEST: Highest probability, then fastest ETA ═══════
    qualifiedOpportunities.sort((a, b) => {
      // Primary: Highest probability
      if (b.probabilityScore !== a.probabilityScore) {
        return b.probabilityScore - a.probabilityScore;
      }
      // Secondary: Fastest expected time to target
      return a.expectedTimeToTarget - b.expectedTimeToTarget;
    });

    const bestOpportunity = qualifiedOpportunities[0];
    const otherOptions = qualifiedOpportunities.slice(1, 4).map(o => 
      `${o.coin.symbol} (${o.probabilityScore}%, ${formatTimeRemaining(o.expectedTimeToTarget)})`
    ).join(', ');

    const whaleInfo = whaleData?.intent && whaleData.intent !== 'neutral' 
      ? ` Whale: ${whaleData.intent}.` 
      : '';
    
    const reasoning = `${bestOpportunity.coin.name} selected. ` +
      `Probability: ${bestOpportunity.probabilityScore}%. ` +
      `Expected time to target: ${formatTimeRemaining(bestOpportunity.expectedTimeToTarget)}. ` +
      `Target: +${bestOpportunity.targetPercent.toFixed(1)}% (${bestOpportunity.riskReward.toFixed(1)}R). ` +
      `Stop: -${bestOpportunity.riskPercent.toFixed(1)}%.${whaleInfo} ` +
      `${otherOptions ? `Other candidates: ${otherOptions}.` : ''} ` +
      `Probability first. Speed second.`;

    const bestTrade: TradeResult = {
      coinId: bestOpportunity.coin.id,
      coinName: bestOpportunity.coin.name,
      coinSymbol: bestOpportunity.coin.symbol.toUpperCase(),
      coinImage: bestOpportunity.coin.image,
      action: bestOpportunity.action,
      status: "TRADE_READY",
      currentPrice: bestOpportunity.coin.currentPrice,
      entryPrice: bestOpportunity.entryPrice,
      targetPrice: bestOpportunity.targetPrice,
      stopLoss: bestOpportunity.stopLoss,
      targetPercent: bestOpportunity.targetPercent,
      riskPercent: bestOpportunity.riskPercent,
      riskReward: Number(bestOpportunity.riskReward.toFixed(2)),
      probabilityScore: bestOpportunity.probabilityScore,
      expectedTimeToTarget: formatTimeRemaining(bestOpportunity.expectedTimeToTarget),
      confidenceScore: Math.min(95, bestOpportunity.probabilityScore),
      entryType: Math.abs(bestOpportunity.coin.change1h) < 0.5 ? "IMMEDIATE" : "LIMIT",
      marketRegime,
      whaleIntent: whaleData?.intent || null,
      whaleConfidence: whaleData?.confidence || null,
      rsi14: bestOpportunity.coin.rsi14,
      atr14: bestOpportunity.coin.atr14,
      priceChange1h: bestOpportunity.coin.change1h,
      priceChange24h: bestOpportunity.coin.change24h,
      priceChange7d: bestOpportunity.coin.change7d,
      volume24h: bestOpportunity.coin.volume24h,
      marketCap: bestOpportunity.coin.marketCap,
      marketCapRank: bestOpportunity.coin.marketCapRank,
      trendAlignment: bestOpportunity.trendDirection,
      filtersApplied: allFiltersApplied,
      filtersPassed: bestOpportunity.filtersPassedList,
      filtersSkipped: [],
      reasoning,
      updatedAt: payload.updatedAt,
      nextScanIn: formatTimeRemaining(TRADING_CONFIG.SCAN_INTERVAL / 60),
      timeUntilNextAction: "Trade signal ready",
      systemPerformance,
      activeTrade: null,
      tradeProgress: null
    };

    // Create trade record and activate
    const tradeId = await createTradeRecord(supabaseAdmin, bestTrade);
    
    if (tradeId) {
      await updateSystemState(supabaseAdmin, systemPerformance.id, {
        current_state: 'TRADE_ACTIVE',
        active_trade_id: tradeId,
        last_scan_at: new Date().toISOString()
      });
      
      bestTrade.activeTrade = {
        id: tradeId,
        coinId: bestTrade.coinId,
        coinName: bestTrade.coinName,
        coinSymbol: bestTrade.coinSymbol,
        action: bestTrade.action as 'BUY' | 'SELL',
        entryPrice: bestTrade.entryPrice,
        targetPrice: bestTrade.targetPrice,
        stopLoss: bestTrade.stopLoss,
        entryType: bestTrade.entryType,
        entryFilled: bestTrade.entryType === 'IMMEDIATE',
        createdAt: new Date().toISOString(),
        lastMonitoredAt: new Date().toISOString()
      };
      
      bestTrade.status = "TRADE_ACTIVE";
      bestTrade.timeUntilNextAction = bestTrade.entryType === 'IMMEDIATE'
        ? `Monitoring every ${TRADING_CONFIG.TRADE_MONITOR_INTERVAL}m`
        : `Waiting for entry fill (timeout: ${TRADING_CONFIG.ENTRY_TIMEOUT_HOURS}h)`;
      
      bestTrade.tradeProgress = {
        currentPnL: 0,
        distanceToTarget: bestTrade.targetPercent,
        distanceToStop: bestTrade.riskPercent,
        timeInTrade: 0,
        entryFilled: bestTrade.entryType === 'IMMEDIATE',
        hoursUntilTimeout: TRADING_CONFIG.ENTRY_TIMEOUT_HOURS
      };
    }

    console.log(`═══ TRADE EXECUTED: ${bestTrade.action} ${bestTrade.coinName} @ $${bestTrade.entryPrice.toFixed(2)} | Prob: ${bestTrade.probabilityScore}% | ETA: ${bestTrade.expectedTimeToTarget} ═══`);

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
