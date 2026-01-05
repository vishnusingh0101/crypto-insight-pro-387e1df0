import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
  RefreshCw,
  Ban,
  Crosshair,
  History,
  Percent
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
  currentState: string;
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
  entryType: "IMMEDIATE" | "LIMIT";
  entryFilled: boolean;
  createdAt: string;
  lastMonitoredAt: string;
};

type TradeProgress = {
  currentPnL: number;
  distanceToTarget: number;
  distanceToStop: number;
  timeInTrade: number;
  entryFilled: boolean;
  hoursUntilTimeout: number;
};

type MarketRegime = "TREND_UP" | "DIP_UP" | "TREND_DOWN" | "CHOPPY";

type TradeResult = {
  coinId: string;
  coinName: string;
  coinSymbol: string;
  coinImage: string;
  action: "BUY" | "SELL" | "NO_TRADE";
  status: "WAITING" | "TRADE_READY" | "TRADE_ACTIVE" | "TRADE_CLOSED" | "NOT_EXECUTED" | "COOLDOWN" | "CAPITAL_PROTECTION";
  currentPrice: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  targetPercent: number;
  riskPercent: number;
  riskReward: number;
  probabilityScore: number;
  expectedTimeToTarget: string;
  confidenceScore: number;
  entryType: "IMMEDIATE" | "LIMIT";
  marketRegime: MarketRegime;
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
  const previousTradeRef = useRef<TradeResult | null>(null);
  
  const getRefetchInterval = (data: TradeResult | undefined): number => {
    if (!data) return 60000;
    
    switch (data.status) {
      case 'TRADE_ACTIVE':
      case 'TRADE_READY':
        return 900000; // 15 minutes - monitor swing trade
      case 'COOLDOWN':
      case 'TRADE_CLOSED':
        return 1800000; // 30 minutes during cooldown
      case 'CAPITAL_PROTECTION':
        return 3600000; // 1 hour during protection
      case 'WAITING':
      case 'NOT_EXECUTED':
      default:
        return 3600000; // 1 hour - scan interval
    }
  };
  
  const { data: bestTrade, isLoading, error } = useQuery({
    queryKey: ['bestTradeToday'],
    queryFn: async () => {
      console.log("Fetching swing trading status...");
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
              return retryData as TradeResult;
            }
          } catch (ctxErr) {
            console.warn("Failed to parse error context", ctxErr);
          }
        }

        throw error;
      }

      return data as TradeResult;
    },
    refetchInterval: (query) => getRefetchInterval(query.state.data),
    retry: 1,
  });

  useEffect(() => {
    if (!bestTrade) return;
    
    const prev = previousTradeRef.current;
    
    if (bestTrade.status === "TRADE_READY" || bestTrade.status === "TRADE_ACTIVE") {
      if (!prev || prev.coinId !== bestTrade.coinId || prev.action !== bestTrade.action) {
        toast({
          title: `🎯 SWING ${bestTrade.action} ${bestTrade.coinSymbol}`,
          description: `Probability: ${bestTrade.probabilityScore}% | ETA: ${bestTrade.expectedTimeToTarget} | ${bestTrade.riskReward}R`,
        });
      }
    }
    
    if (prev && prev.status !== bestTrade.status) {
      if (bestTrade.status === 'TRADE_CLOSED') {
        toast({
          title: bestTrade.trendAlignment === 'SUCCESS' ? "✅ Trade Closed - SUCCESS" : "❌ Trade Closed - FAILED",
          description: bestTrade.reasoning,
          variant: bestTrade.trendAlignment === 'SUCCESS' ? 'default' : 'destructive',
        });
      } else if (bestTrade.status === 'NOT_EXECUTED') {
        toast({
          title: "⏰ Trade Expired - NOT EXECUTED",
          description: "Entry price not reached. Missing a trade is acceptable.",
        });
      } else if (bestTrade.status === 'CAPITAL_PROTECTION') {
        toast({
          title: "🛡️ Capital Protection - 24h Pause",
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

  const StateIndicator = () => {
    const stateConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
      WAITING: { icon: <RefreshCw className="h-4 w-4" />, label: "Scanning", color: "text-blue-500" },
      TRADE_READY: { icon: <Crosshair className="h-4 w-4" />, label: "Ready", color: "text-yellow-500" },
      TRADE_ACTIVE: { icon: <Play className="h-4 w-4" />, label: "Holding", color: "text-green-500" },
      TRADE_CLOSED: { icon: <CheckCircle2 className="h-4 w-4" />, label: "Closed", color: "text-purple-500" },
      NOT_EXECUTED: { icon: <Ban className="h-4 w-4" />, label: "Expired", color: "text-gray-500" },
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

  const MarketRegimeBadge = () => {
    const regimeConfig: Record<MarketRegime, { label: string; color: string }> = {
      TREND_UP: { label: "📈 Trend Up", color: "bg-green-500/20 text-green-600 dark:text-green-400" },
      DIP_UP: { label: "💰 Dip Buy", color: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
      TREND_DOWN: { label: "📉 Trend Down", color: "bg-red-500/20 text-red-600 dark:text-red-400" },
      CHOPPY: { label: "〰️ Choppy", color: "bg-amber-500/20 text-amber-600 dark:text-amber-400" },
    };
    
    const regime = regimeConfig[bestTrade.marketRegime] || regimeConfig.CHOPPY;
    
    return (
      <Badge variant="secondary" className={regime.color}>
        {regime.label}
      </Badge>
    );
  };

  const PerformanceBar = () => (
    <div className="grid grid-cols-2 md:grid-cols-7 gap-3 p-4 bg-background/50 rounded-lg border border-border/50">
      <div className="text-center">
        <div className="text-xs text-muted-foreground">State</div>
        <StateIndicator />
      </div>
      <div className="text-center">
        <div className="text-xs text-muted-foreground">Regime</div>
        <MarketRegimeBadge />
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
        <div className="text-xs text-muted-foreground">Win Rate</div>
        <div className={`font-bold text-lg ${
          performance.accuracyPercent >= 60 ? 'text-green-600 dark:text-green-400' : 
          performance.accuracyPercent >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
        }`}>
          {performance.accuracyPercent?.toFixed(1) || 0}%
        </div>
      </div>
    </div>
  );

  const TradeHistoryButton = () => (
    <Button 
      variant="outline" 
      size="sm" 
      className="gap-2"
      onClick={() => navigate('/trade-history')}
    >
      <History className="h-4 w-4" />
      View History
    </Button>
  );

  // Capital Protection UI
  if (bestTrade.status === "CAPITAL_PROTECTION") {
    return (
      <Card className="border-2 border-red-500/30 bg-gradient-to-br from-red-500/5 to-red-500/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-6 w-6 text-red-500" />
              Capital Protection - 24h Pause
            </CardTitle>
            <TradeHistoryButton />
          </div>
          <CardDescription className="flex items-center gap-2">
            <Timer className="h-4 w-4" />
            Re-evaluating in: {bestTrade.timeUntilNextAction}
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
                {performance.consecutiveLosses} consecutive losses triggered 24h protection
              </span>
            </div>
          )}
          
          <p className="text-xs text-center text-muted-foreground">
            Probability first • Trade less, but trade better
          </p>
        </CardContent>
      </Card>
    );
  }

  // Cooldown or Trade Closed UI
  if (bestTrade.status === "COOLDOWN" || bestTrade.status === "TRADE_CLOSED") {
    return (
      <Card className="border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-amber-500/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Pause className="h-6 w-6 text-amber-500" />
              {bestTrade.status === "TRADE_CLOSED" ? "Trade Closed - Cooldown" : "Cooldown Active"}
            </CardTitle>
            <TradeHistoryButton />
          </div>
          <CardDescription className="flex items-center gap-2">
            <Timer className="h-4 w-4" />
            Next scan in: {bestTrade.nextScanIn}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PerformanceBar />
          
          <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-amber-500" />
              <span className="font-semibold text-amber-600 dark:text-amber-400">Swing Cooldown</span>
            </div>
            <p className="text-sm text-muted-foreground">{bestTrade.reasoning}</p>
          </div>
          
          <p className="text-xs text-center text-muted-foreground">
            Trade less, but trade better • Missing trades is better than bad trades
          </p>
        </CardContent>
      </Card>
    );
  }

  // NOT_EXECUTED UI
  if (bestTrade.status === "NOT_EXECUTED") {
    return (
      <Card className="border-2 border-gray-500/30 bg-gradient-to-br from-gray-500/5 to-gray-500/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Ban className="h-6 w-6 text-gray-500" />
              Trade Not Executed
            </CardTitle>
            <TradeHistoryButton />
          </div>
          <CardDescription className="flex items-center gap-2">
            <Timer className="h-4 w-4" />
            Resuming scan in: {bestTrade.nextScanIn}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PerformanceBar />
          
          <div className="p-4 bg-gray-500/10 rounded-lg border border-gray-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-gray-500" />
              <span className="font-semibold text-gray-600 dark:text-gray-400">Entry Timeout</span>
            </div>
            <p className="text-sm text-muted-foreground">{bestTrade.reasoning}</p>
          </div>
          
          <p className="text-xs text-center text-muted-foreground">
            Missing a trade is acceptable • Probability first
          </p>
        </CardContent>
      </Card>
    );
  }

  // Active Trade Monitoring UI (Swing)
  if (bestTrade.status === "TRADE_ACTIVE" && bestTrade.tradeProgress) {
    const { entryFilled, currentPnL, hoursUntilTimeout } = bestTrade.tradeProgress;
    const pnl = currentPnL;
    const isProfitable = pnl >= 0;
    
    return (
      <Card className={`border-2 ${isProfitable ? 'border-green-500/30 bg-gradient-to-br from-green-500/5 to-green-500/10' : 'border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-amber-500/10'}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {bestTrade.coinImage && (
                <img src={bestTrade.coinImage} alt={bestTrade.coinName} className="w-10 h-10 rounded-full" />
              )}
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5 text-green-500" />
                  SWING {bestTrade.action} {bestTrade.coinSymbol}
                </CardTitle>
                <CardDescription>
                  {entryFilled ? `Holding for ${bestTrade.tradeProgress.timeInTrade.toFixed(1)}h` : `Waiting for entry...`}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={entryFilled ? 'default' : 'outline'} className={entryFilled ? 'bg-green-500' : ''}>
                {entryFilled ? '✓ FILLED' : 'LIMIT'}
              </Badge>
              <TradeHistoryButton />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <PerformanceBar />
          
          {/* P&L and Progress */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-3 bg-background/50 rounded-lg">
              <div className="text-xs text-muted-foreground">Entry</div>
              <div className="font-bold">${bestTrade.entryPrice.toFixed(2)}</div>
            </div>
            <div className="text-center p-3 bg-background/50 rounded-lg">
              <div className="text-xs text-muted-foreground">Current</div>
              <div className="font-bold">${bestTrade.currentPrice.toFixed(2)}</div>
            </div>
            <div className={`text-center p-3 rounded-lg ${isProfitable ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
              <div className="text-xs text-muted-foreground">P&L</div>
              <div className={`font-bold ${isProfitable ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
              </div>
            </div>
            <div className="text-center p-3 bg-green-500/10 rounded-lg">
              <div className="text-xs text-muted-foreground">Target ({bestTrade.riskReward}R)</div>
              <div className="font-bold text-green-600 dark:text-green-400">
                +{bestTrade.targetPercent.toFixed(1)}%
              </div>
            </div>
            <div className="text-center p-3 bg-red-500/10 rounded-lg">
              <div className="text-xs text-muted-foreground">Stop</div>
              <div className="font-bold text-red-600 dark:text-red-400">
                -{bestTrade.riskPercent.toFixed(1)}%
              </div>
            </div>
          </div>
          
          {/* Progress bars */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Distance to Target</span>
              <span>{bestTrade.tradeProgress.distanceToTarget.toFixed(2)}%</span>
            </div>
            <Progress 
              value={Math.max(0, 100 - (bestTrade.tradeProgress.distanceToTarget / bestTrade.targetPercent * 100))} 
              className="h-2"
            />
          </div>
          
          {!entryFilled && (
            <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-center">
              <Timer className="h-4 w-4 inline mr-2 text-amber-500" />
              <span className="text-sm text-amber-600 dark:text-amber-400">
                Entry timeout in {hoursUntilTimeout.toFixed(1)} hours
              </span>
            </div>
          )}
          
          <p className="text-xs text-center text-muted-foreground">
            {bestTrade.reasoning}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Waiting/Trade Ready UI
  const hasSignal = bestTrade.action !== "NO_TRADE";
  const actionColor = bestTrade.action === "BUY" ? "text-green-600 dark:text-green-400" : 
                      bestTrade.action === "SELL" ? "text-red-600 dark:text-red-400" : 
                      "text-muted-foreground";
  const actionBg = bestTrade.action === "BUY" ? "bg-green-500/10" : 
                   bestTrade.action === "SELL" ? "bg-red-500/10" : 
                   "bg-muted/20";

  return (
    <Card className={`border-2 ${hasSignal ? 'border-primary/40 bg-gradient-to-br from-primary/5 to-primary/10' : 'border-muted/30 bg-gradient-to-br from-muted/5 to-muted/10'}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {hasSignal && bestTrade.coinImage && (
              <img src={bestTrade.coinImage} alt={bestTrade.coinName} className="w-10 h-10 rounded-full" />
            )}
            <div>
              <CardTitle className="flex items-center gap-2">
                {hasSignal ? (
                  <>
                    <Crosshair className="h-5 w-5 text-primary" />
                    SWING {bestTrade.action} {bestTrade.coinSymbol}
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-5 w-5 text-muted-foreground" />
                    Scanning for Opportunities
                  </>
                )}
              </CardTitle>
              <CardDescription>
                {hasSignal ? bestTrade.trendAlignment : `Next scan in ${bestTrade.nextScanIn}`}
              </CardDescription>
            </div>
          </div>
          <TradeHistoryButton />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <PerformanceBar />
        
        {hasSignal ? (
          <>
            {/* Probability and ETA */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-primary/10 rounded-lg border border-primary/20">
                <Percent className="h-5 w-5 mx-auto mb-1 text-primary" />
                <div className="text-xs text-muted-foreground">Success Probability</div>
                <div className="text-2xl font-bold text-primary">{bestTrade.probabilityScore}%</div>
              </div>
              <div className="text-center p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <Timer className="h-5 w-5 mx-auto mb-1 text-blue-500" />
                <div className="text-xs text-muted-foreground">Expected Time to Target</div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{bestTrade.expectedTimeToTarget}</div>
              </div>
              <div className="text-center p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                <Target className="h-5 w-5 mx-auto mb-1 text-green-500" />
                <div className="text-xs text-muted-foreground">Target ({bestTrade.riskReward}R)</div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">+{bestTrade.targetPercent.toFixed(1)}%</div>
              </div>
              <div className="text-center p-4 bg-red-500/10 rounded-lg border border-red-500/20">
                <Shield className="h-5 w-5 mx-auto mb-1 text-red-500" />
                <div className="text-xs text-muted-foreground">Stop Loss</div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">-{bestTrade.riskPercent.toFixed(1)}%</div>
              </div>
            </div>
            
            {/* Trade details */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="p-2 bg-background/50 rounded">
                <span className="text-muted-foreground">Entry:</span>{' '}
                <span className="font-medium">${bestTrade.entryPrice.toFixed(2)}</span>
                <Badge variant="outline" className="ml-2 text-xs">{bestTrade.entryType}</Badge>
              </div>
              <div className="p-2 bg-background/50 rounded">
                <span className="text-muted-foreground">RSI:</span>{' '}
                <span className="font-medium">{bestTrade.rsi14.toFixed(1)}</span>
              </div>
              <div className="p-2 bg-background/50 rounded">
                <span className="text-muted-foreground">7d:</span>{' '}
                <span className={bestTrade.priceChange7d >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                  {bestTrade.priceChange7d >= 0 ? '+' : ''}{bestTrade.priceChange7d.toFixed(1)}%
                </span>
              </div>
              <div className="p-2 bg-background/50 rounded">
                <span className="text-muted-foreground">Rank:</span>{' '}
                <span className="font-medium">#{bestTrade.marketCapRank}</span>
              </div>
            </div>
            
            {/* Whale alignment */}
            {bestTrade.whaleIntent && bestTrade.whaleIntent !== 'neutral' && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                (bestTrade.action === 'BUY' && bestTrade.whaleIntent === 'accumulating') ||
                (bestTrade.action === 'SELL' && bestTrade.whaleIntent === 'distributing')
                  ? 'bg-green-500/10 border border-green-500/20'
                  : 'bg-amber-500/10 border border-amber-500/20'
              }`}>
                <Activity className="h-4 w-4" />
                <span className="text-sm">
                  Whale activity: <strong className="capitalize">{bestTrade.whaleIntent}</strong>
                  {bestTrade.whaleConfidence && ` (${bestTrade.whaleConfidence}% confidence)`}
                </span>
              </div>
            )}
            
            <p className="text-xs text-muted-foreground">{bestTrade.reasoning}</p>
          </>
        ) : (
          <div className="text-center py-8">
            <RefreshCw className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50 animate-spin" style={{ animationDuration: '3s' }} />
            <p className="text-muted-foreground mb-2">No qualifying setup found</p>
            <p className="text-xs text-muted-foreground">
              Minimum probability threshold: 70% • {bestTrade.reasoning}
            </p>
          </div>
        )}
        
        <p className="text-xs text-center text-muted-foreground border-t pt-3">
          Probability first • Speed second • Missing trades is better than bad trades
        </p>
      </CardContent>
    </Card>
  );
};

export default BestTradeToday;
