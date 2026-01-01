import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration for conservative whale analysis
const INTELLIGENCE_CONFIG = {
  MIN_CONFIDENCE_FOR_ALERT: 70,
  HIGH_VOLATILITY_THRESHOLD: 5, // 5% 24h change
  SIGNIFICANT_WHALE_VOLUME_RATIO: 0.15, // 15% of daily volume
  MIN_TRANSACTION_COUNT: 3, // Minimum transactions to form opinion
  ACCUMULATION_THRESHOLD: 1.5, // 50% more outflows than inflows
  DISTRIBUTION_THRESHOLD: 1.5, // 50% more inflows than outflows
};

interface WhaleTransaction {
  hash: string;
  blockchain: string;
  amount: number;
  amountUsd: number;
  from: string;
  to: string;
  fromLabel?: string;
  toLabel?: string;
  timestamp: string;
  type: 'transfer' | 'exchange_inflow' | 'exchange_outflow' | 'unknown';
  significance: 'high' | 'medium' | 'low';
}

interface MarketContext {
  btcPrice: number;
  ethPrice: number;
  btcChange24h: number;
  ethChange24h: number;
  btcChange7d: number;
  ethChange7d: number;
  volatilityState: 'low' | 'medium' | 'high';
  trendDirection: 'bullish' | 'bearish' | 'sideways';
  supportProximity: 'near_support' | 'near_resistance' | 'neutral';
}

interface WhaleIntelligence {
  // Market Bias (simple language)
  marketBias: {
    shortTerm: 'bullish' | 'bearish' | 'neutral'; // Intraday
    intraday: 'bullish' | 'bearish' | 'neutral'; // 4h-24h
    swing: 'bullish' | 'bearish' | 'neutral'; // Multi-day
  };
  
  // Whale Intent Summary
  whaleIntent: {
    classification: 'accumulating' | 'distributing' | 'neutral';
    strength: 'strong' | 'moderate' | 'weak';
    description: string;
  };
  
  // Action Guidance
  actionGuidance: {
    recommendation: 'trade' | 'wait' | 'avoid';
    reason: string;
    details: string;
  };
  
  // Risk Warnings
  riskWarnings: {
    level: 'low' | 'medium' | 'high';
    warnings: string[];
  };
  
  // Confidence Score (0-100)
  confidenceScore: number;
  confidenceFactors: string[];
  
  // Alert eligibility
  shouldAlert: boolean;
  alertMessage: string | null;
  
  // Raw metrics for display
  metrics: {
    totalVolume: number;
    transactionCount: number;
    inflowCount: number;
    outflowCount: number;
    netFlow: number;
    largestTx: number;
    avgTxSize: number;
  };
  
  // Market context
  marketContext: MarketContext;
  
  timestamp: string;
}

// Fetch current market prices and changes
async function fetchMarketContext(): Promise<MarketContext> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true&include_7d_change=true',
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) {
      console.error('CoinGecko price fetch failed');
      return getDefaultMarketContext();
    }
    
    const data = await response.json();
    
    const btcChange24h = data.bitcoin?.usd_24h_change || 0;
    const ethChange24h = data.ethereum?.usd_24h_change || 0;
    const avgChange = (Math.abs(btcChange24h) + Math.abs(ethChange24h)) / 2;
    
    // Determine volatility state
    let volatilityState: 'low' | 'medium' | 'high' = 'low';
    if (avgChange > 8) volatilityState = 'high';
    else if (avgChange > 4) volatilityState = 'medium';
    
    // Determine trend direction
    let trendDirection: 'bullish' | 'bearish' | 'sideways' = 'sideways';
    const combinedChange = btcChange24h + ethChange24h;
    if (combinedChange > 3) trendDirection = 'bullish';
    else if (combinedChange < -3) trendDirection = 'bearish';
    
    // Determine support/resistance proximity (simplified)
    let supportProximity: 'near_support' | 'near_resistance' | 'neutral' = 'neutral';
    if (btcChange24h < -5) supportProximity = 'near_support';
    else if (btcChange24h > 5) supportProximity = 'near_resistance';
    
    return {
      btcPrice: data.bitcoin?.usd || 0,
      ethPrice: data.ethereum?.usd || 0,
      btcChange24h,
      ethChange24h,
      btcChange7d: data.bitcoin?.usd_7d_change || 0,
      ethChange7d: data.ethereum?.usd_7d_change || 0,
      volatilityState,
      trendDirection,
      supportProximity,
    };
  } catch (error) {
    console.error('Error fetching market context:', error);
    return getDefaultMarketContext();
  }
}

function getDefaultMarketContext(): MarketContext {
  return {
    btcPrice: 0,
    ethPrice: 0,
    btcChange24h: 0,
    ethChange24h: 0,
    btcChange7d: 0,
    ethChange7d: 0,
    volatilityState: 'medium',
    trendDirection: 'sideways',
    supportProximity: 'neutral',
  };
}

// Classify whale intent based on transaction patterns
function classifyWhaleIntent(
  transactions: WhaleTransaction[]
): WhaleIntelligence['whaleIntent'] {
  if (transactions.length < INTELLIGENCE_CONFIG.MIN_TRANSACTION_COUNT) {
    return {
      classification: 'neutral',
      strength: 'weak',
      description: 'Insufficient data to determine whale intent. Waiting for more transactions.',
    };
  }
  
  const inflows = transactions.filter(tx => tx.type === 'exchange_inflow');
  const outflows = transactions.filter(tx => tx.type === 'exchange_outflow');
  
  const inflowVolume = inflows.reduce((sum, tx) => sum + tx.amountUsd, 0);
  const outflowVolume = outflows.reduce((sum, tx) => sum + tx.amountUsd, 0);
  
  const ratio = inflowVolume > 0 ? outflowVolume / inflowVolume : outflowVolume > 0 ? 10 : 1;
  
  if (ratio >= INTELLIGENCE_CONFIG.ACCUMULATION_THRESHOLD) {
    const strength = ratio >= 2.5 ? 'strong' : ratio >= 1.8 ? 'moderate' : 'weak';
    return {
      classification: 'accumulating',
      strength,
      description: `Whales are moving coins OFF exchanges. This typically signals long-term holding intentions. ${outflows.length} outflow transactions vs ${inflows.length} inflows.`,
    };
  }
  
  if (ratio <= 1 / INTELLIGENCE_CONFIG.DISTRIBUTION_THRESHOLD) {
    const strength = ratio <= 0.4 ? 'strong' : ratio <= 0.55 ? 'moderate' : 'weak';
    return {
      classification: 'distributing',
      strength,
      description: `Whales are moving coins TO exchanges. This may indicate upcoming selling pressure. ${inflows.length} inflow transactions vs ${outflows.length} outflows.`,
    };
  }
  
  return {
    classification: 'neutral',
    strength: 'moderate',
    description: `Balanced whale activity with no clear directional bias. Exchange flows are roughly equal.`,
  };
}

// Determine market bias based on whale activity and market context
function determineMarketBias(
  transactions: WhaleTransaction[],
  whaleIntent: WhaleIntelligence['whaleIntent'],
  marketContext: MarketContext
): WhaleIntelligence['marketBias'] {
  // Short-term (intraday) - based on recent whale activity
  let shortTerm: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (whaleIntent.classification === 'accumulating' && whaleIntent.strength !== 'weak') {
    shortTerm = 'bullish';
  } else if (whaleIntent.classification === 'distributing' && whaleIntent.strength !== 'weak') {
    shortTerm = 'bearish';
  }
  
  // Intraday (4h-24h) - combine whale intent with price action
  let intraday: 'bullish' | 'bearish' | 'neutral' = 
    marketContext.trendDirection === 'sideways' ? 'neutral' : marketContext.trendDirection;
  if (whaleIntent.classification === 'accumulating' && marketContext.trendDirection !== 'bearish') {
    intraday = 'bullish';
  } else if (whaleIntent.classification === 'distributing' && marketContext.trendDirection !== 'bullish') {
    intraday = 'bearish';
  }
  
  // Swing (multi-day) - look at 7d trends and larger patterns
  let swing: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  const avgChange7d = (marketContext.btcChange7d + marketContext.ethChange7d) / 2;
  if (avgChange7d > 5 && whaleIntent.classification !== 'distributing') {
    swing = 'bullish';
  } else if (avgChange7d < -5 && whaleIntent.classification !== 'accumulating') {
    swing = 'bearish';
  }
  
  return { shortTerm, intraday, swing };
}

// Generate action guidance
function generateActionGuidance(
  whaleIntent: WhaleIntelligence['whaleIntent'],
  marketContext: MarketContext,
  confidenceScore: number,
  riskLevel: 'low' | 'medium' | 'high'
): WhaleIntelligence['actionGuidance'] {
  // Avoid conditions
  if (marketContext.volatilityState === 'high') {
    return {
      recommendation: 'avoid',
      reason: 'High market volatility',
      details: 'The market is experiencing high volatility. Even clear whale signals may be unreliable. Wait for conditions to stabilize.',
    };
  }
  
  if (confidenceScore < 50) {
    return {
      recommendation: 'wait',
      reason: 'Low confidence in analysis',
      details: 'Not enough data or conflicting signals. Continue monitoring for clearer patterns.',
    };
  }
  
  if (riskLevel === 'high') {
    return {
      recommendation: 'avoid',
      reason: 'Multiple risk factors present',
      details: 'Current market conditions present elevated risks. Capital preservation should be priority.',
    };
  }
  
  // Wait conditions
  if (whaleIntent.classification === 'neutral' || whaleIntent.strength === 'weak') {
    return {
      recommendation: 'wait',
      reason: 'No clear whale direction',
      details: 'Whale activity shows no strong directional bias. Wait for clearer accumulation or distribution patterns.',
    };
  }
  
  // Trade conditions (riskLevel is already not 'high' at this point)
  if (confidenceScore >= 70) {
    if (whaleIntent.classification === 'accumulating' && marketContext.trendDirection !== 'bearish') {
      return {
        recommendation: 'trade',
        reason: 'Whale accumulation with favorable conditions',
        details: 'Strong whale outflows from exchanges suggest accumulation. Consider long positions with proper risk management.',
      };
    }
    
    if (whaleIntent.classification === 'distributing' && marketContext.trendDirection !== 'bullish') {
      return {
        recommendation: 'trade',
        reason: 'Whale distribution with favorable conditions',
        details: 'Heavy whale inflows to exchanges suggest distribution. Consider defensive positioning or short positions.',
      };
    }
  }
  
  return {
    recommendation: 'wait',
    reason: 'Conditions not optimal',
    details: 'While there are some signals, conditions are not ideal for high-probability trades. Continue monitoring.',
  };
}

// Assess risk warnings
function assessRiskWarnings(
  transactions: WhaleTransaction[],
  marketContext: MarketContext
): WhaleIntelligence['riskWarnings'] {
  const warnings: string[] = [];
  let riskScore = 0;
  
  // High volatility warning
  if (marketContext.volatilityState === 'high') {
    warnings.push('Market is experiencing high volatility - expect large price swings');
    riskScore += 30;
  } else if (marketContext.volatilityState === 'medium') {
    riskScore += 10;
  }
  
  // Check for potential fake/suspicious activity
  const highValueTxs = transactions.filter(tx => tx.significance === 'high');
  const avgInterval = transactions.length > 1
    ? (new Date(transactions[0].timestamp).getTime() - new Date(transactions[transactions.length - 1].timestamp).getTime()) / transactions.length
    : 0;
  
  // Too many high-value transactions in short time could be wash trading
  if (highValueTxs.length > 5 && avgInterval < 60000) { // 5+ high value in <1 min each
    warnings.push('Unusual transaction frequency detected - possible wash trading or automated activity');
    riskScore += 25;
  }
  
  // Internal exchange shuffles warning
  const unknownTypeTxs = transactions.filter(tx => tx.type === 'unknown' || tx.type === 'transfer');
  if (unknownTypeTxs.length > transactions.length * 0.6) {
    warnings.push('Most transactions are wallet-to-wallet transfers - intent unclear');
    riskScore += 15;
  }
  
  // News/event risk (based on extreme moves)
  if (Math.abs(marketContext.btcChange24h) > 10 || Math.abs(marketContext.ethChange24h) > 10) {
    warnings.push('Extreme price movement detected - likely news or event driven');
    riskScore += 20;
  }
  
  // Low transaction count warning
  if (transactions.length < 5) {
    warnings.push('Limited transaction data - analysis may be less reliable');
    riskScore += 10;
  }
  
  // Determine risk level
  let level: 'low' | 'medium' | 'high' = 'low';
  if (riskScore >= 50) level = 'high';
  else if (riskScore >= 25) level = 'medium';
  
  if (warnings.length === 0) {
    warnings.push('No significant risk factors detected');
  }
  
  return { level, warnings };
}

// Calculate confidence score
function calculateConfidenceScore(
  transactions: WhaleTransaction[],
  whaleIntent: WhaleIntelligence['whaleIntent'],
  marketContext: MarketContext
): { score: number; factors: string[] } {
  let score = 50; // Base score
  const factors: string[] = [];
  
  // Transaction count factor (+20 max)
  if (transactions.length >= 10) {
    score += 20;
    factors.push('Sufficient transaction sample size ✓');
  } else if (transactions.length >= 5) {
    score += 10;
    factors.push('Moderate transaction count');
  } else {
    score -= 15;
    factors.push('Limited transactions ✗');
  }
  
  // Whale intent clarity (+15 max)
  if (whaleIntent.strength === 'strong') {
    score += 15;
    factors.push('Clear directional whale intent ✓');
  } else if (whaleIntent.strength === 'moderate') {
    score += 8;
    factors.push('Moderate whale intent signal');
  } else {
    factors.push('Weak whale intent signal ✗');
  }
  
  // Trend alignment (+15 max)
  if (
    (whaleIntent.classification === 'accumulating' && marketContext.trendDirection === 'bullish') ||
    (whaleIntent.classification === 'distributing' && marketContext.trendDirection === 'bearish')
  ) {
    score += 15;
    factors.push('Whale activity aligns with price trend ✓');
  } else if (
    (whaleIntent.classification === 'accumulating' && marketContext.trendDirection === 'bearish') ||
    (whaleIntent.classification === 'distributing' && marketContext.trendDirection === 'bullish')
  ) {
    score -= 10;
    factors.push('Whale activity contradicts price trend ✗');
  } else {
    factors.push('Price trend is neutral');
  }
  
  // Market stability (+10 max)
  if (marketContext.volatilityState === 'low') {
    score += 10;
    factors.push('Stable market conditions ✓');
  } else if (marketContext.volatilityState === 'high') {
    score -= 15;
    factors.push('High volatility reduces reliability ✗');
  }
  
  // High significance transactions (+10 max)
  const highSigCount = transactions.filter(tx => tx.significance === 'high').length;
  if (highSigCount >= 3) {
    score += 10;
    factors.push('Multiple high-value whale transactions ✓');
  }
  
  return { score: Math.max(0, Math.min(100, score)), factors };
}

// Generate alert message if conditions are met
function generateAlert(
  intelligence: Partial<WhaleIntelligence>
): { shouldAlert: boolean; message: string | null } {
  if (!intelligence.confidenceScore || intelligence.confidenceScore < INTELLIGENCE_CONFIG.MIN_CONFIDENCE_FOR_ALERT) {
    return { shouldAlert: false, message: null };
  }
  
  if (!intelligence.whaleIntent || intelligence.whaleIntent.strength === 'weak') {
    return { shouldAlert: false, message: null };
  }
  
  if (!intelligence.marketContext || intelligence.marketContext.volatilityState === 'high') {
    return { shouldAlert: false, message: null };
  }
  
  if (!intelligence.riskWarnings || intelligence.riskWarnings.level === 'high') {
    return { shouldAlert: false, message: null };
  }
  
  // Build alert message
  const intent = intelligence.whaleIntent.classification;
  const action = intelligence.actionGuidance?.recommendation;
  
  let message = '';
  
  if (intent === 'accumulating') {
    message = `🐋 WHALE ACCUMULATION DETECTED | Confidence: ${intelligence.confidenceScore}% | Large exchange outflows suggest smart money is buying. `;
  } else if (intent === 'distributing') {
    message = `🐋 WHALE DISTRIBUTION DETECTED | Confidence: ${intelligence.confidenceScore}% | Large exchange inflows suggest potential selling pressure ahead. `;
  }
  
  if (action === 'trade') {
    message += `Action: Consider ${intent === 'accumulating' ? 'long' : 'defensive'} positions. `;
  } else if (action === 'wait') {
    message += `Action: Continue monitoring for confirmation. `;
  }
  
  message += `This is not financial advice.`;
  
  return { shouldAlert: true, message };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transactions, summary } = await req.json();
    
    console.log(`Analyzing whale intelligence for ${transactions?.length || 0} transactions`);
    
    // Validate input
    if (!transactions || !Array.isArray(transactions)) {
      return new Response(
        JSON.stringify({ error: "Invalid transactions data" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    // Fetch market context
    const marketContext = await fetchMarketContext();
    
    // Classify whale intent
    const whaleIntent = classifyWhaleIntent(transactions);
    
    // Assess risk warnings
    const riskWarnings = assessRiskWarnings(transactions, marketContext);
    
    // Calculate confidence score
    const { score: confidenceScore, factors: confidenceFactors } = calculateConfidenceScore(
      transactions,
      whaleIntent,
      marketContext
    );
    
    // Determine market bias
    const marketBias = determineMarketBias(transactions, whaleIntent, marketContext);
    
    // Generate action guidance
    const actionGuidance = generateActionGuidance(
      whaleIntent,
      marketContext,
      confidenceScore,
      riskWarnings.level
    );
    
    // Calculate metrics
    const metrics = {
      totalVolume: transactions.reduce((sum: number, tx: WhaleTransaction) => sum + tx.amountUsd, 0),
      transactionCount: transactions.length,
      inflowCount: transactions.filter((tx: WhaleTransaction) => tx.type === 'exchange_inflow').length,
      outflowCount: transactions.filter((tx: WhaleTransaction) => tx.type === 'exchange_outflow').length,
      netFlow: summary?.exchangeOutflows - summary?.exchangeInflows || 0,
      largestTx: Math.max(...transactions.map((tx: WhaleTransaction) => tx.amountUsd), 0),
      avgTxSize: transactions.length > 0 
        ? transactions.reduce((sum: number, tx: WhaleTransaction) => sum + tx.amountUsd, 0) / transactions.length 
        : 0,
    };
    
    // Partial intelligence for alert generation
    const partialIntelligence: Partial<WhaleIntelligence> = {
      whaleIntent,
      marketContext,
      riskWarnings,
      confidenceScore,
      actionGuidance,
    };
    
    // Generate alert if conditions are met
    const { shouldAlert, message: alertMessage } = generateAlert(partialIntelligence);
    
    const intelligence: WhaleIntelligence = {
      marketBias,
      whaleIntent,
      actionGuidance,
      riskWarnings,
      confidenceScore,
      confidenceFactors,
      shouldAlert,
      alertMessage,
      metrics,
      marketContext,
      timestamp: new Date().toISOString(),
    };
    
    console.log(`Whale intelligence analysis complete: confidence=${confidenceScore}, intent=${whaleIntent.classification}, action=${actionGuidance.recommendation}`);
    
    return new Response(
      JSON.stringify(intelligence),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error("Error analyzing whale intelligence:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
