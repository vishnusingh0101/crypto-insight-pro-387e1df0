import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, 
  Target, 
  ShieldAlert, 
  DollarSign, 
  Shield, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  TrendingDown,
  Activity
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

type ConservativeTrade = {
  coinId: string;
  coinName: string;
  coinSymbol: string;
  coinImage: string;
  action: "BUY" | "SELL" | "NO_TRADE";
  status: "SCANNING" | "FOUND" | "NO_OPPORTUNITY";
  currentPrice: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  targetPercent: number;
  riskPercent: number;
  riskReward: number;
  successProbability: number;
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
};

const BestTradeToday = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const previousTradeRef = useRef<ConservativeTrade | null>(null);
  
  const { data: bestTrade, isLoading, error } = useQuery({
    queryKey: ['bestTradeToday'],
    queryFn: async () => {
      console.log("Fetching conservative trade analysis...");
      const { data, error } = await supabase.functions.invoke('best-trade');

      if (error) {
        console.error("Error fetching best trade:", error);

        if (error instanceof FunctionsHttpError) {
          try {
            const details = await error.context.json();
            const message =
              (details && typeof (details as any).error === "string" && (details as any).error) ||
              (typeof details === "string" ? details : "");

            if (message.includes("Failed to load cached market data")) {
              console.log("Cache empty, triggering market data update...");
              const { error: updateError } = await supabase.functions.invoke('update-market-data');

              if (updateError) {
                console.error("Error updating market data:", updateError);
                throw new Error("Failed to initialize market data");
              }

              const { data: retryData, error: retryError } = await supabase.functions.invoke('best-trade');
              if (retryError) throw retryError;
              return retryData as ConservativeTrade;
            }
          } catch (ctxErr) {
            console.warn("Failed to parse best-trade error context", ctxErr);
          }
        }

        throw error;
      }

      return data as ConservativeTrade;
    },
    refetchInterval: 3600000, // Refetch every 1 hour (conservative approach)
    retry: 1,
  });

  // Notification effect when trade is found
  useEffect(() => {
    if (!bestTrade) return;
    
    const prev = previousTradeRef.current;
    
    // Notify when a new trade is found
    if (bestTrade.action !== "NO_TRADE" && (!prev || prev.coinId !== bestTrade.coinId || prev.action !== bestTrade.action)) {
      toast({
        title: `🎯 Trade Signal: ${bestTrade.action} ${bestTrade.coinSymbol}`,
        description: `Entry: $${bestTrade.entryPrice.toFixed(2)} | Target: +${bestTrade.targetPercent.toFixed(2)}% | Stop: -${bestTrade.riskPercent.toFixed(2)}%`,
      });
    }
    
    previousTradeRef.current = bestTrade;
  }, [bestTrade, toast]);

  if (isLoading) {
    return (
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary animate-pulse" />
            <Skeleton className="h-8 w-64" />
          </div>
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
            Unable to Load Trade Analysis
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

  // Ensure arrays are defined with defaults
  const filtersApplied = bestTrade.filtersApplied ?? [];
  const filtersPassed = bestTrade.filtersPassed ?? [];
  const filtersSkipped = bestTrade.filtersSkipped ?? [];

  // NO_TRADE status - waiting for perfect setup
  if (bestTrade.action === "NO_TRADE") {
    return (
      <Card className="border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-amber-500/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-amber-500" />
            Capital Protection Mode
          </CardTitle>
          <CardDescription className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Next scan in: {bestTrade.nextScanIn}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-background/50 rounded-lg border border-amber-500/20">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <span className="font-semibold">No Qualifying Trade Found</span>
            </div>
            <p className="text-sm text-muted-foreground">{bestTrade.reasoning}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-background/50 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Filters Applied</div>
              <div className="font-bold text-lg">{filtersApplied.length}</div>
            </div>
            <div className="p-3 bg-background/50 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Status</div>
              <Badge variant="outline" className="text-amber-500 border-amber-500">
                WAITING
              </Badge>
            </div>
          </div>
          
          <div className="text-xs text-center text-muted-foreground">
            Trade LESS, but trade SMART • Conservative filters active
          </div>
        </CardContent>
      </Card>
    );
  }

  const getActionColor = (action: string) => {
    return action === 'BUY' 
      ? 'text-green-600 dark:text-green-400' 
      : 'text-red-600 dark:text-red-400';
  };

  const getActionBg = (action: string) => {
    return action === 'BUY' 
      ? 'bg-green-500/10 border-green-500/30' 
      : 'bg-red-500/10 border-red-500/30';
  };

  const getSuccessColor = (prob: number) => {
    if (prob >= 70) return 'text-green-600 dark:text-green-400';
    if (prob >= 55) return 'text-amber-600 dark:text-amber-400';
    return 'text-muted-foreground';
  };

  return (
    <Card 
      className={`border-2 ${getActionBg(bestTrade.action)} hover:border-primary/40 transition-all cursor-pointer`}
      onClick={() => navigate(`/analysis/${bestTrade.coinId}`)}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Conservative Trade Signal
          </CardTitle>
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            Scan: {bestTrade.nextScanIn}
          </Badge>
        </div>
        <CardDescription className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          {filtersPassed.length}/{filtersApplied.length} filters passed
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
                {bestTrade.action === "BUY" ? (
                  <><TrendingUp className="h-4 w-4 mr-1" /> BUY</>
                ) : (
                  <><TrendingDown className="h-4 w-4 mr-1" /> SELL</>
                )}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Rank #{bestTrade.marketCapRank} • {bestTrade.trendAlignment}
            </p>
          </div>
        </div>

        {/* Success Probability */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">Trade Probability</span>
            <span className={`text-3xl font-bold ${getSuccessColor(bestTrade.successProbability)}`}>
              {bestTrade.successProbability}%
            </span>
          </div>
          <Progress value={bestTrade.successProbability} className="h-3" />
        </div>

        {/* Trade Targets - Conservative */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1 p-3 bg-background/50 rounded-lg">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <DollarSign className="h-3 w-3" />
              Entry
            </div>
            <div className="font-bold text-lg">
              ${bestTrade.entryPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? 'N/A'}
            </div>
          </div>
          <div className="space-y-1 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
            <div className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs">
              <Target className="h-3 w-3" />
              Target (+{bestTrade.targetPercent.toFixed(2)}%)
            </div>
            <div className="font-bold text-lg text-green-600 dark:text-green-400">
              ${bestTrade.targetPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? 'N/A'}
            </div>
          </div>
          <div className="space-y-1 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
            <div className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs">
              <ShieldAlert className="h-3 w-3" />
              Stop (-{bestTrade.riskPercent.toFixed(2)}%)
            </div>
            <div className="font-bold text-lg text-red-600 dark:text-red-400">
              ${bestTrade.stopLoss?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? 'N/A'}
            </div>
          </div>
          <div className="space-y-1 p-3 bg-background/50 rounded-lg">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Shield className="h-3 w-3" />
              Risk:Reward
            </div>
            <div className="font-bold text-lg">{bestTrade.riskReward}:1</div>
          </div>
        </div>

        {/* Technical Indicators */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex flex-col items-center justify-center p-3 bg-background/50 rounded-lg">
            <span className="text-xs text-muted-foreground">RSI (14)</span>
            <span className={`text-xl font-bold ${
              bestTrade.rsi14 >= 40 && bestTrade.rsi14 <= 60 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-amber-600 dark:text-amber-400'
            }`}>
              {bestTrade.rsi14?.toFixed(1)}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 bg-background/50 rounded-lg">
            <span className="text-xs text-muted-foreground">1h Change</span>
            <span className={`text-xl font-bold ${bestTrade.priceChange1h >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {bestTrade.priceChange1h >= 0 ? '+' : ''}{bestTrade.priceChange1h?.toFixed(2)}%
            </span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 bg-background/50 rounded-lg">
            <span className="text-xs text-muted-foreground">24h Change</span>
            <span className={`text-xl font-bold ${bestTrade.priceChange24h >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {bestTrade.priceChange24h >= 0 ? '+' : ''}{bestTrade.priceChange24h?.toFixed(2)}%
            </span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 bg-background/50 rounded-lg">
            <span className="text-xs text-muted-foreground">7d Change</span>
            <span className={`text-xl font-bold ${bestTrade.priceChange7d >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {bestTrade.priceChange7d >= 0 ? '+' : ''}{bestTrade.priceChange7d?.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Filters Summary */}
        <div className="p-4 bg-background/50 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Conservative Filters</h4>
            <Badge variant="outline" className="text-green-600 border-green-600">
              {filtersPassed.length} Passed
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {filtersPassed.slice(0, 4).map((filter, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                {filter.replace(' ✓', '').split(' ').slice(0, 3).join(' ')}
              </Badge>
            ))}
            {filtersPassed.length > 4 && (
              <Badge variant="outline" className="text-xs">
                +{filtersPassed.length - 4} more
              </Badge>
            )}
          </div>
        </div>

        {/* Reasoning */}
        <div className="p-4 bg-background/50 rounded-lg">
          <h4 className="font-semibold text-sm mb-2">Analysis</h4>
          <p className="text-sm text-muted-foreground">{bestTrade.reasoning}</p>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Capital protection priority • Click for detailed analysis →
        </p>
      </CardContent>
    </Card>
  );
};

export default BestTradeToday;
