import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhaleAlert {
  type: 'accumulation' | 'distribution' | 'large_movement';
  severity: 'high' | 'medium' | 'low';
  message: string;
  volumeRatio: number;
  normalVolume24h: number;
  currentVolume: number;
  priceImpact: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { coinId } = await req.json();
    
    if (!coinId) {
      return new Response(
        JSON.stringify({ error: "coinId is required" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Detecting whale activity for: ${coinId}`);

    // Fetch coin data from CoinGecko with market details
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=true&market_data=true&community_data=false&developer_data=false`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      console.error(`CoinGecko API error: ${response.status}`);
      return new Response(
        JSON.stringify({ 
          whaleActivity: null, 
          message: "Unable to fetch market data" 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const coinData = await response.json();
    const marketData = coinData.market_data;
    
    // Calculate volume metrics
    const volume24h = marketData?.total_volume?.usd || 0;
    const marketCap = marketData?.market_cap?.usd || 0;
    const priceChange1h = marketData?.price_change_percentage_1h_in_currency?.usd || 0;
    const priceChange24h = marketData?.price_change_percentage_24h || 0;
    const priceChange7d = marketData?.price_change_percentage_7d || 0;
    const high24h = marketData?.high_24h?.usd || 0;
    const low24h = marketData?.low_24h?.usd || 0;
    const currentPrice = marketData?.current_price?.usd || 0;
    
    // Volume to Market Cap ratio - indicator of unusual activity
    const volumeToMcapRatio = marketCap > 0 ? (volume24h / marketCap) * 100 : 0;
    
    // Price volatility in last 24h
    const priceRange24h = high24h - low24h;
    const volatilityPercent = currentPrice > 0 ? (priceRange24h / currentPrice) * 100 : 0;
    
    // Detect whale activity patterns
    const whaleAlerts: WhaleAlert[] = [];
    
    // Pattern 1: Unusually high volume (>15% of market cap in 24h is very unusual)
    if (volumeToMcapRatio > 15) {
      whaleAlerts.push({
        type: 'large_movement',
        severity: volumeToMcapRatio > 30 ? 'high' : 'medium',
        message: `Extreme volume detected: ${volumeToMcapRatio.toFixed(1)}% of market cap traded in 24h`,
        volumeRatio: volumeToMcapRatio,
        normalVolume24h: marketCap * 0.05, // 5% is typical
        currentVolume: volume24h,
        priceImpact: priceChange24h,
      });
    }
    
    // Pattern 2: Volume spike with price increase (accumulation)
    if (volumeToMcapRatio > 8 && priceChange24h > 5) {
      whaleAlerts.push({
        type: 'accumulation',
        severity: priceChange24h > 15 ? 'high' : 'medium',
        message: `Potential whale accumulation: High volume with ${priceChange24h.toFixed(1)}% price increase`,
        volumeRatio: volumeToMcapRatio,
        normalVolume24h: marketCap * 0.05,
        currentVolume: volume24h,
        priceImpact: priceChange24h,
      });
    }
    
    // Pattern 3: Volume spike with price decrease (distribution)
    if (volumeToMcapRatio > 8 && priceChange24h < -5) {
      whaleAlerts.push({
        type: 'distribution',
        severity: priceChange24h < -15 ? 'high' : 'medium',
        message: `Potential whale distribution: High volume with ${priceChange24h.toFixed(1)}% price drop`,
        volumeRatio: volumeToMcapRatio,
        normalVolume24h: marketCap * 0.05,
        currentVolume: volume24h,
        priceImpact: priceChange24h,
      });
    }

    // Pattern 4: Sudden 1h price spike with volume
    if (Math.abs(priceChange1h) > 3 && volumeToMcapRatio > 5) {
      whaleAlerts.push({
        type: priceChange1h > 0 ? 'accumulation' : 'distribution',
        severity: Math.abs(priceChange1h) > 7 ? 'high' : 'medium',
        message: `Sudden ${priceChange1h > 0 ? 'pump' : 'dump'}: ${priceChange1h.toFixed(1)}% in last hour`,
        volumeRatio: volumeToMcapRatio,
        normalVolume24h: marketCap * 0.05,
        currentVolume: volume24h,
        priceImpact: priceChange1h,
      });
    }

    // Calculate whale activity score (0-100)
    let whaleScore = 0;
    
    // Volume component (up to 40 points)
    if (volumeToMcapRatio > 5) whaleScore += Math.min(40, volumeToMcapRatio * 2);
    
    // Price volatility component (up to 30 points)
    whaleScore += Math.min(30, volatilityPercent * 3);
    
    // Recent movement component (up to 30 points)
    const recentMovement = Math.abs(priceChange1h) + Math.abs(priceChange24h) / 4;
    whaleScore += Math.min(30, recentMovement * 2);
    
    whaleScore = Math.min(100, Math.round(whaleScore));

    // Analyze top exchange tickers for unusual patterns
    const tickers = coinData.tickers?.slice(0, 10) || [];
    const exchangeVolumes = tickers.map((t: any) => ({
      exchange: t.market?.name || 'Unknown',
      volume: t.converted_volume?.usd || 0,
      spread: t.bid_ask_spread_percentage || 0,
    }));

    // Check for volume concentration (whale usually trades on few exchanges)
    const totalTickerVolume = exchangeVolumes.reduce((sum: number, e: any) => sum + e.volume, 0);
    const topExchangeVolume = exchangeVolumes[0]?.volume || 0;
    const volumeConcentration = totalTickerVolume > 0 ? (topExchangeVolume / totalTickerVolume) * 100 : 0;
    
    if (volumeConcentration > 60) {
      whaleAlerts.push({
        type: 'large_movement',
        severity: volumeConcentration > 80 ? 'high' : 'low',
        message: `Volume concentrated: ${volumeConcentration.toFixed(0)}% on ${exchangeVolumes[0]?.exchange}`,
        volumeRatio: volumeConcentration,
        normalVolume24h: 40, // Normal would be ~40% spread across exchanges
        currentVolume: topExchangeVolume,
        priceImpact: priceChange24h,
      });
    }

    console.log(`Whale analysis complete for ${coinId}: score=${whaleScore}, alerts=${whaleAlerts.length}`);

    return new Response(
      JSON.stringify({
        coinId,
        coinName: coinData.name,
        whaleScore,
        whaleAlerts,
        metrics: {
          volume24h,
          marketCap,
          volumeToMcapRatio,
          priceChange1h,
          priceChange24h,
          priceChange7d,
          volatilityPercent,
          volumeConcentration,
        },
        exchangeVolumes: exchangeVolumes.slice(0, 5),
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error("Error detecting whale activity:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
