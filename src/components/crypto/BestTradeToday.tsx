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
  Lock,
  Pause,
  Play,
  Timer,
  RefreshCw
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

type SystemPerformance = {
  id: string;
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  accuracyPercent: number;
  consecutiveLosses: number;
  capitalProtectionEnabled: boolean;
  capitalProtectionReason: string | null;
  mode: "paper" | "live";
  currentState: "WAITING" | "ACTIVE_TRADE" | "COOLDOWN" | "CAPITAL_PROTECTION";
  activeTradeId: string | null;
  lastTradeClosedAt: string | null;
  cooldownEndsAt: string | null;
  lastScanAt: string | null;
};

type ActiveTrade = {
  id: string;
  coinId: string;
  coinName: string;
  coinSymbol: string;
  action: "BUY" | "SELL";
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  createdAt: string;
  lastMonitoredAt: string;
};

type TradeProgress = {
  currentPnL: number;
  distanceToTarget: number;
  distanceToStop: number;
  timeInTrade: number;
};

type ConservativeTrade = {
  coinId: string;
  coinName: string;
  coinSymbol: string;
  coinImage: string;
  action: "BUY" | "SELL" | "NO_TRADE";
  status: "WAITING" | "ACTIVE_TRADE" | "COOLDOWN" | "FOUND" | "NO_OPPORTUNITY" | "CAPITAL_PROTECTION";
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
  timeUntilNextAction: string;
  systemPerformance: SystemPerformance;
  activeTrade: ActiveTrade | null;
  tradeProgress: TradeProgress | null;
};

const BestTradeToday = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const previousTradeRef = useRef<ConservativeTrade | null>(null);
  
  // Determine refetch interval based on state
  const getRefetchInterval = (data: ConservativeTrade | undefined): number => {
    if (!data) return 60000; // 1 minute default
    
    switch (data.status) {
      case 'ACTIVE_TRADE':
        return 180000; // 3 minutes - monitor active trade
      case 'COOLDOWN':
        return 300000; // 5 minutes during cooldown
      case 'CAPITAL_PROTECTION':
        return 3600000; // 1 hour during protection
      case 'WAITING':
      default:
        return 900000; // 15 minutes - scan interval
    }
  };
  
  const { data: bestTrade, isLoading, error, refetch } = useQuery({
    queryKey: ['bestTradeToday'],
    queryFn: async () => {
      console.log("Fetching automated trading status...");
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
    refetchInterval: (query) => getRefetchInterval(query.state.data),
    retry: 1,
  });

  // Notification effect
  useEffect(() => {
    if (!bestTrade) return;
    
    const prev = previousTradeRef.current;
    
    // Notify on new trade signal
    if (bestTrade.status === "FOUND" || bestTrade.status === "ACTIVE_TRADE") {
      if (!prev || prev.coinId !== bestTrade.coinId || prev.action !== bestTrade.action) {
        toast({
          title: `🎯 ${bestTrade.systemPerformance?.mode?.toUpperCase() || 'PAPER'} Signal: ${bestTrade.action} ${bestTrade.coinSymbol}`,
          description: `Confidence: ${bestTrade.confidenceScore}% | Entry: $${bestTrade.entryPrice.toFixed(2)} | R:R ${bestTrade.riskReward}:1`,
        });
      }
    }
    
    // Notify on state changes
    if (prev && prev.status !== bestTrade.status) {
      if (bestTrade.status === 'COOLDOWN') {
        toast({
          title: "⏸️ Trade Closed - Cooldown Active",
          description: "Avoiding duplicated signals. Will resume when conditions improve.",
        });
      } else if (bestTrade.status === 'CAPITAL_PROTECTION') {
        toast({
          title: "🛡️ Capital Protection Activated",
          description: bestTrade.systemPerformance?.capitalProtectionReason || "Trading paused for safety.",
          variant: "destructive",
        });
      }
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
  const performance = bestTrade.systemPerformance ?? {
    id: '',
    totalTrades: 0,
    successfulTrades: 0,
    failedTrades: 0,
    accuracyPercent: 0,
    consecutiveLosses: 0,
    capitalProtectionEnabled: false,
    capitalProtectionReason: null,
    mode: 'paper',
    currentState: 'WAITING'
  };

  // State indicator component
  const StateIndicator = () => {
    const stateConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
      WAITING: { icon: <RefreshCw className="h-4 w-4" />, label: "Scanning", color: "text-blue-500" },
      ACTIVE_TRADE: { icon: <Play className="h-4 w-4" />, label: "Active", color: "text-green-500" },
      COOLDOWN: { icon: <Pause className="h-4 w-4" />, label: "Cooldown", color: "text-amber-500" },
      CAPITAL_PROTECTION: { icon: <Lock className="h-4 w-4" />, label: "Protected", color: "text-red-500" },
    };
    
    const state = stateConfig[bestTrade.status] || stateConfig.WAITING;
    
    return (
      <Badge variant="outline" className={`gap-1 ${state.color}`}>
        {state.icon}
        {state.label}
      </Badge>
    );
  };

  // Performance metrics component
  const PerformanceBar = () => (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 p-4 bg-background/50 rounded-lg border border-border/50">
      <div className="text-center">
        <div className="text-xs text-muted-foreground">State</div>
        <StateIndicator />
      </div>
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
            <Timer className="h-4 w-4" />
            Re-evaluating in: {bestTrade.nextScanIn}
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

  // Cooldown UI
  if (bestTrade.status === "COOLDOWN") {
    return (
      <Card className="border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-amber-500/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Pause className="h-6 w-6 text-amber-500" />
            Smart Cooldown Active
          </CardTitle>
          <CardDescription className="flex items-center gap-2">
            <Timer className="h-4 w-4" />
            {bestTrade.timeUntilNextAction}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PerformanceBar />
          
          <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-amber-500" />
              <span className="font-semibold text-amber-600 dark:text-amber-400">Post-Trade Cooldown</span>
            </div>
            <p className="text-sm text-muted-foreground">{bestTrade.reasoning}</p>
          </div>
          
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="p-2 bg-background/50 rounded">
              <div className="text-muted-foreground text-xs">Waiting for</div>
              <div className="font-medium">New whale event</div>
            </div>
            <div className="p-2 bg-background/50 rounded">
              <div className="text-muted-foreground text-xs">OR</div>
              <div className="font-medium">Volatility stable</div>
            </div>
            <div className="p-2 bg-background/50 rounded">
              <div className="text-muted-foreground text-xs">OR</div>
              <div className="font-medium">Price exits range</div>
            </div>
          </div>
          
          <p className="text-xs text-center text-muted-foreground">
            Avoiding duplicated signals and post-event noise
          </p>
        </CardContent>
      </Card>
    );
  }

  // Active Trade Monitoring UI
  if (bestTrade.status === "ACTIVE_TRADE" && bestTrade.tradeProgress) {
    const pnl = bestTrade.tradeProgress.currentPnL;
    const isProfitable = pnl >= 0;
    
    return (
      <Card 
        className={`border-2 ${isProfitable ? 'border-green-500/30 bg-gradient-to-br from-green-500/5 to-green-500/10' : 'border-red-500/30 bg-gradient-to-br from-red-500/5 to-red-500/10'} hover:border-primary/40 transition-all cursor-pointer`}
        onClick={() => navigate(`/analysis/${bestTrade.coinId}`)}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary animate-pulse" />
              Active Trade
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={performance.mode === 'live' ? 'default' : 'secondary'}>
                {performance.mode.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="gap-1 text-green-500">
                <Play className="h-3 w-3" />
                Monitoring
              </Badge>
            </div>
          </div>
          <CardDescription className="flex items-center gap-2">
            <Timer className="h-4 w-4" />
            Next check in: {bestTrade.nextScanIn}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <PerformanceBar />
          
          {/* Coin Info */}
          <div className="flex items-center gap-4 pb-4 border-b border-border/50">
            <img src={bestTrade.coinImage} alt={bestTrade.coinName} className="w-12 h-12 rounded-full" />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-2xl font-bold">{bestTrade.coinName}</h3>
                <Badge variant="secondary">{bestTrade.coinSymbol}</Badge>
                <Badge variant="outline" className={`text-lg font-bold ${bestTrade.action === 'BUY' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {bestTrade.action === "BUY" ? (
                    <><TrendingUp className="h-4 w-4 mr-1" /> LONG</>
                  ) : (
                    <><TrendingDown className="h-4 w-4 mr-1" /> SHORT</>
                  )}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                In trade for {Math.round(bestTrade.tradeProgress.timeInTrade)}m
              </p>
            </div>
          </div>

          {/* P&L Display */}
          <div className={`p-4 rounded-lg ${isProfitable ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Current P&L</span>
              <span className={`text-3xl font-bold ${isProfitable ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
              </span>
            </div>
            <Progress 
              value={Math.min(100, Math.max(0, 50 + pnl * 10))} 
              className="h-2 mt-2" 
            />
          </div>

          {/* Trade Targets */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1 p-3 bg-background/50 rounded-lg">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <DollarSign className="h-3 w-3" />
                Entry
              </div>
              <div className="font-bold text-lg">
                ${bestTrade.entryPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="space-y-1 p-3 bg-background/50 rounded-lg">
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <DollarSign className="h-3 w-3" />
                Current
              </div>
              <div className="font-bold text-lg">
                ${bestTrade.currentPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="space-y-1 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
              <div className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs">
                <Target className="h-3 w-3" />
                Target ({bestTrade.tradeProgress.distanceToTarget.toFixed(1)}% away)
              </div>
              <div className="font-bold text-lg text-green-600 dark:text-green-400">
                ${bestTrade.targetPrice?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="space-y-1 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
              <div className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs">
                <ShieldAlert className="h-3 w-3" />
                Stop ({bestTrade.tradeProgress.distanceToStop.toFixed(1)}% buffer)
              </div>
              <div className="font-bold text-lg text-red-600 dark:text-red-400">
                ${bestTrade.stopLoss?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <p className="text-xs text-center text-muted-foreground">{bestTrade.reasoning}</p>
        </CardContent>
      </Card>
    );
  }

  // WAITING / NO_OPPORTUNITY status
  if (bestTrade.action === "NO_TRADE") {
    return (
      <Card className="border-2 border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-blue-500/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-6 w-6 text-blue-500 animate-spin" style={{ animationDuration: '3s' }} />
            Scanning Market
          </CardTitle>
          <CardDescription className="flex items-center gap-2">
            <Timer className="h-4 w-4" />
            Auto-rescan in: {bestTrade.nextScanIn}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PerformanceBar />
          
          <div className="p-4 bg-background/50 rounded-lg border border-blue-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-5 w-5 text-blue-500" />
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
              <div className="text-xs text-muted-foreground mb-1">Next Action</div>
              <div className="text-sm font-medium">{bestTrade.timeUntilNextAction}</div>
            </div>
          </div>
          
          <p className="text-xs text-center text-muted-foreground">
            Operating as professional trading desk • Patience over profit
          </p>
        </CardContent>
      </Card>
    );
  }

  // FOUND - New trade signal
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
            <StateIndicator />
          </div>
        </div>
        <CardDescription className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          {filtersPassed.length}/{filtersApplied.length} filters passed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
              {bestTrade.rsi14.toFixed(1)}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 bg-background/50 rounded-lg">
            <span className="text-xs text-muted-foreground">1h</span>
            <span className={`text-xl font-bold ${bestTrade.priceChange1h >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {bestTrade.priceChange1h >= 0 ? '+' : ''}{bestTrade.priceChange1h.toFixed(2)}%
            </span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 bg-background/50 rounded-lg">
            <span className="text-xs text-muted-foreground">24h</span>
            <span className={`text-xl font-bold ${bestTrade.priceChange24h >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {bestTrade.priceChange24h >= 0 ? '+' : ''}{bestTrade.priceChange24h.toFixed(2)}%
            </span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 bg-background/50 rounded-lg">
            <span className="text-xs text-muted-foreground">7d</span>
            <span className={`text-xl font-bold ${bestTrade.priceChange7d >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {bestTrade.priceChange7d >= 0 ? '+' : ''}{bestTrade.priceChange7d.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Reasoning */}
        <div className="p-4 bg-background/50 rounded-lg border border-border/50">
          <p className="text-sm text-muted-foreground">{bestTrade.reasoning}</p>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Click for detailed analysis • {bestTrade.timeUntilNextAction}
        </p>
      </CardContent>
    </Card>
  );
};

export default BestTradeToday;
