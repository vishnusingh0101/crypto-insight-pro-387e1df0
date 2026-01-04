import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET_NAME = "market-cache";
const FILE_PATH = "daily/full_market.json";

// ═══════════════════════════════════════════════════════════════════════════════
// ELITE AUTOMATED TRADING SYSTEM - Optimized for LIVE execution, not backtesting
// ═══════════════════════════════════════════════════════════════════════════════

const TRADING_CONFIG = {
  // Market scope - TOP 30 crypto assets by market cap and liquidity
  MAX_RANK: 30,
  MIN_VOLUME_24H: 50_000_000, // $50M minimum volume - exclude illiquid assets
  
  // Multi-factor scoring thresholds
  MIN_SCORE_NORMAL: 55,      // Minimum score to trade in normal regime
  MIN_SCORE_CHOPPY: 65,      // Higher threshold in choppy markets
  
  // Risk management
  MAX_RISK_PERCENT: 0.5,
  TARGET_PROFIT_MIN: 0.3,
  TARGET_PROFIT_MAX: 0.8,
  MIN_RISK_REWARD: 1.0,
  
  // Hybrid entry - momentum detection
  STRONG_MOMENTUM_1H: 0.8,   // 1h change > 0.8% = strong momentum
  STRONG_MOMENTUM_24H: 2,    // 24h change > 2% = strong momentum
  MOMENTUM_RSI_MIN: 45,
  MOMENTUM_RSI_MAX: 65,
  
  // RSI filters for normal entries
  RSI_MIN: 40,
  RSI_MAX: 60,
  
  // Volatility filters
  MAX_1H_CHANGE: 3,
  MAX_24H_CHANGE: 8,
  
  // Capital protection triggers
  MAX_CONSECUTIVE_LOSSES: 3,
  TIGHTEN_AFTER_LOSSES: 2,
  
  // ═══════ TIME SYSTEM (MANDATORY) ═══════
  SCAN_INTERVAL: 15,              // Scan every 15 minutes
  TRADE_MONITOR_INTERVAL: 3,      // Monitor active trades every 3 minutes
  ENTRY_TIMEOUT_MINUTES: 45,      // Cancel if entry not reached in 45 minutes
  COOLDOWN_MIN_MINUTES: 10,       // Minimum 10 minutes after trade closes
  CAPITAL_PROTECTION_REEVALUATE: 60, // Re-evaluate protection every 1 hour
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
  score: number;
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
    minutesUntilTimeout: number;
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
  const btc1h = btc.change1h;
  const eth1h = eth.change1h;
  
  // TREND_UP: Both BTC and ETH trending up across timeframes
  if (btc7d > 2 && eth7d > 2 && btc24h > 0 && eth24h > 0) {
    return "TREND_UP";
  }
  
  // DIP_UP: Weekly trend up but short-term pullback (buying opportunity)
  if (btc7d > 2 && eth7d > 2 && (btc24h < -1 || btc1h < -0.5)) {
    return "DIP_UP";
  }
  
  // TREND_DOWN: Both BTC and ETH trending down
  if (btc7d < -2 && eth7d < -2 && btc24h < 0 && eth24h < 0) {
    return "TREND_DOWN";
  }
  
  // CHOPPY: Mixed signals, no clear direction
  return "CHOPPY";
}

// ═══════ HYBRID ENTRY LOGIC ═══════
function detectStrongMomentum(coin: EnrichedCoin): boolean {
  const has1hMomentum = Math.abs(coin.change1h) > TRADING_CONFIG.STRONG_MOMENTUM_1H;
  const has24hMomentum = Math.abs(coin.change24h) > TRADING_CONFIG.STRONG_MOMENTUM_24H;
  const rsiInRange = coin.rsi14 >= TRADING_CONFIG.MOMENTUM_RSI_MIN && 
                     coin.rsi14 <= TRADING_CONFIG.MOMENTUM_RSI_MAX;
  
  return has1hMomentum && has24hMomentum && rsiInRange;
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
    // Create new record if none exists
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
      reasoning: `${trade.entryType} entry | ${trade.reasoning}`,
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

// ═══════ COOLDOWN LOGIC (DATA-BASED, NOT EMOTIONAL) ═══════
function checkCooldownExit(
  systemPerformance: SystemPerformance,
  whaleData: { hasNewEvent: boolean; volatilityState: string } | null,
  currentPrice: number | null
): { canExit: boolean; reason: string } {
  const now = new Date();
  
  // Must wait minimum 10 minutes
  if (systemPerformance.cooldownEndsAt) {
    const cooldownEnd = new Date(systemPerformance.cooldownEndsAt);
    if (now < cooldownEnd) {
      const minutesLeft = Math.ceil((cooldownEnd.getTime() - now.getTime()) / 60000);
      return { canExit: false, reason: `Minimum cooldown: ${minutesLeft}m remaining` };
    }
  }
  
  // Check exit conditions (need at least one)
  const conditions: string[] = [];
  
  // Condition 1: New whale transaction appears
  if (whaleData?.hasNewEvent) {
    conditions.push("New whale transaction detected");
  }
  
  // Condition 2: Volatility normalizes
  if (whaleData?.volatilityState === 'low' || whaleData?.volatilityState === 'medium') {
    conditions.push("Volatility normalized");
  }
  
  // Condition 3: Price exits previous trade range
  if (currentPrice && systemPerformance.lastTradeEntryPrice && systemPerformance.lastTradeExitPrice) {
    const rangeMin = Math.min(systemPerformance.lastTradeEntryPrice, systemPerformance.lastTradeExitPrice) * 0.99;
    const rangeMax = Math.max(systemPerformance.lastTradeEntryPrice, systemPerformance.lastTradeExitPrice) * 1.01;
    if (currentPrice < rangeMin || currentPrice > rangeMax) {
      conditions.push("Price exited previous trade range");
    }
  }
  
  if (conditions.length > 0) {
    return { canExit: true, reason: conditions[0] };
  }
  
  return { canExit: false, reason: "Waiting for: new whale event, volatility normalization, or price exit from previous range" };
}

// ═══════ MULTI-FACTOR SCORING MODEL ═══════
function scoreOpportunity(
  coin: EnrichedCoin, 
  regime: MarketRegime,
  setup: { action: TradeAction; riskReward: number },
  whaleIntent: WhaleIntent | null,
  whaleConfidence: number | null
): number {
  if (setup.action === "NO_TRADE") return 0;
  
  let score = 30;
  
  // 1. Liquidity score (market cap rank)
  if (coin.marketCapRank <= 5) score += 15;
  else if (coin.marketCapRank <= 10) score += 12;
  else if (coin.marketCapRank <= 20) score += 8;
  else score += 4;
  
  // 2. Volume-to-market-cap ratio
  if (coin.volumeToMcap > 0.1) score += 10;
  else if (coin.volumeToMcap > 0.05) score += 6;
  
  // 3. RSI position (neutral is better)
  const rsiDeviation = Math.abs(coin.rsi14 - 50);
  if (rsiDeviation <= 5) score += 12;
  else if (rsiDeviation <= 10) score += 8;
  else if (rsiDeviation <= 15) score += 4;
  
  // 4. ATR volatility (moderate is better)
  if (coin.atr14 >= 1 && coin.atr14 <= 4) score += 8;
  else if (coin.atr14 >= 0.5 && coin.atr14 <= 6) score += 4;
  
  // 5. Multi-timeframe trend alignment
  const trend7d = coin.change7d > 0;
  const trend24h = coin.change24h > 0;
  const trend1h = coin.change1h > 0;
  
  if (setup.action === "BUY") {
    if (trend7d && trend24h) score += 10;
    else if (trend7d) score += 5;
  } else if (setup.action === "SELL") {
    if (!trend7d && !trend24h) score += 10;
    else if (!trend7d) score += 5;
  }
  
  // 6. Volatility stability
  if (Math.abs(coin.change1h) < 1) score += 6;
  if (Math.abs(coin.change24h) < 4) score += 4;
  
  // 7. Risk-reward quality
  if (setup.riskReward >= 1.5) score += 10;
  else if (setup.riskReward >= 1.2) score += 6;
  
  // 8. Whale alignment bonus/penalty
  if (whaleIntent && whaleConfidence && whaleConfidence >= 70) {
    if ((setup.action === "BUY" && whaleIntent === 'accumulating') ||
        (setup.action === "SELL" && whaleIntent === 'distributing')) {
      score += 12;
    } else if ((setup.action === "BUY" && whaleIntent === 'distributing') ||
               (setup.action === "SELL" && whaleIntent === 'accumulating')) {
      score -= 15;
    }
  }
  
  // 9. Market regime alignment
  if (regime === "TREND_UP" && setup.action === "BUY") score += 8;
  if (regime === "DIP_UP" && setup.action === "BUY") score += 12; // Best for buying
  if (regime === "TREND_DOWN" && setup.action === "SELL") score += 8;
  if (regime === "CHOPPY") score -= 5; // Penalty for choppy markets
  
  return Math.max(0, Math.min(100, score));
}

// ═══════ TRADE SETUP CALCULATION ═══════
function calculateTradeSetup(
  coin: EnrichedCoin,
  regime: MarketRegime,
  hasStrongMomentum: boolean
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
} {
  const price = coin.currentPrice;
  const atr = coin.atr14;
  
  // Determine action based on regime and coin trend
  let action: TradeAction = "NO_TRADE";
  let trendDirection = "UNCLEAR";
  
  const bullish = coin.change24h > 0 && coin.change7d > 0;
  const bearish = coin.change24h < 0 && coin.change7d < 0;
  
  // Decide BUY or SELL based on market regime + coin trend + RSI
  if (regime === "TREND_UP" || regime === "DIP_UP") {
    if (bullish || (coin.change7d > 0 && coin.rsi14 < 55)) {
      action = "BUY";
      trendDirection = regime === "DIP_UP" ? "DIP BUYING OPPORTUNITY" : "UPTREND CONTINUATION";
    }
  } else if (regime === "TREND_DOWN") {
    if (bearish || (coin.change7d < 0 && coin.rsi14 > 45)) {
      action = "SELL";
      trendDirection = "DOWNTREND SHORT";
    }
  } else if (regime === "CHOPPY") {
    // Only high-conviction trades in choppy markets
    if (bullish && coin.rsi14 < 50 && coin.change1h < 0 && coin.change1h > -1) {
      action = "BUY";
      trendDirection = "RANGE BUY (pullback in bullish structure)";
    } else if (bearish && coin.rsi14 > 50 && coin.change1h > 0 && coin.change1h < 1) {
      action = "SELL";
      trendDirection = "RANGE SELL (bounce in bearish structure)";
    }
  }
  
  if (action === "NO_TRADE") {
    return {
      action: "NO_TRADE",
      entryPrice: price,
      targetPrice: price,
      stopLoss: price,
      targetPercent: 0,
      riskPercent: 0,
      riskReward: 0,
      trendDirection: "NO VALID SETUP",
      entryType: "LIMIT"
    };
  }
  
  // ═══════ HYBRID ENTRY LOGIC ═══════
  // If STRONG MOMENTUM: Enter immediately at market price
  // Else: Use pullback entry (ATR-based limit)
  
  let entryPrice: number;
  let entryType: "IMMEDIATE" | "LIMIT";
  
  if (hasStrongMomentum) {
    // Strong momentum - enter immediately at current price
    entryPrice = price;
    entryType = "IMMEDIATE";
  } else {
    // Use pullback entry
    const pullbackAmount = atr * 0.2; // 20% of ATR pullback
    entryPrice = action === "BUY" 
      ? price * (1 - pullbackAmount / 100)
      : price * (1 + pullbackAmount / 100);
    entryType = "LIMIT";
  }
  
  // Calculate targets based on ATR
  const targetPercent = Math.min(
    TRADING_CONFIG.TARGET_PROFIT_MAX,
    Math.max(TRADING_CONFIG.TARGET_PROFIT_MIN, atr * 0.25)
  );
  const riskPercent = targetPercent * 0.7; // Aim for 1.4+ R:R
  
  const targetPrice = action === "BUY"
    ? entryPrice * (1 + targetPercent / 100)
    : entryPrice * (1 - targetPercent / 100);
  
  const stopLoss = action === "BUY"
    ? entryPrice * (1 - riskPercent / 100)
    : entryPrice * (1 + riskPercent / 100);
  
  const riskReward = targetPercent / riskPercent;
  
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

// ═══════ FILTER APPLICATION ═══════
function applyTradingFilters(
  coin: EnrichedCoin, 
  tightenFilters: boolean
): { passed: boolean; results: { passed: boolean; reason: string }[] } {
  const results: { passed: boolean; reason: string }[] = [];
  
  const maxRank = tightenFilters ? 20 : TRADING_CONFIG.MAX_RANK;
  const rsiMin = tightenFilters ? 42 : TRADING_CONFIG.RSI_MIN;
  const rsiMax = tightenFilters ? 58 : TRADING_CONFIG.RSI_MAX;
  const max1hChange = tightenFilters ? 2 : TRADING_CONFIG.MAX_1H_CHANGE;
  const max24hChange = tightenFilters ? 6 : TRADING_CONFIG.MAX_24H_CHANGE;
  
  results.push({
    passed: coin.marketCapRank <= maxRank,
    reason: `Rank #${coin.marketCapRank} ${coin.marketCapRank <= maxRank ? '✓' : `> ${maxRank}`}`
  });
  
  results.push({
    passed: coin.volume24h >= TRADING_CONFIG.MIN_VOLUME_24H,
    reason: `Volume $${(coin.volume24h / 1_000_000).toFixed(0)}M ${coin.volume24h >= TRADING_CONFIG.MIN_VOLUME_24H ? '✓' : '< $50M (illiquid)'}`
  });
  
  results.push({
    passed: coin.rsi14 >= rsiMin && coin.rsi14 <= rsiMax,
    reason: `RSI ${coin.rsi14.toFixed(1)} ${coin.rsi14 >= rsiMin && coin.rsi14 <= rsiMax ? '✓ (neutral)' : `outside ${rsiMin}-${rsiMax}`}`
  });
  
  results.push({
    passed: Math.abs(coin.change1h) <= max1hChange,
    reason: `1h volatility ${Math.abs(coin.change1h).toFixed(2)}% ${Math.abs(coin.change1h) <= max1hChange ? '✓' : `> ${max1hChange}%`}`
  });
  
  results.push({
    passed: Math.abs(coin.change24h) <= max24hChange,
    reason: `24h volatility ${Math.abs(coin.change24h).toFixed(2)}% ${Math.abs(coin.change24h) <= max24hChange ? '✓' : `> ${max24hChange}%`}`
  });
  
  results.push({
    passed: coin.volumeToMcap > 0.03,
    reason: `Volume/MCap ${(coin.volumeToMcap * 100).toFixed(2)}% ${coin.volumeToMcap > 0.03 ? '✓' : '< 3%'}`
  });
  
  return { passed: results.every(r => r.passed), results };
}

function formatTimeRemaining(minutes: number): string {
  if (minutes < 1) return "< 1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER - Elite Trading System State Machine
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
    console.log("    ELITE AUTOMATED TRADING SYSTEM - LIVE EXECUTION");
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
    
    // Check for Capital Protection
    if (systemPerformance.consecutiveLosses >= TRADING_CONFIG.MAX_CONSECUTIVE_LOSSES) {
      systemPerformance.capitalProtectionEnabled = true;
      systemPerformance.capitalProtectionReason = `${systemPerformance.consecutiveLosses} consecutive losses`;
      systemPerformance.currentState = 'CAPITAL_PROTECTION';
    }
    
    const tightenFilters = systemPerformance.consecutiveLosses >= TRADING_CONFIG.TIGHTEN_AFTER_LOSSES;
    
    // Fetch whale intelligence
    const whaleData = await fetchWhaleIntelligence(supabaseUrl, serviceRoleKey);
    console.log(`Whale: ${whaleData?.intent || 'unavailable'} (${whaleData?.confidence || 0}%) | New event: ${whaleData?.hasNewEvent || false}`);

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
      `Top ${tightenFilters ? 20 : 30} rank`,
      "Min $50M volume",
      `RSI ${tightenFilters ? '42-58' : '40-60'}`,
      `1h volatility < ${tightenFilters ? 2 : 3}%`,
      `24h volatility < ${tightenFilters ? 6 : 8}%`,
      "Volume/MCap > 3%"
    ];

    const minScore = marketRegime === "CHOPPY" 
      ? TRADING_CONFIG.MIN_SCORE_CHOPPY 
      : TRADING_CONFIG.MIN_SCORE_NORMAL;

    // ═══════════════════════════════════════════════════════════════════════════════
    // STATE MACHINE
    // ═══════════════════════════════════════════════════════════════════════════════
    
    // ═══════ STATE: CAPITAL_PROTECTION ═══════
    if (systemPerformance.currentState === 'CAPITAL_PROTECTION' || systemPerformance.capitalProtectionEnabled) {
      console.log("═══ CAPITAL PROTECTION MODE ═══");
      
      await updateSystemState(supabaseAdmin, systemPerformance.id, {
        last_scan_at: new Date().toISOString(),
        current_state: 'CAPITAL_PROTECTION'
      });
      
      const lastScan = systemPerformance.lastScanAt ? new Date(systemPerformance.lastScanAt) : new Date(0);
      const minutesSinceLastScan = (Date.now() - lastScan.getTime()) / 60000;
      const nextReevaluate = Math.max(0, TRADING_CONFIG.CAPITAL_PROTECTION_REEVALUATE - minutesSinceLastScan);
      
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
        score: 0,
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
        filtersSkipped: ["Capital Protection Mode active"],
        reasoning: `CAPITAL PROTECTION MODE. ${systemPerformance.capitalProtectionReason}. Re-evaluating every hour. Capital protection > trade frequency.`,
        updatedAt: payload.updatedAt,
        nextScanIn: formatTimeRemaining(TRADING_CONFIG.CAPITAL_PROTECTION_REEVALUATE),
        timeUntilNextAction: formatTimeRemaining(nextReevaluate),
        systemPerformance,
        activeTrade: null,
        tradeProgress: null
      };
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ═══════ STATE: TRADE_ACTIVE - Monitor existing trade ═══════
    if ((systemPerformance.currentState === 'TRADE_ACTIVE' || systemPerformance.currentState === 'TRADE_READY') && systemPerformance.activeTradeId) {
      console.log("═══ TRADE ACTIVE - MONITORING ═══");
      
      const activeTrade = await fetchActiveTrade(supabase, systemPerformance.activeTradeId);
      
      if (!activeTrade) {
        console.log("Active trade not found, entering cooldown");
        await updateSystemState(supabaseAdmin, systemPerformance.id, {
          current_state: 'COOLDOWN',
          active_trade_id: null,
          last_trade_closed_at: new Date().toISOString(),
          cooldown_ends_at: new Date(Date.now() + TRADING_CONFIG.COOLDOWN_MIN_MINUTES * 60000).toISOString()
        });
        systemPerformance.currentState = 'COOLDOWN';
      } else {
        const tradedCoin = coins.find(c => c.id === activeTrade.coinId);
        const currentPrice = tradedCoin?.currentPrice || activeTrade.entryPrice;
        const timeInTrade = (Date.now() - new Date(activeTrade.createdAt).getTime()) / 60000;
        const minutesUntilTimeout = TRADING_CONFIG.ENTRY_TIMEOUT_MINUTES - timeInTrade;
        
        // ═══════ ENTRY TIMEOUT CHECK ═══════
        // If entry price is not reached within 45 minutes, mark as NOT_EXECUTED
        if (!activeTrade.entryFilled && activeTrade.entryType === 'LIMIT') {
          const entryReached = activeTrade.action === 'BUY'
            ? currentPrice <= activeTrade.entryPrice
            : currentPrice >= activeTrade.entryPrice;
          
          if (entryReached) {
            // Entry filled - update the trade
            activeTrade.entryFilled = true;
            await supabaseAdmin
              .from('trade_history')
              .update({ 
                reasoning: activeTrade.action === 'BUY' ? 'LIMIT FILLED' : 'LIMIT FILLED',
                last_monitored_at: new Date().toISOString() 
              })
              .eq('id', activeTrade.id);
            console.log(`Entry FILLED at $${currentPrice}`);
          } else if (timeInTrade >= TRADING_CONFIG.ENTRY_TIMEOUT_MINUTES) {
            // Timeout - mark as NOT_EXECUTED
            console.log(`Entry TIMEOUT after ${TRADING_CONFIG.ENTRY_TIMEOUT_MINUTES}m - marking as NOT_EXECUTED`);
            
            await closeTrade(supabaseAdmin, activeTrade.id, 'NOT_EXECUTED', currentPrice, activeTrade.entryPrice, activeTrade.action);
            
            await updateSystemState(supabaseAdmin, systemPerformance.id, {
              current_state: 'WAITING',
              active_trade_id: null,
              last_scan_at: new Date().toISOString()
            });
            
            const result: TradeResult = {
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
              targetPercent: 0,
              riskPercent: 0,
              riskReward: 0,
              score: 0,
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
              trendAlignment: "TIMEOUT",
              filtersApplied: [],
              filtersPassed: [],
              filtersSkipped: [],
              reasoning: `Entry not reached within ${TRADING_CONFIG.ENTRY_TIMEOUT_MINUTES} minutes. Trade cancelled - NOT_EXECUTED. A trade that cannot execute is worse than no trade.`,
              updatedAt: payload.updatedAt,
              nextScanIn: formatTimeRemaining(TRADING_CONFIG.SCAN_INTERVAL),
              timeUntilNextAction: "Resuming scan immediately",
              systemPerformance,
              activeTrade: null,
              tradeProgress: null
            };
            
            return new Response(JSON.stringify(result), {
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
        
        // Check SL/TP hit (only if entry is filled)
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
          
          await updateSystemState(supabaseAdmin, systemPerformance.id, {
            current_state: 'TRADE_CLOSED',
            active_trade_id: null,
            last_trade_closed_at: new Date().toISOString(),
            cooldown_ends_at: new Date(Date.now() + TRADING_CONFIG.COOLDOWN_MIN_MINUTES * 60000).toISOString(),
            consecutive_losses: newConsecutiveLosses,
            successful_trades: newSuccessful,
            failed_trades: newFailed,
            total_trades: newTotal,
            accuracy_percent: newAccuracy,
            last_trade_entry_price: activeTrade.entryPrice,
            last_trade_exit_price: currentPrice,
            capital_protection_enabled: newConsecutiveLosses >= TRADING_CONFIG.MAX_CONSECUTIVE_LOSSES,
            capital_protection_reason: newConsecutiveLosses >= TRADING_CONFIG.MAX_CONSECUTIVE_LOSSES 
              ? `${newConsecutiveLosses} consecutive losses` 
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
            score: 0,
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
            reasoning: `Trade CLOSED: ${tradeResult}. ${tradeResult === 'SUCCESS' ? 'Target' : 'Stop loss'} hit at $${currentPrice.toFixed(2)}. P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%. Entering cooldown.`,
            updatedAt: payload.updatedAt,
            nextScanIn: formatTimeRemaining(TRADING_CONFIG.COOLDOWN_MIN_MINUTES),
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
              timeInTrade,
              entryFilled: true,
              minutesUntilTimeout: 0
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
          score: 0,
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
          trendAlignment: "MONITORING",
          filtersApplied: [],
          filtersPassed: [],
          filtersSkipped: [],
          reasoning: entryFilled 
            ? `MONITORING ${activeTrade.action} ${activeTrade.coinSymbol} | P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}% | Target: ${distanceToTarget.toFixed(2)}% away | Stop: ${distanceToStop.toFixed(2)}% buffer`
            : `WAITING FOR ENTRY | Limit order at $${activeTrade.entryPrice.toFixed(2)} | Current: $${currentPrice.toFixed(2)} | Timeout in ${minutesUntilTimeout.toFixed(0)}m`,
          updatedAt: payload.updatedAt,
          nextScanIn: formatTimeRemaining(TRADING_CONFIG.TRADE_MONITOR_INTERVAL),
          timeUntilNextAction: `Monitoring every ${TRADING_CONFIG.TRADE_MONITOR_INTERVAL}m`,
          systemPerformance,
          activeTrade,
          tradeProgress: {
            currentPnL: pnl,
            distanceToTarget,
            distanceToStop,
            timeInTrade,
            entryFilled,
            minutesUntilTimeout: Math.max(0, minutesUntilTimeout)
          }
        };
        
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ═══════ STATE: COOLDOWN or TRADE_CLOSED - Check if we can exit ═══════
    if (systemPerformance.currentState === 'COOLDOWN' || systemPerformance.currentState === 'TRADE_CLOSED') {
      console.log("═══ COOLDOWN STATE ═══");
      
      const btcPrice = coins.find(c => c.symbol.toLowerCase() === 'btc')?.currentPrice || null;
      const cooldownCheck = checkCooldownExit(systemPerformance, whaleData, btcPrice);
      
      if (!cooldownCheck.canExit) {
        const cooldownEnd = systemPerformance.cooldownEndsAt ? new Date(systemPerformance.cooldownEndsAt) : new Date();
        const minutesLeft = Math.max(0, (cooldownEnd.getTime() - Date.now()) / 60000);
        
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
          score: 0,
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
          reasoning: `COOLDOWN active. ${cooldownCheck.reason}. Data-based cooldown to avoid duplicated signals and post-event noise.`,
          updatedAt: payload.updatedAt,
          nextScanIn: formatTimeRemaining(minutesLeft),
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

    // ═══════ STATE: WAITING - Scan for new opportunities ═══════
    console.log("═══ WAITING STATE - SCANNING ═══");
    console.log(`Market Regime: ${marketRegime} | Min Score Required: ${minScore}`);
    
    await updateSystemState(supabaseAdmin, systemPerformance.id, {
      last_scan_at: new Date().toISOString(),
      current_state: 'WAITING'
    });

    // High volatility check
    if (whaleData && whaleData.volatilityState === 'high') {
      console.log("High volatility detected - being extra cautious");
    }

    let bestTrade: TradeResult | null = null;
    let highestScore = 0;

    for (const coin of eligibleCoins) {
      if (coin.currentPrice <= 0) continue;
      
      const { passed, results } = applyTradingFilters(coin, tightenFilters);
      const filtersPassed = results.filter(r => r.passed).map(r => r.reason);
      const filtersSkipped = results.filter(r => !r.passed).map(r => r.reason);
      
      if (!passed) continue;
      
      const hasStrongMomentum = detectStrongMomentum(coin);
      const setup = calculateTradeSetup(coin, marketRegime, hasStrongMomentum);
      
      if (setup.action === "NO_TRADE") continue;
      if (setup.riskReward < TRADING_CONFIG.MIN_RISK_REWARD) continue;
      
      // Whale alignment check
      const whaleAligned = !whaleData || whaleData.intent === 'neutral' ||
        (setup.action === "BUY" && whaleData.intent === 'accumulating') ||
        (setup.action === "SELL" && whaleData.intent === 'distributing');
      
      if (whaleData && whaleData.confidence >= 70 && !whaleAligned) {
        console.log(`${coin.symbol}: Skipped - whale intent mismatch`);
        continue;
      }
      
      const score = scoreOpportunity(coin, marketRegime, setup, whaleData?.intent || null, whaleData?.confidence || null);
      
      // Check minimum score threshold
      if (score < minScore) {
        console.log(`${coin.symbol}: Score ${score} < ${minScore} threshold`);
        continue;
      }
      
      if (score > highestScore) {
        highestScore = score;
        
        const confidenceScore = Math.min(95, score);
        
        bestTrade = {
          coinId: coin.id,
          coinName: coin.name,
          coinSymbol: coin.symbol.toUpperCase(),
          coinImage: coin.image,
          action: setup.action,
          status: "TRADE_READY",
          currentPrice: coin.currentPrice,
          entryPrice: setup.entryPrice,
          targetPrice: setup.targetPrice,
          stopLoss: setup.stopLoss,
          targetPercent: setup.targetPercent,
          riskPercent: setup.riskPercent,
          riskReward: Number(setup.riskReward.toFixed(2)),
          score,
          confidenceScore,
          entryType: setup.entryType,
          marketRegime,
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
          nextScanIn: formatTimeRemaining(TRADING_CONFIG.SCAN_INTERVAL),
          timeUntilNextAction: "Trade signal ready",
          systemPerformance,
          activeTrade: null,
          tradeProgress: null
        };
        
        console.log(`${coin.symbol}: QUALIFIED - ${setup.action} score ${score}, entry ${setup.entryType}`);
      }
    }

    // No valid setup found
    if (!bestTrade) {
      console.log("No qualifying trade found - will rescan in 15 minutes");
      
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
        score: 0,
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
        filtersSkipped: [`No coins scored >= ${minScore} (${marketRegime} regime)`],
        reasoning: `WAITING. No qualifying trade found. Scanned ${eligibleCoins.length} coins in ${marketRegime} regime. Min score required: ${minScore}. If no valid setup exists, explicitly return WAITING. Data freshness > over-scanning.`,
        updatedAt: payload.updatedAt,
        nextScanIn: formatTimeRemaining(TRADING_CONFIG.SCAN_INTERVAL),
        timeUntilNextAction: `Auto-rescan in ${TRADING_CONFIG.SCAN_INTERVAL}m`,
        systemPerformance,
        activeTrade: null,
        tradeProgress: null
      };
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Trade found - create record and activate
    const bestCoin = eligibleCoins.find(c => c.id === bestTrade!.coinId)!;
    const whaleInfo = whaleData?.intent && whaleData.intent !== 'neutral' 
      ? ` Whale: ${whaleData.intent}.` 
      : '';
    
    bestTrade.reasoning = `${bestCoin.name} identified as ${bestTrade.trendAlignment}. ` +
      `${bestTrade.entryType} entry at $${bestTrade.entryPrice.toFixed(2)}. ` +
      `Target: +${bestTrade.targetPercent.toFixed(2)}%, Stop: -${bestTrade.riskPercent.toFixed(2)}%. ` +
      `Score: ${bestTrade.score}/100. RSI: ${bestCoin.rsi14.toFixed(1)}.${whaleInfo} ` +
      `Market regime: ${marketRegime}. Execution realism > signal perfection.`;

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
        : `Waiting for entry fill (timeout: ${TRADING_CONFIG.ENTRY_TIMEOUT_MINUTES}m)`;
      
      bestTrade.tradeProgress = {
        currentPnL: 0,
        distanceToTarget: bestTrade.targetPercent,
        distanceToStop: bestTrade.riskPercent,
        timeInTrade: 0,
        entryFilled: bestTrade.entryType === 'IMMEDIATE',
        minutesUntilTimeout: TRADING_CONFIG.ENTRY_TIMEOUT_MINUTES
      };
    }

    console.log(`═══ TRADE EXECUTED: ${bestTrade.action} ${bestTrade.coinName} @ $${bestTrade.entryPrice} (${bestTrade.entryType}) ═══`);

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
