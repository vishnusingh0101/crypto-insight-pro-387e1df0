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
  Activity,
  BarChart3,
  Zap,
  Lock
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

type SystemPerformance = {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  accuracyPercent: number;
  consecutiveLosses: number;
  capitalProtectionEnabled: boolean;
  capitalProtectionReason: string | null;
  mode: "paper" | "live";
};

type ConservativeTrade = {
  coinId: string;
  coinName: string;
  coinSymbol: string;
  coinImage: string;
  action: "BUY" | "SELL" | "NO_TRADE";
  status: "SCANNING" | "FOUND" | "NO_OPPORTUNITY" | "CAPITAL_PROTECTION";
  currentPrice: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  targetPercent: number;
  riskPercent: number;
  riskReward: number;
  successProbability: number;
  confidenceScore: number;
  whaleIntent: "accumulating" | "distributing" | "neutral" | null;
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
  systemPerformance: SystemPerformance;
};

const BestTradeToday = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const previousTradeRef = useRef<ConservativeTrade | null>(null);
  
  const { data: bestTrade, isLoading, error } = useQuery({
    queryKey: ['bestTradeToday'],
    queryFn: async () => {
      console.log("Fetching professional trade analysis...");
      const { data, error } = await supabase.functions.invoke('best-trade');

      if (error) {
        console.error("Error fetching best trade:", error);

        if (error instanceof FunctionsHttpError) {
          try {
            const details = await error.context.json();
            const message =
              (details && typeof (details as any).error === "string" && (details as any).error) ||
              (typeof details === "string" ? details : "");

            if (message.includes("Failed to load")) {
              console.log("Cache empty, triggering update...");
              await supabase.functions.invoke('update-market-data');
              const { data: retryData, error: retryError } = await supabase.functions.invoke('best-trade');
              if (retryError) throw retryError;
              return retryData as ConservativeTrade;
            }
          } catch (ctxErr) {
            console.warn("Failed to parse error context", ctxErr);
          }
        }

        throw error;
      }

      return data as ConservativeTrade;
    },
    refetchInterval: 3600000, // 1 hour
    retry: 1,
  });

  // Notification effect
  useEffect(() => {
    if (!bestTrade) return;
    
    const prev = previousTradeRef.current;
    
    if (bestTrade.action !== "NO_TRADE" && (!prev || prev.coinId !== bestTrade.coinId || prev.action !== bestTrade.action)) {
      toast({
        title: `🎯 ${bestTrade.systemPerformance?.mode?.toUpperCase() || 'PAPER'} Signal: ${bestTrade.action} ${bestTrade.coinSymbol}`,
        description: `Confidence: ${bestTrade.confidenceScore}% | Entry: $${bestTrade.entryPrice.toFixed(2)} | R:R ${bestTrade.riskReward}:1`,
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
            System Offline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Failed to connect to trading system."}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!bestTrade) return null;

  const filtersApplied = bestTrade.filtersApplied ?? [];
  const filtersPassed = bestTrade.filtersPassed ?? [];
  const filtersSkipped = bestTrade.filtersSkipped ?? [];
  const performance = bestTrade.systemPerformance ?? {
    totalTrades: 0,
    successfulTrades: 0,
    failedTrades: 0,
    accuracyPercent: 0,
    consecutiveLosses: 0,
    capitalProtectionEnabled: false,
    capitalProtectionReason: null,
    mode: 'paper'
  };

  // Performance metrics component
  const PerformanceBar = () => (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-background/50 rounded-lg border border-border/50">
      <div className="text-center">
        <div className="text-xs text-muted-foreground">Mode</div>
        <Badge variant={performance.mode === 'live' ? 'default' : 'secondary'} className="mt-1">
          {performance.mode.toUpperCase()}
        </Badge>
      </div>
      <div className="text-center">
        <div className="text-xs text-muted-foreground">Total</div>
        <div className="font-bold text-lg">{performance.totalTrades}</div>
      </div>
      <div className="text-center">
        <div className="text-xs text-muted-foreground">Won</div>
        <div className="font-bold text-lg text-green-600 dark:text-green-400">{performance.successfulTrades}</div>
      </div>
      <div className="text-center">
        <div className="text-xs text-muted-foreground">Lost</div>
        <div className="font-bold text-lg text-red-600 dark:text-red-400">{performance.failedTrades}</div>
      </div>
      <div className="text-center">
        <div className="text-xs text-muted-foreground">Accuracy</div>
        <div className={`font-bold text-lg ${
          performance.accuracyPercent >= 60 ? 'text-green-600 dark:text-green-400' : 
          performance.accuracyPercent >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
        }`}>
          {performance.accuracyPercent?.toFixed(1) || 0}%
        </div>
      </div>
    </div>
  );

  // Capital Protection Mode UI
  if (bestTrade.status === "CAPITAL_PROTECTION") {
    return (
      <Card className="border-2 border-red-500/30 bg-gradient-to-br from-red-500/5 to-red-500/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-6 w-6 text-red-500" />
            Capital Protection Mode
          </CardTitle>
          <CardDescription className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            System paused • Scanning continues every hour
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PerformanceBar />
          
          <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="h-5 w-5 text-red-500" />
              <span className="font-semibold text-red-600 dark:text-red-400">Trading Halted</span>
            </div>
            <p className="text-sm text-muted-foreground">{bestTrade.reasoning}</p>
          </div>
          
          {performance.consecutiveLosses > 0 && (
            <div className="flex items-center justify-center gap-2 p-3 bg-amber-500/10 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-amber-600 dark:text-amber-400">
                {performance.consecutiveLosses} consecutive losses triggered protection
              </span>
            </div>
          )}
          
          <p className="text-xs text-center text-muted-foreground">
            Trade LESS, trade SMART • Risk management is priority
          </p>
        </CardContent>
      </Card>
    );
  }

  // NO_TRADE status
  if (bestTrade.action === "NO_TRADE") {
    return (
      <Card className="border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-amber-500/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-amber-500" />
            No Qualifying Trade
          </CardTitle>
          <CardDescription className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Next scan in: {bestTrade.nextScanIn}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PerformanceBar />
          
          <div className="p-4 bg-background/50 rounded-lg border border-amber-500/20">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <span className="font-semibold">Waiting for Setup</span>
            </div>
            <p className="text-sm text-muted-foreground">{bestTrade.reasoning}</p>
          </div>
          
          {bestTrade.whaleIntent && bestTrade.whaleIntent !== 'neutral' && (
            <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm">
                Whale Activity: <span className="font-semibold capitalize">{bestTrade.whaleIntent}</span>
                {bestTrade.whaleConfidence && ` (${bestTrade.whaleConfidence}% confidence)`}
              </span>
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-background/50 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Filters Checked</div>
              <div className="font-bold text-lg">{filtersApplied.length}</div>
            </div>
            <div className="p-3 bg-background/50 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Status</div>
              <Badge variant="outline" className="text-amber-500 border-amber-500">SCANNING</Badge>
            </div>
          </div>
          
          <p className="text-xs text-center text-muted-foreground">
            Operating as professional trading desk • Patience over profit
          </p>
        </CardContent>
      </Card>
    );
  }

  const getActionColor = (action: string) => 
    action === 'BUY' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

  const getActionBg = (action: string) => 
    action === 'BUY' ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30';

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 70) return 'text-amber-600 dark:text-amber-400';
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
            <BarChart3 className="h-6 w-6 text-primary" />
            Trade Signal
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={performance.mode === 'live' ? 'default' : 'secondary'}>
              {performance.mode.toUpperCase()}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              {bestTrade.nextScanIn}
            </Badge>
          </div>
        </div>
        <CardDescription className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          {filtersPassed.length}/{filtersApplied.length} filters passed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Performance Bar */}
        <PerformanceBar />
        
        {/* Coin Info */}
        <div className="flex items-center gap-4 pb-4 border-b border-border/50">
          <img src={bestTrade.coinImage} alt={bestTrade.coinName} className="w-12 h-12 rounded-full" />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
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

        {/* Confidence & Whale */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">Confidence</span>
              <span className={`text-2xl font-bold ${getConfidenceColor(bestTrade.confidenceScore)}`}>
                {bestTrade.confidenceScore}%
              </span>
            </div>
            <Progress value={bestTrade.confidenceScore} className="h-2" />
          </div>
          
          {bestTrade.whaleIntent && bestTrade.whaleIntent !== 'neutral' && (
            <div className="p-3 bg-primary/10 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Whale Intel</div>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="font-semibold capitalize">{bestTrade.whaleIntent}</span>
                {bestTrade.whaleConfidence && (
                  <span className="text-xs text-muted-foreground">({bestTrade.whaleConfidence}%)</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Trade Targets */}
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
              R:R
            </div>
            <div className="font-bold text-lg">{bestTrade.riskReward}:1</div>
          </div>
        </div>

        {/* Technical Indicators */}
        <div className="grid grid-cols-4 gap-4">
          <div className="flex flex-col items-center justify-center p-3 bg-background/50 rounded-lg">
            <span className="text-xs text-muted-foreground">RSI</span>
            <span className={`text-xl font-bold ${
              bestTrade.rsi14 >= 40 && bestTrade.rsi14 <= 60 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-amber-600 dark:text-amber-400'
            }`}>
              {bestTrade.rsi14?.toFixed(1)}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 bg-background/50 rounded-lg">
            <span className="text-xs text-muted-foreground">1h</span>
            <span className={`text-xl font-bold ${bestTrade.priceChange1h >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {bestTrade.priceChange1h >= 0 ? '+' : ''}{bestTrade.priceChange1h?.toFixed(2)}%
            </span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 bg-background/50 rounded-lg">
            <span className="text-xs text-muted-foreground">24h</span>
            <span className={`text-xl font-bold ${bestTrade.priceChange24h >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {bestTrade.priceChange24h >= 0 ? '+' : ''}{bestTrade.priceChange24h?.toFixed(2)}%
            </span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 bg-background/50 rounded-lg">
            <span className="text-xs text-muted-foreground">7d</span>
            <span className={`text-xl font-bold ${bestTrade.priceChange7d >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {bestTrade.priceChange7d >= 0 ? '+' : ''}{bestTrade.priceChange7d?.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Reasoning */}
        <div className="p-4 bg-background/50 rounded-lg">
          <h4 className="font-semibold text-sm mb-2">Analysis</h4>
          <p className="text-sm text-muted-foreground">{bestTrade.reasoning}</p>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Click for detailed analysis • Not financial advice
        </p>
      </CardContent>
    </Card>
  );
};

export default BestTradeToday;
