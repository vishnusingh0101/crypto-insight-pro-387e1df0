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
  RefreshCw,
  Ban,
  Crosshair
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
  minutesUntilTimeout: number;
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
  score: number;
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
        return 180000; // 3 minutes - monitor active trade
      case 'COOLDOWN':
      case 'TRADE_CLOSED':
        return 300000; // 5 minutes during cooldown
      case 'CAPITAL_PROTECTION':
        return 3600000; // 1 hour during protection
      case 'WAITING':
      case 'NOT_EXECUTED':
      default:
        return 900000; // 15 minutes - scan interval
    }
  };
  
  const { data: bestTrade, isLoading, error } = useQuery({
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
          title: `🎯 ${bestTrade.systemPerformance?.mode?.toUpperCase() || 'PAPER'} Signal: ${bestTrade.action} ${bestTrade.coinSymbol}`,
          description: `Score: ${bestTrade.score} | ${bestTrade.entryType} entry @ $${bestTrade.entryPrice.toFixed(2)}`,
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
          description: "Entry price not reached within timeout. Resuming scan.",
        });
      } else if (bestTrade.status === 'COOLDOWN') {
        toast({
          title: "⏸️ Cooldown Active",
          description: "Data-based cooldown to avoid duplicated signals.",
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

  const StateIndicator = () => {
    const stateConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
      WAITING: { icon: <RefreshCw className="h-4 w-4" />, label: "Scanning", color: "text-blue-500" },
      TRADE_READY: { icon: <Crosshair className="h-4 w-4" />, label: "Ready", color: "text-yellow-500" },
      TRADE_ACTIVE: { icon: <Play className="h-4 w-4" />, label: "Active", color: "text-green-500" },
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

  // Capital Protection UI
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
            Capital protection &gt; trade frequency • Data-based, not emotional
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
          <CardTitle className="flex items-center gap-2">
            <Pause className="h-6 w-6 text-amber-500" />
            {bestTrade.status === "TRADE_CLOSED" ? "Trade Closed - Cooldown" : "Smart Cooldown Active"}
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
              <span className="font-semibold text-amber-600 dark:text-amber-400">Data-Based Cooldown</span>
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
              <div className="font-medium">Volatility normalized</div>
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

  // NOT_EXECUTED UI
  if (bestTrade.status === "NOT_EXECUTED") {
    return (
      <Card className="border-2 border-gray-500/30 bg-gradient-to-br from-gray-500/5 to-gray-500/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ban className="h-6 w-6 text-gray-500" />
            Trade Not Executed
          </CardTitle>
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
            A trade that cannot execute is worse than no trade
          </p>
        </CardContent>
      </Card>
    );
  }

  // Active Trade Monitoring UI
  if (bestTrade.status === "TRADE_ACTIVE" && bestTrade.tradeProgress) {
    const { entryFilled, currentPnL, minutesUntilTimeout } = bestTrade.tradeProgress;
    const pnl = currentPnL;
    const isProfitable = pnl >= 0;
    
    return (
      <Card 
        className={`border-2 ${entryFilled ? (isProfitable ? 'border-green-500/30 bg-gradient-to-br from-green-500/5 to-green-500/10' : 'border-red-500/30 bg-gradient-to-br from-red-500/5 to-red-500/10') : 'border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 to-yellow-500/10'} hover:border-primary/40 transition-all cursor-pointer`}
        onClick={() => navigate(`/analysis/${bestTrade.coinId}`)}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary animate-pulse" />
              {entryFilled ? "Trade Active" : "Waiting for Entry"}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={bestTrade.entryType === 'IMMEDIATE' ? 'default' : 'secondary'}>
                {bestTrade.entryType}
              </Badge>
              <Badge variant={performance.mode === 'live' ? 'default' : 'secondary'}>
                {performance.mode.toUpperCase()}
              </Badge>
            </div>
          </div>
          <CardDescription className="flex items-center gap-2">
            <Timer className="h-4 w-4" />
            {bestTrade.timeUntilNextAction}
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
                {entryFilled 
                  ? `In trade for ${Math.round(bestTrade.tradeProgress.timeInTrade)}m` 
                  : `Entry timeout in ${Math.round(minutesUntilTimeout)}m`}
              </p>
            </div>
          </div>

          {/* Entry Status (for limit orders) */}
          {!entryFilled && (
            <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Waiting for Limit Entry</span>
                <span className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
                  ${bestTrade.entryPrice.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">Current Price</span>
                <span className="font-medium">${bestTrade.currentPrice.toFixed(2)}</span>
              </div>
              <Progress 
                value={Math.max(0, 100 - (minutesUntilTimeout / 45 * 100))} 
                className="h-2 mt-2" 
              />
              <p className="text-xs text-center text-muted-foreground mt-1">
                {Math.round(minutesUntilTimeout)}m until timeout
              </p>
            </div>
          )}

          {/* P&L Display (only when filled) */}
          {entryFilled && (
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
          )}

          {/* Trade Targets */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1 p-3 bg-background/50 rounded-lg">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> Entry
              </div>
              <div className="font-bold text-lg">${bestTrade.entryPrice.toFixed(2)}</div>
            </div>
            <div className="space-y-1 p-3 bg-background/50 rounded-lg">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> Current
              </div>
              <div className="font-bold text-lg">${bestTrade.currentPrice.toFixed(2)}</div>
            </div>
            <div className="space-y-1 p-3 bg-green-500/10 rounded-lg">
              <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <Target className="h-3 w-3" /> Target
              </div>
              <div className="font-bold text-lg text-green-600 dark:text-green-400">
                ${bestTrade.targetPrice.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">
                +{bestTrade.targetPercent.toFixed(2)}%
              </div>
            </div>
            <div className="space-y-1 p-3 bg-red-500/10 rounded-lg">
              <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" /> Stop
              </div>
              <div className="font-bold text-lg text-red-600 dark:text-red-400">
                ${bestTrade.stopLoss.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">
                -{bestTrade.riskPercent.toFixed(2)}%
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 text-center text-sm">
            <div className="p-2 bg-background/50 rounded">
              <div className="text-muted-foreground text-xs">Score</div>
              <div className="font-bold">{bestTrade.score}</div>
            </div>
            <div className="p-2 bg-background/50 rounded">
              <div className="text-muted-foreground text-xs">R:R</div>
              <div className="font-bold">{bestTrade.riskReward}:1</div>
            </div>
            <div className="p-2 bg-background/50 rounded">
              <div className="text-muted-foreground text-xs">RSI</div>
              <div className="font-bold">{bestTrade.rsi14?.toFixed(1)}</div>
            </div>
            <div className="p-2 bg-background/50 rounded">
              <div className="text-muted-foreground text-xs">Rank</div>
              <div className="font-bold">#{bestTrade.marketCapRank}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // WAITING State UI (including TRADE_READY)
  if (bestTrade.status === "WAITING" || bestTrade.status === "TRADE_READY") {
    const hasTrade = bestTrade.status === "TRADE_READY" && bestTrade.action !== "NO_TRADE";
    
    if (!hasTrade) {
      return (
        <Card className="border-2 border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-blue-500/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-6 w-6 text-blue-500" />
              Scanning Markets
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <Timer className="h-4 w-4" />
              Next scan in: {bestTrade.nextScanIn}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PerformanceBar />
            
            <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-5 w-5 text-blue-500" />
                <span className="font-semibold text-blue-600 dark:text-blue-400">WAITING</span>
              </div>
              <p className="text-sm text-muted-foreground">{bestTrade.reasoning}</p>
            </div>
            
            <p className="text-xs text-center text-muted-foreground">
              Execution realism &gt; signal perfection • If no valid setup exists, WAIT
            </p>
          </CardContent>
        </Card>
      );
    }
    
    // Trade Ready UI
    return (
      <Card 
        className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 hover:border-primary/50 transition-all cursor-pointer"
        onClick={() => navigate(`/analysis/${bestTrade.coinId}`)}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Crosshair className="h-6 w-6 text-primary" />
              Trade Signal Ready
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={bestTrade.entryType === 'IMMEDIATE' ? 'default' : 'secondary'}>
                {bestTrade.entryType} Entry
              </Badge>
              <Badge variant={performance.mode === 'live' ? 'default' : 'secondary'}>
                {performance.mode.toUpperCase()}
              </Badge>
            </div>
          </div>
          <CardDescription>{bestTrade.trendAlignment}</CardDescription>
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
                Rank #{bestTrade.marketCapRank} • Vol ${(bestTrade.volume24h / 1_000_000_000).toFixed(2)}B
              </p>
            </div>
          </div>

          {/* Score Display */}
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Trade Score</span>
              <span className="text-3xl font-bold text-primary">
                {bestTrade.score}/100
              </span>
            </div>
            <Progress value={bestTrade.score} className="h-2 mt-2" />
          </div>

          {/* Trade Setup */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1 p-3 bg-background/50 rounded-lg">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> Entry
              </div>
              <div className="font-bold text-lg">${bestTrade.entryPrice.toFixed(2)}</div>
            </div>
            <div className="space-y-1 p-3 bg-background/50 rounded-lg">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3" /> Current
              </div>
              <div className="font-bold text-lg">${bestTrade.currentPrice.toFixed(2)}</div>
            </div>
            <div className="space-y-1 p-3 bg-green-500/10 rounded-lg">
              <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <Target className="h-3 w-3" /> Target
              </div>
              <div className="font-bold text-lg text-green-600 dark:text-green-400">
                ${bestTrade.targetPrice.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">
                +{bestTrade.targetPercent.toFixed(2)}%
              </div>
            </div>
            <div className="space-y-1 p-3 bg-red-500/10 rounded-lg">
              <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" /> Stop
              </div>
              <div className="font-bold text-lg text-red-600 dark:text-red-400">
                ${bestTrade.stopLoss.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">
                -{bestTrade.riskPercent.toFixed(2)}%
              </div>
            </div>
          </div>

          {/* Reasoning */}
          <div className="p-3 bg-background/50 rounded-lg">
            <p className="text-sm text-muted-foreground">{bestTrade.reasoning}</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 md:grid-cols-6 gap-3 text-center text-sm">
            <div className="p-2 bg-background/50 rounded">
              <div className="text-muted-foreground text-xs">R:R</div>
              <div className="font-bold">{bestTrade.riskReward}:1</div>
            </div>
            <div className="p-2 bg-background/50 rounded">
              <div className="text-muted-foreground text-xs">RSI</div>
              <div className="font-bold">{bestTrade.rsi14?.toFixed(1)}</div>
            </div>
            <div className="p-2 bg-background/50 rounded">
              <div className="text-muted-foreground text-xs">ATR</div>
              <div className="font-bold">{bestTrade.atr14?.toFixed(2)}%</div>
            </div>
            <div className="p-2 bg-background/50 rounded">
              <div className="text-muted-foreground text-xs">1h</div>
              <div className={`font-bold ${bestTrade.priceChange1h >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {bestTrade.priceChange1h >= 0 ? '+' : ''}{bestTrade.priceChange1h?.toFixed(2)}%
              </div>
            </div>
            <div className="p-2 bg-background/50 rounded">
              <div className="text-muted-foreground text-xs">24h</div>
              <div className={`font-bold ${bestTrade.priceChange24h >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {bestTrade.priceChange24h >= 0 ? '+' : ''}{bestTrade.priceChange24h?.toFixed(2)}%
              </div>
            </div>
            <div className="p-2 bg-background/50 rounded">
              <div className="text-muted-foreground text-xs">7d</div>
              <div className={`font-bold ${bestTrade.priceChange7d >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {bestTrade.priceChange7d >= 0 ? '+' : ''}{bestTrade.priceChange7d?.toFixed(2)}%
              </div>
            </div>
          </div>

          {/* Whale Intel */}
          {bestTrade.whaleIntent && bestTrade.whaleIntent !== 'neutral' && (
            <div className="flex items-center gap-2 p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
              <Zap className="h-4 w-4 text-purple-500" />
              <span className="text-sm">
                Whale Activity: <span className="font-semibold capitalize">{bestTrade.whaleIntent}</span>
                {bestTrade.whaleConfidence && ` (${bestTrade.whaleConfidence}% confidence)`}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return null;
};

export default BestTradeToday;
