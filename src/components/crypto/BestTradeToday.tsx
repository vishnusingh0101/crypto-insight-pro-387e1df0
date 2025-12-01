import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Target, ShieldAlert, DollarSign, Award } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";

const BestTradeToday = () => {
  const navigate = useNavigate();
  
  const { data: bestTrade, isLoading, error } = useQuery({
    queryKey: ['bestTradeToday'],
    queryFn: async () => {
      console.log("Fetching best trade...");
      const { data, error } = await supabase.functions.invoke('best-trade');

      if (error) {
        console.error("Error fetching best trade:", error);
        
        // If cache doesn't exist, try to update market data first
        if (error.message?.includes("Failed to load cached market data")) {
          console.log("Cache empty, updating market data...");
          const { error: updateError } = await supabase.functions.invoke('update-market-data');
          
          if (updateError) {
            console.error("Error updating market data:", updateError);
            throw new Error("Failed to initialize market data");
          }
          
          // Retry fetching best trade after updating cache
          const { data: retryData, error: retryError } = await supabase.functions.invoke('best-trade');
          if (retryError) throw retryError;
          return retryData;
        }
        
        throw error;
      }

      return data;
    },
    refetchInterval: 300000, // Refetch every 5 minutes
    retry: 1,
  });

  if (isLoading) {
    return (
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardHeader>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-full" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-2 border-destructive/20 bg-gradient-to-br from-destructive/5 to-destructive/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-6 w-6" />
            Unable to Load Best Trade
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Failed to fetch trade data. Please try again later."}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!bestTrade) return null;

  const getActionColor = (action: string) => {
    return action === 'BUY' 
      ? 'text-green-600 dark:text-green-400' 
      : 'text-red-600 dark:text-red-400';
  };

  const getSuccessColor = (prob: number) => {
    if (prob >= 70) return 'text-green-600 dark:text-green-400';
    if (prob >= 50) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <Card 
      className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 hover:border-primary/40 transition-all cursor-pointer"
      onClick={() => navigate(`/analysis/${bestTrade.coinId}`)}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-6 w-6 text-primary" />
          Best Trade Opportunity Today
        </CardTitle>
        <CardDescription>
          AI-powered analysis of top cryptocurrencies
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Coin Info */}
        <div className="flex items-center gap-4 pb-4 border-b">
          <img src={bestTrade.coinImage} alt={bestTrade.coinName} className="w-12 h-12 rounded-full" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-2xl font-bold">{bestTrade.coinName}</h3>
              <Badge variant="secondary">{bestTrade.coinSymbol}</Badge>
              <Badge variant="outline" className={`text-lg font-bold ${getActionColor(bestTrade.action)}`}>
                {bestTrade.action}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">Rank #{bestTrade.marketCapRank}</p>
          </div>
        </div>

        {/* Success Probability */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">Success Probability</span>
            <span className={`text-3xl font-bold ${getSuccessColor(bestTrade.successProbability)}`}>
              {bestTrade.successProbability}%
            </span>
          </div>
          <Progress value={bestTrade.successProbability} className="h-4" />
        </div>

        {/* Trade Targets */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1 p-3 bg-background/50 rounded-lg">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <DollarSign className="h-3 w-3" />
              Current
            </div>
            <div className="font-bold text-lg">${bestTrade.currentPrice?.toLocaleString() ?? 'N/A'}</div>
          </div>
          <div className="space-y-1 p-3 bg-background/50 rounded-lg">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <TrendingUp className="h-3 w-3" />
              Entry
            </div>
            <div className="font-bold text-lg text-blue-600 dark:text-blue-400">
              ${bestTrade.buyPrice?.toLocaleString() ?? 'N/A'}
            </div>
          </div>
          <div className="space-y-1 p-3 bg-background/50 rounded-lg">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Target className="h-3 w-3" />
              Target
            </div>
            <div className="font-bold text-lg text-green-600 dark:text-green-400">
              ${bestTrade.targetPrice?.toLocaleString() ?? 'N/A'}
            </div>
          </div>
          <div className="space-y-1 p-3 bg-background/50 rounded-lg">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <ShieldAlert className="h-3 w-3" />
              Stop Loss
            </div>
            <div className="font-bold text-lg text-red-600 dark:text-red-400">
              ${bestTrade.stopLoss?.toLocaleString() ?? 'N/A'}
            </div>
          </div>
        </div>

        {/* Risk/Reward & Price Changes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col items-center justify-center p-3 bg-background/50 rounded-lg">
            <span className="text-xs text-muted-foreground">Risk/Reward</span>
            <span className="text-xl font-bold">{bestTrade.riskReward ?? 0}:1</span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 bg-background/50 rounded-lg">
            <span className="text-xs text-muted-foreground">24h Change</span>
            <span className={`text-xl font-bold ${(bestTrade.priceChange24h ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {(bestTrade.priceChange24h ?? 0) >= 0 ? '+' : ''}{(bestTrade.priceChange24h ?? 0).toFixed(2)}%
            </span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 bg-background/50 rounded-lg">
            <span className="text-xs text-muted-foreground">7d Change</span>
            <span className={`text-xl font-bold ${(bestTrade.priceChange7d ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {(bestTrade.priceChange7d ?? 0) >= 0 ? '+' : ''}{(bestTrade.priceChange7d ?? 0).toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Reasoning */}
        <div className="p-4 bg-background/50 rounded-lg">
          <h4 className="font-semibold text-sm mb-2">Why This Trade?</h4>
          <p className="text-sm text-muted-foreground">{bestTrade.reasoning}</p>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Click to view detailed analysis →
        </p>
      </CardContent>
    </Card>
  );
};

export default BestTradeToday;
