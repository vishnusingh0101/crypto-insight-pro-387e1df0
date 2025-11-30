import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Analyzing top cryptocurrencies for best trade today");

    // Fetch top 20 coins
    const response = await fetch(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h,7d',
      {
        headers: { 'Accept': 'application/json' },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch crypto data: ${response.status}`);
    }

    const coins = await response.json();
    let bestTrade: any = null;
    let highestScore = 0;

    // Analyze each coin
    for (const coin of coins) {
      const priceChange24h = coin.price_change_percentage_24h || 0;
      const priceChange7d = coin.price_change_percentage_7d_in_currency || 0;
      const volumeRatio = coin.total_volume / coin.market_cap;
      const marketCapRank = coin.market_cap_rank || 100;

      // Calculate composite score
      let score = 0;
      
      // Technical scoring
      if (priceChange24h > 3) score += 25;
      else if (priceChange24h > 1) score += 15;
      else if (priceChange24h > 0) score += 10;
      
      if (priceChange7d > 5) score += 20;
      else if (priceChange7d > 0) score += 10;
      
      if (volumeRatio > 0.15) score += 20;
      else if (volumeRatio > 0.08) score += 10;

      // Fundamental scoring
      if (marketCapRank <= 10) score += 25;
      else if (marketCapRank <= 30) score += 15;
      else if (marketCapRank <= 50) score += 10;

      // Volatility bonus (for trading opportunity)
      if (Math.abs(priceChange24h) > 2) score += 10;

      const successProbability = Math.min(Math.max(score, 30), 92);

      if (score > highestScore) {
        highestScore = score;
        const currentPrice = coin.current_price;
        const action = priceChange24h > 0 && priceChange7d > 0 ? 'BUY' : 'SELL';
        
        bestTrade = {
          coinId: coin.id,
          coinName: coin.name,
          coinSymbol: coin.symbol.toUpperCase(),
          coinImage: coin.image,
          action,
          currentPrice,
          buyPrice: action === 'BUY' ? currentPrice : currentPrice * 0.96,
          targetPrice: action === 'BUY' 
            ? currentPrice * (1 + (successProbability / 250))
            : currentPrice * 0.92,
          stopLoss: action === 'BUY'
            ? currentPrice * 0.93
            : currentPrice * 1.08,
          successProbability: Math.round(successProbability),
          priceChange24h: parseFloat(priceChange24h.toFixed(2)),
          priceChange7d: parseFloat(priceChange7d.toFixed(2)),
          volumeRatio: parseFloat(volumeRatio.toFixed(4)),
          marketCapRank,
          reasoning: generateBestTradeReasoning(
            coin.name,
            action,
            priceChange24h,
            priceChange7d,
            volumeRatio,
            marketCapRank,
            successProbability
          ),
        };
      }
    }

    if (!bestTrade) {
      throw new Error("Unable to determine best trade");
    }

    // Calculate risk/reward
    bestTrade.riskReward = parseFloat(
      (Math.abs((bestTrade.targetPrice - bestTrade.buyPrice) / 
      (bestTrade.buyPrice - bestTrade.stopLoss))).toFixed(2)
    );

    console.log("Best trade identified:", bestTrade.coinName, "with", bestTrade.successProbability, "% probability");

    return new Response(JSON.stringify(bestTrade), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in best-trade-today function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function generateBestTradeReasoning(
  name: string,
  action: string,
  change24h: number,
  change7d: number,
  volume: number,
  rank: number,
  probability: number
): string {
  const reasons: string[] = [];

  if (action === 'BUY') {
    if (change24h > 2) reasons.push(`strong 24h momentum (+${change24h.toFixed(2)}%)`);
    if (change7d > 3) reasons.push(`positive weekly trend (+${change7d.toFixed(2)}%)`);
    if (volume > 0.12) reasons.push("high trading volume");
    if (rank <= 20) reasons.push(`top ${rank} market position`);
  } else {
    if (change24h < -2) reasons.push(`bearish momentum (${change24h.toFixed(2)}%)`);
    if (change7d < -3) reasons.push(`negative trend (${change7d.toFixed(2)}%)`);
    reasons.push("protective position recommended");
  }

  return `${name} identified as today's best trading opportunity with ${probability}% success probability. ${action} signal based on: ${reasons.join(", ")}. This represents the strongest risk-adjusted setup among top cryptocurrencies today.`;
}
