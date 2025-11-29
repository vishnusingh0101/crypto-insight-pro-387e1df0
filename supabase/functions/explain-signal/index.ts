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
    console.log("Generating AI explanation for:", cryptoId);

    // Fetch crypto data
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${cryptoId}?localization=false&tickers=false&community_data=false&developer_data=false`,
      {
        headers: { 'Accept': 'application/json' },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch crypto data: ${response.status}`);
    }

    const cryptoData = await response.json();
    const marketData = cryptoData.market_data;

    // Calculate feature importance (SHAP-inspired approach)
    const priceChange = marketData.price_change_percentage_24h;
    const volumeRatio = marketData.total_volume.usd / marketData.market_cap.usd;
    const athDistance = ((marketData.current_price.usd / marketData.ath.usd) * 100) - 100;
    const marketCapRank = cryptoData.market_cap_rank || 100;

    // Generate feature importance scores
    const features = [
      {
        name: "24h Price Momentum",
        impact: priceChange / 100, // Normalize to -1 to 1
        description: priceChange > 0 
          ? `Positive momentum of ${priceChange.toFixed(2)}% indicates bullish sentiment and growing demand.`
          : `Negative momentum of ${priceChange.toFixed(2)}% suggests bearish pressure and potential selling.`,
      },
      {
        name: "Volume-to-Market Cap Ratio",
        impact: Math.min(volumeRatio * 5, 1), // Scale and cap at 1
        description: volumeRatio > 0.1
          ? "High trading activity relative to market cap signals strong investor interest and liquidity."
          : "Normal trading volume indicates stable market conditions without excessive speculation.",
      },
      {
        name: "Distance from All-Time High",
        impact: athDistance / 100, // Negative values indicate potential upside
        description: athDistance < -50
          ? "Significant distance from ATH presents potential mean reversion opportunity with reduced downside risk."
          : "Price near recent highs suggests caution and need for breakout confirmation.",
      },
      {
        name: "Market Position",
        impact: (100 - marketCapRank) / 100 * 0.5, // Higher rank = positive impact
        description: marketCapRank <= 20
          ? "Top-tier cryptocurrency with established market presence and institutional backing."
          : "Mid-tier asset with growth potential but higher volatility risk.",
      },
      {
        name: "Volatility Index",
        impact: Math.abs(priceChange) > 5 ? -0.3 : 0.2,
        description: Math.abs(priceChange) > 5
          ? "High volatility detected. Increased risk requires tighter stop-loss management."
          : "Stable price action indicates controlled market dynamics and lower short-term risk.",
      },
    ];

    // Sort by absolute impact
    features.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

    // Generate summary
    const dominantFeatures = features.slice(0, 3);
    const summary = `The AI model's decision is primarily driven by ${dominantFeatures[0].name.toLowerCase()} 
    (${(dominantFeatures[0].impact * 100).toFixed(1)}% influence), followed by ${dominantFeatures[1].name.toLowerCase()} 
    and ${dominantFeatures[2].name.toLowerCase()}. These factors collectively indicate 
    ${priceChange > 0 ? "bullish" : "bearish"} market conditions with 
    ${Math.abs(priceChange) > 5 ? "elevated" : "moderate"} risk levels.`;

    const explanation = {
      features,
      summary,
      timestamp: new Date().toISOString(),
    };

    console.log("Generated explainable AI analysis");

    return new Response(JSON.stringify(explanation), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in explain-signal function:', error);
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
