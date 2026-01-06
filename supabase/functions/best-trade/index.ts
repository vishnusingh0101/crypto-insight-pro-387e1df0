import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET_NAME = "market-cache";
const FILE_PATH = "daily/full_market.json";

// ═══════════════════════════════════════════════════════════════════════════════
// ELITE SWING TRADING SYSTEM - STRICT SINGLE TRADE ENFORCEMENT
// Trade less, but trade better. Missing trades is better than bad trades.
// DATABASE IS THE SOURCE OF TRUTH. UI IS READ-ONLY. FUNCTIONS ARE IDEMPOTENT.
// ═══════════════════════════════════════════════════════════════════════════════

const TRADING_CONFIG = {
  // Market scope - TOP 30 crypto assets by market cap and liquidity
  MAX_RANK: 30,
  MIN_VOLUME_24H: 50_000_000, // $50M minimum volume
  
  // ═══════ PROBABILITY SCORING ═══════
  MIN_PROBABILITY_SCORE: 70,
  
  // ═══════ RISK MANAGEMENT ═══════
  MIN_STOP_LOSS: 2.0,
  MAX_STOP_LOSS: 5.0,
  MIN_RISK_REWARD: 2.5,
  PREFERRED_MIN_RR: 3.0,
  PREFERRED_MAX_RR: 5.0,
  
  // ═══════ TIME SYSTEM (STRICT) ═══════
  SCAN_INTERVAL_MINUTES: 30,         // Scan every 30 minutes (not on every call)
  TRADE_MONITOR_INTERVAL: 15,        // Monitor active trades every 15 minutes
  ENTRY_TIMEOUT_HOURS: 24,           // Allow 24 hours for entry
  COOLDOWN_AFTER_LOSS_MINUTES: 90,   // 90 minutes after loss
  COOLDOWN_AFTER_WIN_MINUTES: 30,    // 30 minutes after win
  CAPITAL_PROTECTION_HOURS: 24,      // 24 hours pause after 3 consecutive losses
  
  // Capital protection triggers
  MAX_CONSECUTIVE_LOSSES: 3,
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
type SystemState = "WAITING" | "TRADE_READY" | "TRADE_ACTIVE" | "TRADE_CLOSED" | "NOT_EXECUTED" | "COOLDOWN" | "CAPITAL_PROTECTION";
type MarketRegime = "TREND_UP" | "DIP_UP" | "TREND_DOWN" | "CHOPPY";
type SystemMode = "paper" | "live";
type WhaleIntent = "accumulating" | "distributing" | "neutral";

type DerivedCounters = {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  accuracyPercent: number;
  consecutiveLosses: number;
};

type SystemPerformance = {
  id: string;
  mode: SystemMode;
  currentState: SystemState;
  activeTradeId: string | null;
  lastTradeClosedAt: string | null;
  lastTradeResult: string | null;
  cooldownEndsAt: string | null;
  lastScanAt: string | null;
  capitalProtectionEnabled: boolean;
  capitalProtectionReason: string | null;
} & DerivedCounters;

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
  expectedTimeToTarget: number;
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

// ═══════ HELPER FUNCTIONS ═══════

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

function detectMarketRegime(coins: EnrichedCoin[]): MarketRegime {
  const btc = coins.find(c => c.symbol.toLowerCase() === 'btc');
  const eth = coins.find(c => c.symbol.toLowerCase() === 'eth');
  
  if (!btc || !eth) return "CHOPPY";
  
  const btc7d = btc.change7d;
  const eth7d = eth.change7d;
  const btc24h = btc.change24h;
  const eth24h = eth.change24h;
  
  if (btc7d > 2 && eth7d > 2 && btc24h > 0 && eth24h > 0) return "TREND_UP";
  if (btc7d > 2 && eth7d > 2 && (btc24h < -1 || btc.change1h < -0.5)) return "DIP_UP";
  if (btc7d < -2 && eth7d < -2 && btc24h < 0 && eth24h < 0) return "TREND_DOWN";
  return "CHOPPY";
}

// ═══════ DATABASE QUERIES - SOURCE OF TRUTH ═══════

/**
 * CRITICAL: Query for ANY active trade in the database
 * This is the FIRST check on every function call
 */
async function fetchAnyActiveTrade(supabase: any): Promise<ActiveTrade | null> {
  const { data, error } = await supabase
    .from('trade_history')
    .select('*')
    .eq('result', 'PENDING')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
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

/**
 * Derive counters from trade_history table - SOURCE OF TRUTH
 * Counters are NEVER incremented directly - always recalculated from DB
 */
async function deriveCountersFromHistory(supabase: any): Promise<DerivedCounters> {
  // Get all closed trades
  const { data: trades, error } = await supabase
    .from('trade_history')
    .select('result, closed_at')
    .in('result', ['SUCCESS', 'FAILED'])
    .order('closed_at', { ascending: false });
  
  if (error || !trades || trades.length === 0) {
    return {
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      accuracyPercent: 0,
      consecutiveLosses: 0
    };
  }
  
  const successfulTrades = trades.filter((t: any) => t.result === 'SUCCESS').length;
  const failedTrades = trades.filter((t: any) => t.result === 'FAILED').length;
  const totalTrades = successfulTrades + failedTrades;
  const accuracyPercent = totalTrades > 0 ? (successfulTrades / totalTrades) * 100 : 0;
  
  // Calculate consecutive losses from most recent trades
  let consecutiveLosses = 0;
  for (const trade of trades) {
    if (trade.result === 'FAILED') {
      consecutiveLosses++;
    } else {
      break; // Stop counting on first success
    }
  }
  
  return {
    totalTrades,
    successfulTrades,
    failedTrades,
    accuracyPercent,
    consecutiveLosses
  };
}

/**
 * Get the most recent closed trade to determine cooldown timing
 */
async function getLastClosedTrade(supabase: any): Promise<{ closedAt: string; result: string } | null> {
  const { data, error } = await supabase
    .from('trade_history')
    .select('closed_at, result')
    .in('result', ['SUCCESS', 'FAILED'])
    .order('closed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error || !data) return null;
  return { closedAt: data.closed_at, result: data.result };
}

/**
 * Fetch system state (mode, last scan, etc.)
 */
async function fetchSystemState(supabase: any): Promise<{
  id: string;
  mode: SystemMode;
  lastScanAt: string | null;
}> {
  const { data, error } = await supabase
    .from('system_performance')
    .select('id, mode, last_scan_at')
    .order('last_updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error || !data) {
    return { id: '', mode: 'paper', lastScanAt: null };
  }
  
  return {
    id: data.id,
    mode: data.mode || 'paper',
    lastScanAt: data.last_scan_at
  };
}

/**
 * Update system state (only mode and timestamps, NOT counters)
 */
async function updateSystemState(
  supabase: any,
  id: string,
  updates: Record<string, any>
): Promise<string | null> {
  if (!id) {
    const { data, error } = await supabase
      .from('system_performance')
      .insert({
        ...updates,
        last_updated_at: new Date().toISOString()
      })
      .select('id')
      .single();
    
    if (error) console.error("Failed to create system state:", error);
    return data?.id || null;
  }
  
  const { error } = await supabase
    .from('system_performance')
    .update({ ...updates, last_updated_at: new Date().toISOString() })
    .eq('id', id);
  
  if (error) console.error("Failed to update system state:", error);
  return id;
}

/**
 * Create a new trade record - ONLY when no active trade exists
 */
async function createTradeRecord(supabase: any, trade: TradeResult): Promise<string | null> {
  // DOUBLE CHECK: Ensure no active trade exists before creating
  const existingActive = await fetchAnyActiveTrade(supabase);
  if (existingActive) {
    console.error("BLOCKED: Cannot create trade - active trade already exists:", existingActive.id);
    return null;
  }
  
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

/**
 * Close a trade - update result and closed_at
 */
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

// ═══════ COOLDOWN & PROTECTION LOGIC ═══════

function calculateCooldownStatus(
  lastTrade: { closedAt: string; result: string } | null,
  consecutiveLosses: number
): { inCooldown: boolean; inProtection: boolean; reason: string; endsAt: Date | null } {
  if (!lastTrade) {
    return { inCooldown: false, inProtection: false, reason: "No previous trades", endsAt: null };
  }
  
  const now = new Date();
  const closedAt = new Date(lastTrade.closedAt);
  
  // Check capital protection (3+ consecutive losses)
  if (consecutiveLosses >= TRADING_CONFIG.MAX_CONSECUTIVE_LOSSES) {
    const protectionEnd = new Date(closedAt.getTime() + TRADING_CONFIG.CAPITAL_PROTECTION_HOURS * 60 * 60 * 1000);
    if (now < protectionEnd) {
      return {
        inCooldown: false,
        inProtection: true,
        reason: `${consecutiveLosses} consecutive losses - 24h capital protection`,
        endsAt: protectionEnd
      };
    }
  }
  
  // Determine cooldown duration based on last trade result
  const cooldownMinutes = lastTrade.result === 'FAILED'
    ? TRADING_CONFIG.COOLDOWN_AFTER_LOSS_MINUTES
    : TRADING_CONFIG.COOLDOWN_AFTER_WIN_MINUTES;
  
  const cooldownEnd = new Date(closedAt.getTime() + cooldownMinutes * 60 * 1000);
  
  if (now < cooldownEnd) {
    return {
      inCooldown: true,
      inProtection: false,
      reason: `Cooldown after ${lastTrade.result === 'FAILED' ? 'loss (90min)' : 'win (30min)'}`,
      endsAt: cooldownEnd
    };
  }
  
  return { inCooldown: false, inProtection: false, reason: "Cooldown complete", endsAt: null };
}

function shouldScan(lastScanAt: string | null): { canScan: boolean; minutesSinceScan: number; minutesUntilNext: number } {
  if (!lastScanAt) {
    return { canScan: true, minutesSinceScan: TRADING_CONFIG.SCAN_INTERVAL_MINUTES, minutesUntilNext: 0 };
  }
  
  const now = Date.now();
  const lastScan = new Date(lastScanAt).getTime();
  const minutesSinceScan = (now - lastScan) / (60 * 1000);
  const minutesUntilNext = Math.max(0, TRADING_CONFIG.SCAN_INTERVAL_MINUTES - minutesSinceScan);
  
  return {
    canScan: minutesSinceScan >= TRADING_CONFIG.SCAN_INTERVAL_MINUTES,
    minutesSinceScan,
    minutesUntilNext
  };
}

// ═══════ TRADING ANALYSIS FUNCTIONS ═══════

function passesSetupFiltering(coin: EnrichedCoin, regime: MarketRegime): { passes: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  const trend24h = coin.change24h;
  const trend7d = coin.change7d;
  const trend30d = coin.change30d;
  
  const bullishTrend = trend24h > -1 && trend7d > 0 && (trend30d === undefined || trend30d > -5);
  const bearishTrend = trend24h < 1 && trend7d < 0 && (trend30d === undefined || trend30d < 5);
  
  if (regime === 'TREND_UP' || regime === 'DIP_UP') {
    if (!bullishTrend) return { passes: false, reasons: ["Not aligned with uptrend"] };
    reasons.push(`Aligned with uptrend (7d: +${trend7d.toFixed(1)}%)`);
  } else if (regime === 'TREND_DOWN') {
    if (!bearishTrend) return { passes: false, reasons: ["Not aligned with downtrend"] };
    reasons.push(`Aligned with downtrend (7d: ${trend7d.toFixed(1)}%)`);
  }
  
  // RSI filter
  if (regime === 'TREND_UP' || regime === 'DIP_UP') {
    if (coin.rsi14 > 75) return { passes: false, reasons: ["RSI overbought"] };
    if (coin.rsi14 < 30) reasons.push("RSI oversold - good entry");
  } else if (regime === 'TREND_DOWN') {
    if (coin.rsi14 < 25) return { passes: false, reasons: ["RSI oversold"] };
  }
  
  // Volatility filter
  if (coin.volatilityScore > 80) return { passes: false, reasons: ["Volatility too high"] };
  if (coin.volatilityScore < 20) return { passes: false, reasons: ["Volatility too low"] };
  reasons.push(`Volatility acceptable (${coin.volatilityScore.toFixed(0)})`);
  
  // Volume filter
  if (coin.volume24h < TRADING_CONFIG.MIN_VOLUME_24H) {
    return { passes: false, reasons: ["Volume too low"] };
  }
  reasons.push(`Volume sufficient ($${(coin.volume24h / 1e6).toFixed(0)}M)`);
  
  // Liquidity filter
  if (coin.liquidityScore < 30) return { passes: false, reasons: ["Liquidity too low"] };
  
  return { passes: true, reasons };
}

function calculateSwingTradeSetup(coin: EnrichedCoin, regime: MarketRegime): {
  action: TradeAction;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  targetPercent: number;
  riskPercent: number;
  riskReward: number;
  trendDirection: string;
} | null {
  const atrPercent = (coin.atr14 / coin.currentPrice) * 100;
  
  let action: TradeAction = "NO_TRADE";
  let stopPercent = Math.min(Math.max(atrPercent * 1.5, TRADING_CONFIG.MIN_STOP_LOSS), TRADING_CONFIG.MAX_STOP_LOSS);
  
  if (regime === 'TREND_UP' || regime === 'DIP_UP') {
    action = "BUY";
    if (coin.rsi14 < 40) stopPercent *= 0.9; // Tighter stop on dips
  } else if (regime === 'TREND_DOWN') {
    action = "SELL";
  } else {
    return null; // No trade in choppy markets
  }
  
  const targetPercent = stopPercent * TRADING_CONFIG.PREFERRED_MIN_RR;
  const riskReward = targetPercent / stopPercent;
  
  if (riskReward < TRADING_CONFIG.MIN_RISK_REWARD) return null;
  
  const entryPrice = coin.currentPrice;
  const targetPrice = action === "BUY"
    ? entryPrice * (1 + targetPercent / 100)
    : entryPrice * (1 - targetPercent / 100);
  const stopLoss = action === "BUY"
    ? entryPrice * (1 - stopPercent / 100)
    : entryPrice * (1 + stopPercent / 100);
  
  return {
    action,
    entryPrice,
    targetPrice,
    stopLoss,
    targetPercent,
    riskPercent: stopPercent,
    riskReward,
    trendDirection: regime === 'TREND_UP' || regime === 'DIP_UP' ? "Bullish" : "Bearish"
  };
}

function calculateProbabilityScore(
  coin: EnrichedCoin,
  regime: MarketRegime,
  action: TradeAction,
  whaleIntent: WhaleIntent | null,
  whaleConfidence: number | null
): number {
  let score = 50; // Base score
  
  // Trend alignment (+/- 15)
  if (action === "BUY" && (regime === 'TREND_UP' || regime === 'DIP_UP')) score += 15;
  else if (action === "SELL" && regime === 'TREND_DOWN') score += 15;
  else score -= 10;
  
  // RSI confirmation (+/- 10)
  if (action === "BUY" && coin.rsi14 >= 30 && coin.rsi14 <= 50) score += 10;
  else if (action === "SELL" && coin.rsi14 >= 50 && coin.rsi14 <= 70) score += 10;
  
  // Volume confirmation (+5)
  if (coin.volumeToMcap > 0.05) score += 5;
  
  // Whale alignment (+/- 10)
  if (whaleIntent && whaleConfidence && whaleConfidence > 60) {
    if ((action === "BUY" && whaleIntent === "accumulating") ||
        (action === "SELL" && whaleIntent === "distributing")) {
      score += 10;
    } else if (whaleIntent !== "neutral") {
      score -= 5;
    }
  }
  
  // Market cap rank bonus (+5)
  if (coin.marketCapRank <= 10) score += 5;
  
  // Volatility sweet spot (+5)
  if (coin.volatilityScore >= 30 && coin.volatilityScore <= 60) score += 5;
  
  return Math.min(95, Math.max(0, score));
}

function calculateExpectedTimeToTarget(coin: EnrichedCoin, targetPercent: number): number {
  const dailyMove = Math.abs(coin.change24h);
  if (dailyMove < 0.5) return 96; // 4 days if very slow
  return Math.max(6, Math.min(72, targetPercent / (dailyMove / 24)));
}

// ═══════ AI-POWERED TRADE ANALYSIS ═══════

async function analyzeWithAI(
  opportunities: ScoredOpportunity[],
  marketRegime: MarketRegime,
  whaleIntent: WhaleIntent | null,
  systemPerformance: DerivedCounters
): Promise<{
  selectedIndex: number;
  reasoning: string;
  aiConfidenceBoost: number;
  riskWarnings: string[];
} | null> {
  try {
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      console.log("LOVABLE_API_KEY not set, skipping AI analysis");
      return null;
    }

    const top5 = opportunities.slice(0, 5);
    const prompt = `You are an elite crypto swing trading analyst. Analyze these potential trades and select the SINGLE BEST opportunity.

MARKET CONDITIONS:
- Regime: ${marketRegime}
- Whale Activity: ${whaleIntent || 'neutral'}
- Recent Performance: ${systemPerformance.successfulTrades}W / ${systemPerformance.failedTrades}L (${systemPerformance.accuracyPercent.toFixed(1)}%)
- Consecutive Losses: ${systemPerformance.consecutiveLosses}

TRADING OPPORTUNITIES (ranked by algorithm):
${top5.map((opp, i) => `
${i + 1}. ${opp.coin.symbol.toUpperCase()} - ${opp.action}
   - Entry: $${opp.entryPrice.toFixed(4)} | Target: +${opp.targetPercent.toFixed(1)}% | Stop: -${opp.riskPercent.toFixed(1)}%
   - R:R Ratio: ${opp.riskReward.toFixed(2)}
   - Algorithm Score: ${opp.probabilityScore}%
   - RSI(14): ${opp.coin.rsi14.toFixed(1)} | ATR(14): ${(opp.coin.atr14 / opp.coin.currentPrice * 100).toFixed(2)}%
   - 1h: ${opp.coin.change1h >= 0 ? '+' : ''}${opp.coin.change1h.toFixed(2)}% | 24h: ${opp.coin.change24h >= 0 ? '+' : ''}${opp.coin.change24h.toFixed(2)}% | 7d: ${opp.coin.change7d >= 0 ? '+' : ''}${opp.coin.change7d.toFixed(2)}%
   - Volume/MCap: ${(opp.coin.volumeToMcap * 100).toFixed(3)}%
   - Market Cap Rank: #${opp.coin.marketCapRank}
   - Algorithm Reasons: ${opp.reasonsForSelection.join(', ')}
`).join('')}

RULES:
- Quality over quantity - we only take HIGH PROBABILITY trades
- Consider risk management: ${systemPerformance.consecutiveLosses >= 2 ? 'BE EXTRA CAUTIOUS - multiple recent losses' : 'normal risk tolerance'}
- In ${marketRegime} regime, prioritize ${marketRegime === 'TREND_UP' || marketRegime === 'DIP_UP' ? 'BUY setups with strong momentum' : marketRegime === 'TREND_DOWN' ? 'SHORT setups with weak bounces' : 'only the clearest setups'}
- Missing trades is BETTER than bad trades

RESPOND IN EXACTLY THIS JSON FORMAT:
{
  "selectedIndex": <0-4 or -1 if none are good enough>,
  "reasoning": "<2-3 sentences explaining your selection>",
  "confidenceBoost": <-10 to +10 adjustment to algorithm score>,
  "riskWarnings": ["<any concerns>"]
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a professional crypto trading analyst. Be concise, analytical, and risk-aware. Respond ONLY with valid JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error:", response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error("No AI response content");
      return null;
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content;
    if (content.includes('```')) {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      jsonStr = match ? match[1].trim() : content;
    }
    
    const parsed = JSON.parse(jsonStr);
    console.log(`AI Analysis: Selected index ${parsed.selectedIndex}, boost: ${parsed.confidenceBoost}`);
    
    return {
      selectedIndex: parsed.selectedIndex,
      reasoning: parsed.reasoning || "AI analysis complete",
      aiConfidenceBoost: Math.max(-10, Math.min(10, parsed.confidenceBoost || 0)),
      riskWarnings: Array.isArray(parsed.riskWarnings) ? parsed.riskWarnings : []
    };
  } catch (error) {
    console.error("AI analysis error:", error);
    return null;
  }
}

// ═══════ WHALE INTELLIGENCE (MOCKED) ═══════

async function fetchWhaleIntelligence(supabaseUrl: string, serviceRoleKey: string): Promise<{
  intent: WhaleIntent;
  confidence: number;
} | null> {
  try {
    const mockTransactions = [];
    for (let i = 0; i < 10; i++) {
      mockTransactions.push({
        hash: `0x${Math.random().toString(16).slice(2, 66)}`,
        blockchain: Math.random() > 0.5 ? 'ethereum' : 'bitcoin',
        amount: Math.random() * 1000 + 100,
        amountUsd: Math.random() * 50000000 + 1000000,
        timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
        type: ['exchange_inflow', 'exchange_outflow', 'transfer'][Math.floor(Math.random() * 3)],
      });
    }
    
    const response = await fetch(`${supabaseUrl}/functions/v1/analyze-whale-intelligence`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ transactions: mockTransactions })
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
      intent: data.whaleIntent?.classification || 'neutral',
      confidence: data.confidenceScore || 0
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER - STRICT SINGLE TRADE ENFORCEMENT
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
    console.log("    ELITE SWING TRADING - STRICT SINGLE TRADE MODE");
    console.log("═══════════════════════════════════════════════════════");

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: CHECK FOR ANY ACTIVE TRADE - THIS IS ALWAYS THE FIRST CHECK
    // If active trade exists, return it immediately. NO SCANNING. NO CREATION.
    // ═══════════════════════════════════════════════════════════════════════════
    
    const activeTrade = await fetchAnyActiveTrade(supabase);
    
    if (activeTrade) {
      console.log(`═══ ACTIVE TRADE EXISTS: ${activeTrade.coinSymbol} ═══`);
      console.log("Returning active trade. No scanning. No creation.");
      
      // Load market data for current price
      const { data: marketData } = await supabase.storage.from(BUCKET_NAME).download(FILE_PATH);
      let currentPrice = activeTrade.entryPrice;
      let tradedCoin: EnrichedCoin | undefined;
      let marketRegime: MarketRegime = "CHOPPY";
      let updatedAt = new Date().toISOString();
      
      if (marketData) {
        const text = await marketData.text();
        const payload = JSON.parse(text) as StoredPayload;
        tradedCoin = payload.coins?.find(c => c.id === activeTrade.coinId);
        currentPrice = tradedCoin?.currentPrice || activeTrade.entryPrice;
        marketRegime = detectMarketRegime(payload.coins || []);
        updatedAt = payload.updatedAt;
      }
      
      const hoursInTrade = (Date.now() - new Date(activeTrade.createdAt).getTime()) / 3600000;
      const hoursUntilTimeout = TRADING_CONFIG.ENTRY_TIMEOUT_HOURS - hoursInTrade;
      
      // Check for entry fill (LIMIT orders)
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
          // Entry timeout - close as NOT_EXECUTED
          console.log("Entry timeout - marking as NOT_EXECUTED");
          await closeTrade(supabaseAdmin, activeTrade.id, 'NOT_EXECUTED', currentPrice, activeTrade.entryPrice, activeTrade.action);
          
          const counters = await deriveCountersFromHistory(supabase);
          const systemState = await fetchSystemState(supabase);
          
          return new Response(JSON.stringify({
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
            whaleIntent: null,
            whaleConfidence: null,
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
            reasoning: `Entry price not reached within ${TRADING_CONFIG.ENTRY_TIMEOUT_HOURS}h. Missing trades is acceptable.`,
            updatedAt,
            nextScanIn: "30m",
            timeUntilNextAction: "Entering cooldown",
            systemPerformance: { ...counters, id: systemState.id, mode: systemState.mode, currentState: 'NOT_EXECUTED', activeTradeId: null, lastTradeClosedAt: new Date().toISOString(), lastTradeResult: 'NOT_EXECUTED', cooldownEndsAt: null, lastScanAt: systemState.lastScanAt, capitalProtectionEnabled: false, capitalProtectionReason: null },
            activeTrade: null,
            tradeProgress: null
          } as TradeResult), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
      
      // Calculate P&L
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
      
      // Check if SL or TP hit - ONLY exit when SL or TP is hit
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
        
        const counters = await deriveCountersFromHistory(supabase);
        const systemState = await fetchSystemState(supabase);
        const cooldownMinutes = tradeResult === 'FAILED'
          ? TRADING_CONFIG.COOLDOWN_AFTER_LOSS_MINUTES
          : TRADING_CONFIG.COOLDOWN_AFTER_WIN_MINUTES;
        
        return new Response(JSON.stringify({
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
          whaleIntent: null,
          whaleConfidence: null,
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
          reasoning: `Trade CLOSED: ${tradeResult}. ${tradeResult === 'SUCCESS' ? 'Target' : 'Stop loss'} hit at $${currentPrice.toFixed(2)}. P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%. Entering ${cooldownMinutes}min cooldown.`,
          updatedAt,
          nextScanIn: `${cooldownMinutes}m`,
          timeUntilNextAction: "Entering cooldown",
          systemPerformance: { ...counters, id: systemState.id, mode: systemState.mode, currentState: 'TRADE_CLOSED', activeTradeId: null, lastTradeClosedAt: new Date().toISOString(), lastTradeResult: tradeResult, cooldownEndsAt: new Date(Date.now() + cooldownMinutes * 60 * 1000).toISOString(), lastScanAt: systemState.lastScanAt, capitalProtectionEnabled: counters.consecutiveLosses >= TRADING_CONFIG.MAX_CONSECUTIVE_LOSSES, capitalProtectionReason: counters.consecutiveLosses >= TRADING_CONFIG.MAX_CONSECUTIVE_LOSSES ? `${counters.consecutiveLosses} consecutive losses` : null },
          activeTrade: null,
          tradeProgress: { currentPnL: pnl, distanceToTarget: 0, distanceToStop: 0, timeInTrade: hoursInTrade, entryFilled: true, hoursUntilTimeout: 0 }
        } as TradeResult), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      
      // Update monitoring timestamp
      await supabaseAdmin.from('trade_history').update({ last_monitored_at: new Date().toISOString() }).eq('id', activeTrade.id);
      
      // Return active trade status
      const counters = await deriveCountersFromHistory(supabase);
      const systemState = await fetchSystemState(supabase);
      
      return new Response(JSON.stringify({
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
        whaleIntent: null,
        whaleConfidence: null,
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
          : `WAITING FOR ENTRY | Limit at $${activeTrade.entryPrice.toFixed(2)} | Current: $${currentPrice.toFixed(2)} | Timeout in ${formatTimeRemaining(hoursUntilTimeout)}`,
        updatedAt,
        nextScanIn: `${TRADING_CONFIG.TRADE_MONITOR_INTERVAL}m`,
        timeUntilNextAction: `Monitoring every ${TRADING_CONFIG.TRADE_MONITOR_INTERVAL}m`,
        systemPerformance: { ...counters, id: systemState.id, mode: systemState.mode, currentState: 'TRADE_ACTIVE', activeTradeId: activeTrade.id, lastTradeClosedAt: null, lastTradeResult: null, cooldownEndsAt: null, lastScanAt: systemState.lastScanAt, capitalProtectionEnabled: false, capitalProtectionReason: null },
        activeTrade,
        tradeProgress: { currentPnL: pnl, distanceToTarget, distanceToStop, timeInTrade: hoursInTrade, entryFilled, hoursUntilTimeout: Math.max(0, hoursUntilTimeout) }
      } as TradeResult), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: NO ACTIVE TRADE - Check cooldown and capital protection
    // ═══════════════════════════════════════════════════════════════════════════
    
    console.log("No active trade found. Checking cooldown status...");
    
    const counters = await deriveCountersFromHistory(supabase);
    const systemState = await fetchSystemState(supabase);
    const lastTrade = await getLastClosedTrade(supabase);
    const cooldownStatus = calculateCooldownStatus(lastTrade, counters.consecutiveLosses);
    
    console.log(`Counters: Total=${counters.totalTrades}, Won=${counters.successfulTrades}, Lost=${counters.failedTrades}, ConsecLosses=${counters.consecutiveLosses}`);
    console.log(`Cooldown: ${cooldownStatus.inCooldown ? 'YES' : 'NO'}, Protection: ${cooldownStatus.inProtection ? 'YES' : 'NO'}`);
    
    // Load market data
    const { data: marketData, error: marketError } = await supabase.storage.from(BUCKET_NAME).download(FILE_PATH);
    
    if (marketError || !marketData) {
      return new Response(JSON.stringify({ error: "Failed to load market data" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    const text = await marketData.text();
    const payload = JSON.parse(text) as StoredPayload;
    const coins = payload.coins ?? [];
    const marketRegime = detectMarketRegime(coins);
    
    // Build base system performance
    const basePerformance: SystemPerformance = {
      ...counters,
      id: systemState.id,
      mode: systemState.mode,
      currentState: 'WAITING',
      activeTradeId: null,
      lastTradeClosedAt: lastTrade?.closedAt || null,
      lastTradeResult: lastTrade?.result || null,
      cooldownEndsAt: cooldownStatus.endsAt?.toISOString() || null,
      lastScanAt: systemState.lastScanAt,
      capitalProtectionEnabled: cooldownStatus.inProtection,
      capitalProtectionReason: cooldownStatus.inProtection ? cooldownStatus.reason : null
    };
    
    // ═══════ CAPITAL PROTECTION ═══════
    if (cooldownStatus.inProtection) {
      console.log("═══ CAPITAL PROTECTION MODE ═══");
      const hoursLeft = cooldownStatus.endsAt ? (cooldownStatus.endsAt.getTime() - Date.now()) / 3600000 : 24;
      
      return new Response(JSON.stringify({
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
        whaleIntent: null,
        whaleConfidence: null,
        rsi14: 0,
        atr14: 0,
        priceChange1h: 0,
        priceChange24h: 0,
        priceChange7d: 0,
        volume24h: 0,
        marketCap: 0,
        marketCapRank: 0,
        trendAlignment: "N/A",
        filtersApplied: [],
        filtersPassed: [],
        filtersSkipped: ["Capital Protection Mode"],
        reasoning: `CAPITAL PROTECTION. ${cooldownStatus.reason}. Re-evaluating in ${formatTimeRemaining(hoursLeft)}.`,
        updatedAt: payload.updatedAt,
        nextScanIn: formatTimeRemaining(hoursLeft),
        timeUntilNextAction: formatTimeRemaining(hoursLeft),
        systemPerformance: { ...basePerformance, currentState: 'CAPITAL_PROTECTION' },
        activeTrade: null,
        tradeProgress: null
      } as TradeResult), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    // ═══════ COOLDOWN ═══════
    if (cooldownStatus.inCooldown) {
      console.log("═══ COOLDOWN ACTIVE ═══");
      const minutesLeft = cooldownStatus.endsAt ? (cooldownStatus.endsAt.getTime() - Date.now()) / 60000 : 30;
      
      return new Response(JSON.stringify({
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
        whaleIntent: null,
        whaleConfidence: null,
        rsi14: 0,
        atr14: 0,
        priceChange1h: 0,
        priceChange24h: 0,
        priceChange7d: 0,
        volume24h: 0,
        marketCap: 0,
        marketCapRank: 0,
        trendAlignment: "N/A",
        filtersApplied: [],
        filtersPassed: [],
        filtersSkipped: ["Cooldown active"],
        reasoning: `COOLDOWN. ${cooldownStatus.reason}. Next scan in ${formatTimeRemaining(minutesLeft / 60)}.`,
        updatedAt: payload.updatedAt,
        nextScanIn: formatTimeRemaining(minutesLeft / 60),
        timeUntilNextAction: formatTimeRemaining(minutesLeft / 60),
        systemPerformance: { ...basePerformance, currentState: 'COOLDOWN' },
        activeTrade: null,
        tradeProgress: null
      } as TradeResult), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: CHECK SCAN INTERVAL - Only scan on fixed intervals
    // ═══════════════════════════════════════════════════════════════════════════
    
    const scanCheck = shouldScan(systemState.lastScanAt);
    
    if (!scanCheck.canScan) {
      console.log(`Scan interval not reached. Last scan ${scanCheck.minutesSinceScan.toFixed(0)}m ago. Next in ${scanCheck.minutesUntilNext.toFixed(0)}m.`);
      
      return new Response(JSON.stringify({
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
        whaleIntent: null,
        whaleConfidence: null,
        rsi14: 0,
        atr14: 0,
        priceChange1h: 0,
        priceChange24h: 0,
        priceChange7d: 0,
        volume24h: 0,
        marketCap: 0,
        marketCapRank: 0,
        trendAlignment: "N/A",
        filtersApplied: [],
        filtersPassed: [],
        filtersSkipped: ["Scan interval not reached"],
        reasoning: `WAITING. Last scan ${scanCheck.minutesSinceScan.toFixed(0)}m ago. Next scan in ${scanCheck.minutesUntilNext.toFixed(0)}m. Missing trades is better than overtrading.`,
        updatedAt: payload.updatedAt,
        nextScanIn: `${Math.ceil(scanCheck.minutesUntilNext)}m`,
        timeUntilNextAction: `Next scan in ${Math.ceil(scanCheck.minutesUntilNext)}m`,
        systemPerformance: basePerformance,
        activeTrade: null,
        tradeProgress: null
      } as TradeResult), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 4: SCAN FOR OPPORTUNITIES
    // ═══════════════════════════════════════════════════════════════════════════
    
    console.log("═══ SCANNING FOR OPPORTUNITIES ═══");
    console.log(`Market Regime: ${marketRegime} | Min Probability: ${TRADING_CONFIG.MIN_PROBABILITY_SCORE}%`);
    
    // Update last scan timestamp
    await updateSystemState(supabaseAdmin, systemState.id, { last_scan_at: new Date().toISOString() });
    
    const whaleData = await fetchWhaleIntelligence(supabaseUrl, serviceRoleKey);
    const eligibleCoins = coins.filter(c => c.marketCapRank <= TRADING_CONFIG.MAX_RANK);
    const allFiltersApplied = ["4H/1D trend", "RSI", "Volatility", "Volume", "Liquidity", "Top 30"];
    
    const qualifiedOpportunities: ScoredOpportunity[] = [];
    
    for (const coin of eligibleCoins) {
      if (coin.currentPrice <= 0) continue;
      
      const filterResult = passesSetupFiltering(coin, marketRegime);
      if (!filterResult.passes) continue;
      
      const setup = calculateSwingTradeSetup(coin, marketRegime);
      if (!setup || setup.action === "NO_TRADE") continue;
      
      // Whale alignment check
      const whaleAligned = !whaleData || whaleData.intent === 'neutral' ||
        (setup.action === "BUY" && whaleData.intent === 'accumulating') ||
        (setup.action === "SELL" && whaleData.intent === 'distributing');
      
      if (whaleData && whaleData.confidence >= 70 && !whaleAligned) continue;
      
      const probabilityScore = calculateProbabilityScore(coin, marketRegime, setup.action, whaleData?.intent || null, whaleData?.confidence || null);
      if (probabilityScore < TRADING_CONFIG.MIN_PROBABILITY_SCORE) continue;
      
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
      
      console.log(`${coin.symbol}: QUALIFIED - Prob: ${probabilityScore}% | ETA: ${formatTimeRemaining(expectedTimeToTarget)}`);
    }
    
    // No qualified opportunities
    if (qualifiedOpportunities.length === 0) {
      console.log("No qualifying trade found");
      
      return new Response(JSON.stringify({
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
        filtersSkipped: [`No coins passed ${TRADING_CONFIG.MIN_PROBABILITY_SCORE}% threshold`],
        reasoning: `WAITING. No qualifying trade found. Scanned ${eligibleCoins.length} coins in ${marketRegime} regime. Missing trades is better than bad trades.`,
        updatedAt: payload.updatedAt,
        nextScanIn: `${TRADING_CONFIG.SCAN_INTERVAL_MINUTES}m`,
        timeUntilNextAction: `Next scan in ${TRADING_CONFIG.SCAN_INTERVAL_MINUTES}m`,
        systemPerformance: basePerformance,
        activeTrade: null,
        tradeProgress: null
      } as TradeResult), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 5: AI-ENHANCED TRADE SELECTION
    // ═══════════════════════════════════════════════════════════════════════════
    
    // First sort by algorithm score
    qualifiedOpportunities.sort((a, b) => {
      if (b.probabilityScore !== a.probabilityScore) return b.probabilityScore - a.probabilityScore;
      return a.expectedTimeToTarget - b.expectedTimeToTarget;
    });
    
    console.log("═══ AI ANALYSIS PHASE ═══");
    
    // Run AI analysis on top opportunities
    const aiAnalysis = await analyzeWithAI(
      qualifiedOpportunities,
      marketRegime,
      whaleData?.intent || null,
      counters
    );
    
    let selectedIndex = 0;
    let aiReasoning = "";
    let aiConfidenceBoost = 0;
    let aiRiskWarnings: string[] = [];
    
    if (aiAnalysis) {
      if (aiAnalysis.selectedIndex === -1) {
        // AI rejected all opportunities
        console.log("AI rejected all opportunities:", aiAnalysis.reasoning);
        
        return new Response(JSON.stringify({
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
          filtersApplied: [...allFiltersApplied, "AI Analysis"],
          filtersPassed: [],
          filtersSkipped: ["AI rejected all setups"],
          reasoning: `AI ANALYSIS: ${aiAnalysis.reasoning} ${aiAnalysis.riskWarnings.length > 0 ? 'Warnings: ' + aiAnalysis.riskWarnings.join(', ') : ''}`,
          updatedAt: payload.updatedAt,
          nextScanIn: `${TRADING_CONFIG.SCAN_INTERVAL_MINUTES}m`,
          timeUntilNextAction: `Next scan in ${TRADING_CONFIG.SCAN_INTERVAL_MINUTES}m`,
          systemPerformance: basePerformance,
          activeTrade: null,
          tradeProgress: null
        } as TradeResult), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      
      selectedIndex = Math.min(aiAnalysis.selectedIndex, qualifiedOpportunities.length - 1);
      aiReasoning = aiAnalysis.reasoning;
      aiConfidenceBoost = aiAnalysis.aiConfidenceBoost;
      aiRiskWarnings = aiAnalysis.riskWarnings;
      console.log(`AI selected opportunity #${selectedIndex + 1}: ${qualifiedOpportunities[selectedIndex].coin.symbol}`);
    } else {
      console.log("AI analysis unavailable, using algorithm selection");
    }
    
    const best = qualifiedOpportunities[selectedIndex];
    const entryType = Math.abs(best.coin.change1h) < 0.5 ? "IMMEDIATE" : "LIMIT";
    
    // Combine algorithm score with AI boost
    const finalProbabilityScore = Math.min(95, Math.max(0, best.probabilityScore + aiConfidenceBoost));
    
    const reasoning = aiReasoning 
      ? `🤖 AI: ${aiReasoning} | Algo: ${best.coin.name} @ ${best.probabilityScore}%${aiConfidenceBoost !== 0 ? ` (AI: ${aiConfidenceBoost >= 0 ? '+' : ''}${aiConfidenceBoost})` : ''}. Target: +${best.targetPercent.toFixed(1)}% (${best.riskReward.toFixed(1)}R).${aiRiskWarnings.length > 0 ? ' ⚠️ ' + aiRiskWarnings.join(', ') : ''}`
      : `${best.coin.name} selected. Prob: ${best.probabilityScore}%. ETA: ${formatTimeRemaining(best.expectedTimeToTarget)}. Target: +${best.targetPercent.toFixed(1)}% (${best.riskReward.toFixed(1)}R). Stop: -${best.riskPercent.toFixed(1)}%.`;
    
    const tradeResult: TradeResult = {
      coinId: best.coin.id,
      coinName: best.coin.name,
      coinSymbol: best.coin.symbol.toUpperCase(),
      coinImage: best.coin.image,
      action: best.action,
      status: "TRADE_READY",
      currentPrice: best.coin.currentPrice,
      entryPrice: best.entryPrice,
      targetPrice: best.targetPrice,
      stopLoss: best.stopLoss,
      targetPercent: best.targetPercent,
      riskPercent: best.riskPercent,
      riskReward: Number(best.riskReward.toFixed(2)),
      probabilityScore: finalProbabilityScore,
      expectedTimeToTarget: formatTimeRemaining(best.expectedTimeToTarget),
      confidenceScore: Math.min(95, finalProbabilityScore),
      entryType,
      marketRegime,
      whaleIntent: whaleData?.intent || null,
      whaleConfidence: whaleData?.confidence || null,
      rsi14: best.coin.rsi14,
      atr14: best.coin.atr14,
      priceChange1h: best.coin.change1h,
      priceChange24h: best.coin.change24h,
      priceChange7d: best.coin.change7d,
      volume24h: best.coin.volume24h,
      marketCap: best.coin.marketCap,
      marketCapRank: best.coin.marketCapRank,
      trendAlignment: best.trendDirection,
      filtersApplied: aiReasoning ? [...allFiltersApplied, "AI Analysis"] : allFiltersApplied,
      filtersPassed: best.filtersPassedList,
      filtersSkipped: aiRiskWarnings,
      reasoning,
      updatedAt: payload.updatedAt,
      nextScanIn: `${TRADING_CONFIG.TRADE_MONITOR_INTERVAL}m`,
      timeUntilNextAction: "Creating trade...",
      systemPerformance: basePerformance,
      activeTrade: null,
      tradeProgress: null
    };
    
    // Create trade record
    const tradeId = await createTradeRecord(supabaseAdmin, tradeResult);
    
    if (tradeId) {
      console.log(`═══ TRADE CREATED: ${best.action} ${best.coin.name} @ $${best.entryPrice.toFixed(2)} ═══`);
      
      tradeResult.status = "TRADE_ACTIVE";
      tradeResult.activeTrade = {
        id: tradeId,
        coinId: tradeResult.coinId,
        coinName: tradeResult.coinName,
        coinSymbol: tradeResult.coinSymbol,
        action: tradeResult.action as 'BUY' | 'SELL',
        entryPrice: tradeResult.entryPrice,
        targetPrice: tradeResult.targetPrice,
        stopLoss: tradeResult.stopLoss,
        entryType,
        entryFilled: entryType === 'IMMEDIATE',
        createdAt: new Date().toISOString(),
        lastMonitoredAt: new Date().toISOString()
      };
      tradeResult.systemPerformance.activeTradeId = tradeId;
      tradeResult.systemPerformance.currentState = 'TRADE_ACTIVE';
      tradeResult.timeUntilNextAction = entryType === 'IMMEDIATE'
        ? `Monitoring every ${TRADING_CONFIG.TRADE_MONITOR_INTERVAL}m`
        : `Waiting for entry (timeout: ${TRADING_CONFIG.ENTRY_TIMEOUT_HOURS}h)`;
      tradeResult.tradeProgress = {
        currentPnL: 0,
        distanceToTarget: best.targetPercent,
        distanceToStop: best.riskPercent,
        timeInTrade: 0,
        entryFilled: entryType === 'IMMEDIATE',
        hoursUntilTimeout: TRADING_CONFIG.ENTRY_TIMEOUT_HOURS
      };
    }
    
    return new Response(JSON.stringify(tradeResult), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    
  } catch (err) {
    console.error("Fatal error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
