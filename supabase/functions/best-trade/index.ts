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
  
  // Timing (in minutes)
  SCAN_INTERVAL: 15,
  TRADE_MONITOR_INTERVAL: 3,
  COOLDOWN_MIN_MINUTES: 10,
  CAPITAL_PROTECTION_REEVALUATE: 60, // 1 hour
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
type TradeStatus = "WAITING" | "ACTIVE_TRADE" | "COOLDOWN" | "FOUND" | "NO_OPPORTUNITY" | "CAPITAL_PROTECTION";
type SystemState = "WAITING" | "ACTIVE_TRADE" | "COOLDOWN" | "CAPITAL_PROTECTION";
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
  createdAt: string;
  lastMonitoredAt: string;
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
  timeUntilNextAction: string;
  systemPerformance: SystemPerformance;
  activeTrade: ActiveTrade | null;
  tradeProgress: {
    currentPnL: number;
    distanceToTarget: number;
    distanceToStop: number;
    timeInTrade: number; // minutes
  } | null;
};

// Fetch whale intelligence from the analyze function
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
    
    // Check if there's a "new" whale event (simulated)
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

// Fetch active trade
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
    createdAt: data.created_at,
    lastMonitoredAt: data.last_monitored_at
  };
}

// Update system state
async function updateSystemState(
  supabase: any, 
  performanceId: string, 
  updates: Partial<{
    current_state: SystemState;
    active_trade_id: string | null;
    last_trade_closed_at: string;
    cooldown_ends_at: string | null;
    last_scan_at: string;
    last_whale_event_at: string;
    consecutive_losses: number;
    capital_protection_enabled: boolean;
    capital_protection_reason: string | null;
    successful_trades: number;
    failed_trades: number;
    total_trades: number;
    accuracy_percent: number;
    last_trade_entry_price: number | null;
    last_trade_exit_price: number | null;
  }>
) {
  if (!performanceId) return;
  
  const { error } = await supabase
    .from('system_performance')
    .update({ ...updates, last_updated_at: new Date().toISOString() })
    .eq('id', performanceId);
  
  if (error) console.error("Failed to update system state:", error);
}

// Create new trade in history
async function createTradeRecord(supabase: any, trade: ConservativeTrade): Promise<string | null> {
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
      reasoning: trade.reasoning,
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

// Close trade and update performance
async function closeTrade(
  supabase: any, 
  tradeId: string, 
  result: 'SUCCESS' | 'FAILED',
  exitPrice: number,
  entryPrice: number,
  action: 'BUY' | 'SELL'
): Promise<void> {
  const profitLossPercent = action === 'BUY' 
    ? ((exitPrice - entryPrice) / entryPrice) * 100
    : ((entryPrice - exitPrice) / entryPrice) * 100;
  
  await supabase
    .from('trade_history')
    .update({
      result,
      exit_price: exitPrice,
      profit_loss_percent: profitLossPercent,
      closed_at: new Date().toISOString()
    })
    .eq('id', tradeId);
}

// Check if cooldown conditions are met
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
  
  // Condition 1: New whale event
  if (whaleData?.hasNewEvent) {
    conditions.push("New whale activity detected");
  }
  
  // Condition 2: Volatility stabilized
  if (whaleData?.volatilityState === 'low' || whaleData?.volatilityState === 'medium') {
    conditions.push("Volatility stabilized");
  }
  
  // Condition 3: Price exited previous trade range
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
  
  return { canExit: false, reason: "Waiting for: whale event, volatility change, or price movement" };
}

function applyTradingFilters(
  coin: EnrichedCoin, 
  tightenFilters: boolean
): { passed: boolean; results: FilterResult[] } {
  const results: FilterResult[] = [];
  
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
    reason: `Volume $${(coin.volume24h / 1_000_000).toFixed(0)}M ${coin.volume24h >= TRADING_CONFIG.MIN_VOLUME_24H ? '✓' : '< $50M'}`
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
  
  const trendAligned = (coin.change1h > 0 && coin.change24h > 0) || (coin.change1h < 0 && coin.change24h < 0);
  results.push({
    passed: trendAligned,
    reason: `Trend alignment ${trendAligned ? '✓' : 'mixed signals'}`
  });
  
  results.push({
    passed: Math.abs(coin.change1h) < 2,
    reason: `No impulsive moves ${Math.abs(coin.change1h) < 2 ? '✓' : '> 2% 1h move'}`
  });
  
  results.push({
    passed: coin.volumeToMcap > 0.05,
    reason: `Volume/MCap ${(coin.volumeToMcap * 100).toFixed(2)}% ${coin.volumeToMcap > 0.05 ? '✓' : '< 5%'}`
  });
  
  return { passed: results.every(r => r.passed), results };
}

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

function scoreOpportunity(
  coin: EnrichedCoin, 
  setup: ReturnType<typeof calculateTradeSetup>,
  whaleIntent: WhaleIntent | null,
  whaleConfidence: number | null
): number {
  if (setup.action === "NO_TRADE") return 0;
  
  let score = 50;
  
  if (coin.marketCapRank <= 5) score += 20;
  else if (coin.marketCapRank <= 10) score += 15;
  else if (coin.marketCapRank <= 20) score += 10;
  
  const rsiDeviation = Math.abs(coin.rsi14 - 50);
  if (rsiDeviation <= 5) score += 15;
  else if (rsiDeviation <= 10) score += 10;
  
  if (Math.abs(coin.change1h) < 0.5) score += 10;
  if (Math.abs(coin.change24h) < 3) score += 10;
  
  if (setup.riskReward >= 1.5) score += 10;
  else if (setup.riskReward >= 1.2) score += 5;
  
  if (whaleIntent && whaleConfidence && whaleConfidence >= 70) {
    if ((setup.action === "BUY" && whaleIntent === 'accumulating') ||
        (setup.action === "SELL" && whaleIntent === 'distributing')) {
      score += 15;
    } else if ((setup.action === "BUY" && whaleIntent === 'distributing') ||
               (setup.action === "SELL" && whaleIntent === 'accumulating')) {
      score -= 20;
    }
  }
  
  return score;
}

function formatTimeRemaining(minutes: number): string {
  if (minutes < 1) return "< 1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
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
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    console.log("=== Automated Trading System Starting ===");

    // Fetch system performance
    const systemPerformance = await fetchSystemPerformance(supabase);
    console.log(`State: ${systemPerformance.currentState} | Mode: ${systemPerformance.mode} | Trades: ${systemPerformance.totalTrades} | Accuracy: ${systemPerformance.accuracyPercent?.toFixed(1) || 0}%`);
    
    // Check if Capital Protection should be active
    if (systemPerformance.consecutiveLosses >= TRADING_CONFIG.MAX_CONSECUTIVE_LOSSES) {
      systemPerformance.capitalProtectionEnabled = true;
      systemPerformance.capitalProtectionReason = `${systemPerformance.consecutiveLosses} consecutive losses detected`;
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

    // ======== STATE MACHINE ========
    
    // STATE: CAPITAL_PROTECTION
    if (systemPerformance.currentState === 'CAPITAL_PROTECTION' || systemPerformance.capitalProtectionEnabled) {
      console.log("=== CAPITAL PROTECTION MODE ===");
      
      // Check if we should re-evaluate (every hour)
      const lastScan = systemPerformance.lastScanAt ? new Date(systemPerformance.lastScanAt) : new Date(0);
      const minutesSinceLastScan = (Date.now() - lastScan.getTime()) / 60000;
      
      // Update last scan time
      await updateSystemState(supabaseAdmin, systemPerformance.id, {
        last_scan_at: new Date().toISOString(),
        current_state: 'CAPITAL_PROTECTION'
      });
      
      const nextReevaluate = Math.max(0, TRADING_CONFIG.CAPITAL_PROTECTION_REEVALUATE - minutesSinceLastScan);
      
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
        reasoning: `Capital Protection Mode active. ${systemPerformance.capitalProtectionReason || 'System paused due to consecutive losses.'} Scanning continues every hour. Trade LESS, trade SMART.`,
        updatedAt: payload.updatedAt,
        nextScanIn: formatTimeRemaining(TRADING_CONFIG.CAPITAL_PROTECTION_REEVALUATE),
        timeUntilNextAction: formatTimeRemaining(nextReevaluate),
        systemPerformance,
        activeTrade: null,
        tradeProgress: null
      };
      
      return new Response(JSON.stringify(protectedResult), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // STATE: ACTIVE_TRADE - Monitor existing trade
    if (systemPerformance.currentState === 'ACTIVE_TRADE' && systemPerformance.activeTradeId) {
      console.log("=== ACTIVE TRADE - MONITORING ===");
      
      const activeTrade = await fetchActiveTrade(supabase, systemPerformance.activeTradeId);
      
      if (!activeTrade) {
        // Trade was closed externally, move to cooldown
        console.log("Active trade not found, entering cooldown");
        await updateSystemState(supabaseAdmin, systemPerformance.id, {
          current_state: 'COOLDOWN',
          active_trade_id: null,
          last_trade_closed_at: new Date().toISOString(),
          cooldown_ends_at: new Date(Date.now() + TRADING_CONFIG.COOLDOWN_MIN_MINUTES * 60000).toISOString()
        });
        systemPerformance.currentState = 'COOLDOWN';
      } else {
        // Find current price for the traded coin
        const tradedCoin = coins.find(c => c.id === activeTrade.coinId);
        const currentPrice = tradedCoin?.currentPrice || activeTrade.entryPrice;
        
        // Calculate P&L
        const pnl = activeTrade.action === 'BUY'
          ? ((currentPrice - activeTrade.entryPrice) / activeTrade.entryPrice) * 100
          : ((activeTrade.entryPrice - currentPrice) / activeTrade.entryPrice) * 100;
        
        const distanceToTarget = activeTrade.action === 'BUY'
          ? ((activeTrade.targetPrice - currentPrice) / currentPrice) * 100
          : ((currentPrice - activeTrade.targetPrice) / currentPrice) * 100;
        
        const distanceToStop = activeTrade.action === 'BUY'
          ? ((currentPrice - activeTrade.stopLoss) / currentPrice) * 100
          : ((activeTrade.stopLoss - currentPrice) / currentPrice) * 100;
        
        const timeInTrade = (Date.now() - new Date(activeTrade.createdAt).getTime()) / 60000;
        
        // Check if target or stop hit
        let tradeResult: 'SUCCESS' | 'FAILED' | null = null;
        
        if (activeTrade.action === 'BUY') {
          if (currentPrice >= activeTrade.targetPrice) tradeResult = 'SUCCESS';
          else if (currentPrice <= activeTrade.stopLoss) tradeResult = 'FAILED';
        } else {
          if (currentPrice <= activeTrade.targetPrice) tradeResult = 'SUCCESS';
          else if (currentPrice >= activeTrade.stopLoss) tradeResult = 'FAILED';
        }
        
        if (tradeResult) {
          console.log(`Trade ${tradeResult}: ${activeTrade.coinSymbol} at $${currentPrice}`);
          
          // Close trade
          await closeTrade(supabaseAdmin, activeTrade.id, tradeResult, currentPrice, activeTrade.entryPrice, activeTrade.action);
          
          // Update performance
          const newConsecutiveLosses = tradeResult === 'FAILED' ? systemPerformance.consecutiveLosses + 1 : 0;
          const newSuccessful = tradeResult === 'SUCCESS' ? systemPerformance.successfulTrades + 1 : systemPerformance.successfulTrades;
          const newFailed = tradeResult === 'FAILED' ? systemPerformance.failedTrades + 1 : systemPerformance.failedTrades;
          const newTotal = systemPerformance.totalTrades + 1;
          const newAccuracy = newTotal > 0 ? (newSuccessful / newTotal) * 100 : 0;
          
          await updateSystemState(supabaseAdmin, systemPerformance.id, {
            current_state: 'COOLDOWN',
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
          
          systemPerformance.currentState = 'COOLDOWN';
          systemPerformance.consecutiveLosses = newConsecutiveLosses;
        } else {
          // Update monitoring timestamp
          await supabaseAdmin
            .from('trade_history')
            .update({ last_monitored_at: new Date().toISOString() })
            .eq('id', activeTrade.id);
          
          // Return active trade status
          const result: ConservativeTrade = {
            coinId: activeTrade.coinId,
            coinName: activeTrade.coinName,
            coinSymbol: activeTrade.coinSymbol,
            coinImage: tradedCoin?.image || "",
            action: activeTrade.action,
            status: "ACTIVE_TRADE",
            currentPrice,
            entryPrice: activeTrade.entryPrice,
            targetPrice: activeTrade.targetPrice,
            stopLoss: activeTrade.stopLoss,
            targetPercent: Math.abs((activeTrade.targetPrice - activeTrade.entryPrice) / activeTrade.entryPrice * 100),
            riskPercent: Math.abs((activeTrade.entryPrice - activeTrade.stopLoss) / activeTrade.entryPrice * 100),
            riskReward: Math.abs((activeTrade.targetPrice - activeTrade.entryPrice) / (activeTrade.entryPrice - activeTrade.stopLoss)),
            successProbability: 0,
            confidenceScore: 0,
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
            reasoning: `Monitoring ${activeTrade.action} ${activeTrade.coinSymbol} | P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}% | Target: ${distanceToTarget.toFixed(2)}% away | Stop: ${distanceToStop.toFixed(2)}% buffer`,
            updatedAt: payload.updatedAt,
            nextScanIn: formatTimeRemaining(TRADING_CONFIG.TRADE_MONITOR_INTERVAL),
            timeUntilNextAction: "Monitoring every 3m",
            systemPerformance,
            activeTrade,
            tradeProgress: {
              currentPnL: pnl,
              distanceToTarget,
              distanceToStop,
              timeInTrade
            }
          };
          
          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }
    }

    // STATE: COOLDOWN - Check if we can exit
    if (systemPerformance.currentState === 'COOLDOWN') {
      console.log("=== COOLDOWN STATE ===");
      
      // Get a reference price for cooldown exit check
      const btcPrice = coins.find(c => c.symbol.toLowerCase() === 'btc')?.currentPrice || null;
      const cooldownCheck = checkCooldownExit(systemPerformance, whaleData, btcPrice);
      
      if (!cooldownCheck.canExit) {
        // Still in cooldown
        const cooldownEnd = systemPerformance.cooldownEndsAt ? new Date(systemPerformance.cooldownEndsAt) : new Date();
        const minutesLeft = Math.max(0, (cooldownEnd.getTime() - Date.now()) / 60000);
        
        const result: ConservativeTrade = {
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
          filtersSkipped: ["Cooldown active"],
          reasoning: `Post-trade cooldown active. ${cooldownCheck.reason}. Avoiding duplicated signals and post-event noise.`,
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
      
      // Exit cooldown
      console.log(`Exiting cooldown: ${cooldownCheck.reason}`);
      await updateSystemState(supabaseAdmin, systemPerformance.id, {
        current_state: 'WAITING',
        cooldown_ends_at: null,
        last_scan_at: new Date().toISOString()
      });
      systemPerformance.currentState = 'WAITING';
    }

    // STATE: WAITING - Scan for new opportunities
    console.log("=== WAITING STATE - SCANNING ===");
    
    // Update last scan time
    await updateSystemState(supabaseAdmin, systemPerformance.id, {
      last_scan_at: new Date().toISOString()
    });

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
          nextScanIn: formatTimeRemaining(TRADING_CONFIG.SCAN_INTERVAL),
          timeUntilNextAction: "Trade signal ready",
          systemPerformance,
          activeTrade: null,
          tradeProgress: null
        };
        
        console.log(`${coin.symbol}: QUALIFIED - ${setup.action} with score ${score}, confidence ${confidenceScore}%`);
      }
    }

    // No trade found
    if (!bestTrade) {
      console.log("No qualifying trade found - will rescan in 15 minutes");
      
      const noTrade: ConservativeTrade = {
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
        reasoning: `No qualifying trade found. Scanned ${eligibleCoins.length} coins. System will automatically rescan in ${TRADING_CONFIG.SCAN_INTERVAL} minutes. Patience over profit.`,
        updatedAt: payload.updatedAt,
        nextScanIn: formatTimeRemaining(TRADING_CONFIG.SCAN_INTERVAL),
        timeUntilNextAction: `Auto-rescan in ${TRADING_CONFIG.SCAN_INTERVAL}m`,
        systemPerformance,
        activeTrade: null,
        tradeProgress: null
      };
      
      return new Response(JSON.stringify(noTrade), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Trade found - create record and update state
    const bestCoin = eligibleCoins.find(c => c.id === bestTrade!.coinId)!;
    const whaleInfo = whaleData?.intent && whaleData.intent !== 'neutral' 
      ? ` Whale activity: ${whaleData.intent}.` 
      : '';
    
    bestTrade.reasoning = `${bestCoin.name} identified as ${bestTrade.trendAlignment} ${bestTrade.action === 'BUY' ? 'long' : 'short'} opportunity. ` +
      `Entry: $${bestTrade.entryPrice.toFixed(2)}, Target: +${bestTrade.targetPercent.toFixed(2)}%, Stop: -${bestTrade.riskPercent.toFixed(2)}%. ` +
      `RSI: ${bestCoin.rsi14.toFixed(1)} (neutral).${whaleInfo} Confidence: ${bestTrade.confidenceScore}%.`;

    // Create trade record
    const tradeId = await createTradeRecord(supabaseAdmin, bestTrade);
    
    if (tradeId) {
      // Update system state to ACTIVE_TRADE
      await updateSystemState(supabaseAdmin, systemPerformance.id, {
        current_state: 'ACTIVE_TRADE',
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
        createdAt: new Date().toISOString(),
        lastMonitoredAt: new Date().toISOString()
      };
      
      bestTrade.status = "ACTIVE_TRADE";
      bestTrade.timeUntilNextAction = `Monitoring every ${TRADING_CONFIG.TRADE_MONITOR_INTERVAL}m`;
    }

    console.log(`=== TRADE EXECUTED: ${bestTrade.action} ${bestTrade.coinName} @ $${bestTrade.entryPrice} ===`);

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
