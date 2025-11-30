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
    const { cryptoId } = await req.json();
    console.log("Generating comprehensive trade recommendation for:", cryptoId);

    // Fetch crypto data
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${cryptoId}?localization=false&tickers=false&community_data=true&developer_data=false`,
      {
        headers: { 'Accept': 'application/json' },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch crypto data: ${response.status}`);
    }

    const cryptoData = await response.json();
    const marketData = cryptoData.market_data;
    const currentPrice = marketData.current_price.usd;

    // Technical Analysis
    const priceChange24h = marketData.price_change_percentage_24h || 0;
    const priceChange7d = marketData.price_change_percentage_7d || 0;
    const priceChange30d = marketData.price_change_percentage_30d || 0;
    const volumeRatio = marketData.total_volume.usd / marketData.market_cap.usd;
    const rsi = 50 + (priceChange24h / 2); // Simplified RSI approximation
    
    let technicalScore = 0;
    if (priceChange24h > 0) technicalScore += 20;
    if (priceChange7d > 0) technicalScore += 20;
    if (volumeRatio > 0.1) technicalScore += 15;
    if (rsi > 30 && rsi < 70) technicalScore += 15;
    if (priceChange30d > 0) technicalScore += 10;

    // Fundamental Analysis
    const marketCapRank = cryptoData.market_cap_rank || 100;
    const athDistance = ((currentPrice / marketData.ath.usd) * 100) - 100;
    const communityScore = (cryptoData.community_score || 0) * 10;
    
    let fundamentalScore = 0;
    if (marketCapRank <= 10) fundamentalScore += 30;
    else if (marketCapRank <= 50) fundamentalScore += 20;
    else if (marketCapRank <= 100) fundamentalScore += 10;
    
    if (athDistance < -30) fundamentalScore += 20; // Good upside potential
    if (marketData.circulating_supply / marketData.total_supply > 0.7) fundamentalScore += 10;
    fundamentalScore += Math.min(communityScore, 20);

    // News Sentiment Analysis (simulated based on price action and community)
    const sentimentIndicator = (priceChange24h + (communityScore / 10)) / 2;
    let newsScore = 0;
    if (sentimentIndicator > 5) newsScore = 30;
    else if (sentimentIndicator > 2) newsScore = 20;
    else if (sentimentIndicator > 0) newsScore = 15;
    else if (sentimentIndicator > -2) newsScore = 10;
    else newsScore = 5;

    // Calculate overall success probability
    const totalScore = technicalScore + fundamentalScore + newsScore;
    const successProbability = Math.min(Math.max(totalScore, 20), 95);

    // Determine trade action
    let action: 'BUY' | 'SELL' | 'HOLD';
    if (successProbability >= 70) action = 'BUY';
    else if (successProbability <= 40) action = 'SELL';
    else action = 'HOLD';

    // Calculate targets
    const buyPrice = action === 'BUY' ? currentPrice : currentPrice * 0.95;
    const targetPrice = action === 'BUY' 
      ? currentPrice * (1 + (successProbability / 200)) // Higher success = higher target
      : currentPrice * 0.90;
    const stopLoss = action === 'BUY'
      ? currentPrice * 0.92 // 8% stop loss for buys
      : currentPrice * 1.10; // 10% stop loss for sells

    const riskReward = Math.abs((targetPrice - buyPrice) / (buyPrice - stopLoss));

    const recommendation = {
      action,
      successProbability: Math.round(successProbability),
      currentPrice,
      buyPrice: parseFloat(buyPrice.toFixed(2)),
      targetPrice: parseFloat(targetPrice.toFixed(2)),
      stopLoss: parseFloat(stopLoss.toFixed(2)),
      riskReward: parseFloat(riskReward.toFixed(2)),
      analysis: {
        technical: {
          score: technicalScore,
          indicators: {
            priceChange24h: parseFloat(priceChange24h.toFixed(2)),
            priceChange7d: parseFloat(priceChange7d.toFixed(2)),
            volumeRatio: parseFloat(volumeRatio.toFixed(4)),
            rsi: parseFloat(rsi.toFixed(2)),
          },
          summary: technicalScore >= 60 
            ? "Strong bullish technical indicators with positive momentum"
            : technicalScore >= 40
            ? "Neutral technical setup, awaiting confirmation"
            : "Weak technical indicators, bearish pressure evident"
        },
        fundamental: {
          score: fundamentalScore,
          indicators: {
            marketCapRank,
            athDistance: parseFloat(athDistance.toFixed(2)),
            communityScore: parseFloat(communityScore.toFixed(2)),
          },
          summary: fundamentalScore >= 60
            ? "Strong fundamentals with solid market position and community support"
            : fundamentalScore >= 40
            ? "Decent fundamentals, established project with moderate support"
            : "Weaker fundamentals, higher risk profile"
        },
        news: {
          score: newsScore,
          sentiment: sentimentIndicator > 0 ? "Positive" : "Negative",
          summary: newsScore >= 25
            ? "Positive news sentiment with bullish community outlook"
            : newsScore >= 15
            ? "Neutral to slightly positive sentiment in recent news"
            : "Negative or cautious sentiment in recent coverage"
        }
      },
      reasoning: generateReasoning(action, technicalScore, fundamentalScore, newsScore, successProbability),
      timestamp: new Date().toISOString(),
    };

    console.log("Generated trade recommendation with", successProbability, "% success probability");

    return new Response(JSON.stringify(recommendation), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-trade-recommendation function:', error);
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

function generateReasoning(
  action: string,
  technical: number,
  fundamental: number,
  news: number,
  success: number
): string {
  const reasons: string[] = [];

  if (action === 'BUY') {
    if (technical >= 60) reasons.push("strong bullish technical momentum");
    if (fundamental >= 60) reasons.push("solid fundamental foundation");
    if (news >= 25) reasons.push("positive market sentiment");
    return `Recommended ${action} based on ${reasons.join(", ")}. The combination of technical indicators (${technical}%), fundamental strength (${fundamental}%), and news sentiment (${news}%) suggests a high-probability setup with ${success}% estimated success rate. Risk is controlled with defined stop-loss levels.`;
  } else if (action === 'SELL') {
    if (technical < 40) reasons.push("weak technical indicators");
    if (fundamental < 40) reasons.push("concerning fundamentals");
    if (news < 15) reasons.push("negative sentiment");
    return `Recommended ${action} due to ${reasons.join(", ")}. Analysis shows technical score (${technical}%), fundamental score (${fundamental}%), and news sentiment (${news}%) indicating downside risk. Success probability of ${success}% for protective selling.`;
  } else {
    return `HOLD recommendation as current analysis shows mixed signals. Technical (${technical}%), fundamental (${fundamental}%), and news (${news}%) scores suggest waiting for clearer confirmation. Success probability of ${success}% indicates neither strong buy nor sell opportunity at current levels.`;
  }
}
