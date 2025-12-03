import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, TrendingUp, TrendingDown, Zap, Brain, Newspaper, Smile, Frown, Meh, Clock, RefreshCw } from "lucide-react";
import SignalsPanel from "@/components/crypto/SignalsPanel";
import ExplainableAI from "@/components/crypto/ExplainableAI";
import CoinNews from "@/components/crypto/CoinNews";
import TradeRecommendation from "@/components/crypto/TradeRecommendation";
import { toast } from "sonner";
import { useState } from "react";

// Helper to fetch from CoinGecko with retry
async function fetchCoinDataWithRetry(coinId: string, maxRetries = 2): Promise<any | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`,
        { headers: { 'Accept': 'application/json' } }
      );
      
      if (response.ok) {
        return { data: await response.json(), source: 'live', timestamp: new Date().toISOString() };
      }
      
      if (response.status === 429 || response.status >= 500) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
      return null;
    } catch {
      if (i === maxRetries - 1) return null;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return null;
}

// Fetch cached data from market_snapshots
async function fetchCachedCoinData(coinId: string): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('market_snapshots')
      .select('*')
      .eq('coin_id', coinId)
      .order('collected_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !data) return null;
    
    // Transform to CoinGecko-like format
    return {
      data: {
        id: data.coin_id,
        symbol: data.coin_symbol?.toLowerCase(),
        name: data.coin_name,
        image: { large: `https://coin-images.coingecko.com/coins/images/${data.coin_id}/large/${data.coin_id}.png` },
        market_cap_rank: data.market_cap_rank,
        market_data: {
          current_price: { usd: Number(data.current_price) },
          market_cap: { usd: Number(data.market_cap) },
          total_volume: { usd: Number(data.volume_24h) },
          high_24h: { usd: Number(data.high_24h) },
          low_24h: { usd: Number(data.low_24h) },
          price_change_percentage_24h: Number(data.price_change_24h) || 0,
        },
      },
      source: 'cached',
      timestamp: data.collected_at,
    };
  } catch {
    return null;
  }
}

const SentimentBadge = ({ coinName }: { coinName: string }) => {
  const { data: news } = useQuery({
    queryKey: ["coin-news", coinName],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("fetch-crypto-news", {
        body: { coinName },
      });
      return data as any[];
    },
  });

  if (!news || news.length === 0) return null;

  // Calculate sentiment score
  const sentimentCounts = news.reduce((acc: any, article: any) => {
    acc[article.sentiment] = (acc[article.sentiment] || 0) + 1;
    return acc;
  }, {});

  const totalArticles = news.length;
  const positiveCount = sentimentCounts.positive || 0;
  const negativeCount = sentimentCounts.negative || 0;
  
  const sentimentScore = ((positiveCount - negativeCount) / totalArticles) * 100;
  
  let sentiment = "neutral";
  let icon = Meh;
  let colorClass = "border-accent text-accent";
  
  if (sentimentScore > 20) {
    sentiment = "bullish";
    icon = Smile;
    colorClass = "border-success text-success";
  } else if (sentimentScore < -20) {
    sentiment = "bearish";
    icon = Frown;
    colorClass = "border-destructive text-destructive";
  }

  const Icon = icon;

  return (
    <Badge variant="outline" className={`${colorClass} gap-1.5`}>
      <Icon className="w-3 h-3" />
      <span className="font-bold capitalize">Public Sentiment: {sentiment}</span>
      <span className="text-xs opacity-75">({news.length} articles)</span>
    </Badge>
  );
};

const CoinAnalysis = () => {
  const { coinId } = useParams<{ coinId: string }>();
  const navigate = useNavigate();
  const [dataSource, setDataSource] = useState<'live' | 'cached' | null>(null);
  const [dataTimestamp, setDataTimestamp] = useState<string | null>(null);

  const { data: coinData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["coin-detail", coinId],
    queryFn: async () => {
      // Always try live data first
      const liveData = await fetchCoinDataWithRetry(coinId!);
      if (liveData) {
        setDataSource('live');
        setDataTimestamp(liveData.timestamp);
        return liveData.data;
      }
      
      // Fallback to cached data
      const cachedData = await fetchCachedCoinData(coinId!);
      if (cachedData) {
        setDataSource('cached');
        setDataTimestamp(cachedData.timestamp);
        toast.info("Using cached data - live data temporarily unavailable");
        return cachedData.data;
      }
      
      toast.error("Unable to fetch coin data. Please try again later.");
      throw new Error("Failed to fetch coin data from all sources");
    },
    enabled: !!coinId,
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000,
  });

  if (isLoading || !coinData) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border/50 backdrop-blur-xl bg-card/30 sticky top-0 z-50">
          <div className="container mx-auto px-4 py-6">
            <Button
              variant="ghost"
              onClick={() => navigate("/")}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </header>
        
        <main className="container mx-auto px-4 py-8">
          <div className="space-y-6">
            <Card className="p-8 glass-morphism">
              <Skeleton className="h-12 w-12 rounded-full mb-4" />
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-6 w-32" />
            </Card>
          </div>
        </main>
      </div>
    );
  }

  const marketData = coinData.market_data;
  const priceChange24h = marketData.price_change_percentage_24h;
  const isPositive = priceChange24h >= 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-xl bg-card/30 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => navigate("/")}
              className="hover:bg-card"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <div className="flex items-center gap-4">
              {/* Data freshness indicator */}
              {dataSource && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className={dataSource === 'live' ? 'text-success' : 'text-warning'}>
                    {dataSource === 'live' ? 'Live Data' : 'Cached Data'}
                  </span>
                  {dataTimestamp && (
                    <span className="text-muted-foreground">
                      ({new Date(dataTimestamp).toLocaleTimeString()})
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refetch()}
                    disabled={isRefetching}
                    className="h-7 px-2"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefetching ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              )}
              <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                GlobalCryptoUpdate
              </h2>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Coin Header with Sentiment */}
        <Card className="p-8 glass-morphism">
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div className="flex items-center gap-4">
              <img
                src={coinData.image.large}
                alt={coinData.name}
                className="w-16 h-16 rounded-full glow-primary"
              />
              <div>
                <h1 className="text-4xl font-bold mb-2">{coinData.name}</h1>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-lg font-mono text-muted-foreground uppercase">
                    {coinData.symbol}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Rank #{coinData.market_cap_rank}
                  </span>
                  {/* Sentiment Badge */}
                  <SentimentBadge coinName={coinData.name} />
                </div>
              </div>
            </div>

            <div className="text-right">
              <p className="text-4xl font-bold font-mono mb-2">
                ${marketData.current_price.usd.toLocaleString()}
              </p>
              <div className="flex items-center justify-end gap-2">
                {isPositive ? (
                  <TrendingUp className="w-5 h-5 text-success" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-destructive" />
                )}
                <span
                  className={`text-lg font-bold ${
                    isPositive ? "text-success" : "text-destructive"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {priceChange24h.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* Market Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-8 border-t border-border/50">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Market Cap</p>
              <p className="text-xl font-bold font-mono">
                ${(marketData.market_cap.usd / 1e9).toFixed(2)}B
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">24h Volume</p>
              <p className="text-xl font-bold font-mono">
                ${(marketData.total_volume.usd / 1e9).toFixed(2)}B
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">24h High</p>
              <p className="text-xl font-bold font-mono text-success">
                ${marketData.high_24h.usd.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">24h Low</p>
              <p className="text-xl font-bold font-mono text-destructive">
                ${marketData.low_24h.usd.toLocaleString()}
              </p>
            </div>
          </div>
        </Card>

        {/* Complete Trade Recommendation */}
        <TradeRecommendation selectedCrypto={coinId || null} />

        {/* AI Analysis Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Trading Signals */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <Zap className="w-6 h-6 text-accent" />
              <h2 className="text-2xl font-bold">AI Trading Signals</h2>
            </div>
            <SignalsPanel selectedCrypto={coinId || null} />
          </div>

          {/* Explainable AI */}
          <div>
            <div className="flex items-center gap-3 mb-6">
              <Brain className="w-6 h-6 text-secondary" />
              <h2 className="text-2xl font-bold">Signal Explanation</h2>
            </div>
            <ExplainableAI selectedCrypto={coinId || null} />
          </div>
        </div>

        {/* News Section */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <Newspaper className="w-6 h-6 text-accent" />
            <h2 className="text-2xl font-bold">Latest News</h2>
          </div>
          <CoinNews coinName={coinData.name} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-20 py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>Powered by AI • Real-time data from CoinGecko</p>
          <p className="mt-2 text-xs">Trading involves risk. This is not financial advice.</p>
        </div>
      </footer>
    </div>
  );
};

export default CoinAnalysis;
