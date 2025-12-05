import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Bell, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  Clock,
  Zap,
  ArrowDownRight,
  ArrowUpRight,
  Activity
} from "lucide-react";
import { toast } from "sonner";

interface WhaleTransaction {
  hash: string;
  blockchain: string;
  amount: number;
  amountUsd: number;
  from: string;
  to: string;
  timestamp: string;
  type: 'transfer' | 'exchange_inflow' | 'exchange_outflow' | 'unknown';
  significance: 'high' | 'medium' | 'low';
}

interface WhaleAlertsFeedProps {
  transactions: WhaleTransaction[];
  isLoading: boolean;
  prices?: { btc: number; eth: number };
}

interface Alert {
  id: string;
  type: 'whale' | 'trend' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  severity: 'high' | 'medium' | 'low';
  blockchain?: string;
}

const formatUsd = (amount: number) => {
  if (amount >= 1000000000) return `$${(amount / 1000000000).toFixed(2)}B`;
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
};

const formatTimeAgo = (date: Date) => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

export const WhaleAlertsFeed = ({ transactions, isLoading, prices }: WhaleAlertsFeedProps) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [notifiedHashes, setNotifiedHashes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!transactions.length) return;

    const newAlerts: Alert[] = [];
    
    // Generate alerts from high-significance transactions
    transactions
      .filter(tx => tx.significance === 'high')
      .slice(0, 5)
      .forEach((tx, index) => {
        newAlerts.push({
          id: `whale-${tx.hash}`,
          type: 'whale',
          title: `Massive ${tx.blockchain.toUpperCase()} Movement`,
          message: `${formatUsd(tx.amountUsd)} ${tx.type === 'exchange_inflow' ? 'moved to exchange' : tx.type === 'exchange_outflow' ? 'withdrawn from exchange' : 'transferred'}`,
          timestamp: new Date(Date.now() - index * 120000),
          severity: 'high',
          blockchain: tx.blockchain,
        });
      });

    // Add trend alerts based on patterns
    const inflows = transactions.filter(tx => tx.type === 'exchange_inflow');
    const outflows = transactions.filter(tx => tx.type === 'exchange_outflow');
    
    if (inflows.length > outflows.length * 1.5) {
      newAlerts.push({
        id: 'trend-bearish',
        type: 'warning',
        title: 'Bearish Flow Detected',
        message: 'Significant exchange inflows suggest potential selling pressure',
        timestamp: new Date(Date.now() - 300000),
        severity: 'high',
      });
    } else if (outflows.length > inflows.length * 1.5) {
      newAlerts.push({
        id: 'trend-bullish',
        type: 'trend',
        title: 'Bullish Accumulation',
        message: 'Heavy exchange outflows indicate accumulation phase',
        timestamp: new Date(Date.now() - 300000),
        severity: 'medium',
      });
    }

    // Add price alerts if prices available
    if (prices) {
      newAlerts.push({
        id: 'price-btc',
        type: 'info',
        title: 'BTC Price Update',
        message: `Bitcoin trading at ${formatUsd(prices.btc)}`,
        timestamp: new Date(Date.now() - 60000),
        severity: 'low',
        blockchain: 'bitcoin',
      });
    }

    // Add medium significance summary
    const mediumTxs = transactions.filter(tx => tx.significance === 'medium');
    if (mediumTxs.length > 3) {
      const totalVolume = mediumTxs.reduce((sum, tx) => sum + tx.amountUsd, 0);
      newAlerts.push({
        id: 'medium-summary',
        type: 'info',
        title: 'Medium Whale Activity',
        message: `${mediumTxs.length} transactions totaling ${formatUsd(totalVolume)}`,
        timestamp: new Date(Date.now() - 180000),
        severity: 'low',
      });
    }

    setAlerts(newAlerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));

    // Show toast for new high-severity alerts
    const highSeverityTxs = transactions.filter(tx => tx.significance === 'high');
    highSeverityTxs.forEach(tx => {
      if (!notifiedHashes.has(tx.hash)) {
        toast.warning(`🐋 ${formatUsd(tx.amountUsd)} ${tx.blockchain.toUpperCase()} whale alert!`, {
          description: tx.type === 'exchange_inflow' ? 'Moved to exchange' : 'Large transfer detected',
          duration: 5000,
        });
        setNotifiedHashes(prev => new Set([...prev, tx.hash]));
      }
    });
  }, [transactions, prices]);

  if (isLoading) {
    return (
      <Card className="bg-card/50 backdrop-blur border-border/50 h-full">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getAlertIcon = (alert: Alert) => {
    switch (alert.type) {
      case 'whale':
        return <Zap className="h-4 w-4" />;
      case 'trend':
        return alert.severity === 'high' ? 
          <TrendingDown className="h-4 w-4" /> : 
          <TrendingUp className="h-4 w-4" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getAlertColor = (alert: Alert) => {
    if (alert.type === 'warning' || alert.severity === 'high') return 'text-destructive';
    if (alert.type === 'trend') return 'text-success';
    return 'text-primary';
  };

  const getAlertBg = (alert: Alert) => {
    if (alert.type === 'warning' || alert.severity === 'high') return 'bg-destructive/10 border-destructive/30';
    if (alert.type === 'trend') return 'bg-success/10 border-success/30';
    return 'bg-primary/10 border-primary/30';
  };

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50 h-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5 text-primary" />
            Live Alerts
          </div>
          <div className="flex items-center gap-2">
            <span className="animate-pulse h-2 w-2 rounded-full bg-success" />
            <span className="text-xs text-muted-foreground">{alerts.length} alerts</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] pr-4">
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No alerts yet</p>
                <p className="text-xs">Watching for whale activity...</p>
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`rounded-lg p-3 border ${getAlertBg(alert)} transition-all duration-300 hover:scale-[1.02]`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg bg-background/50 ${getAlertColor(alert)}`}>
                      {getAlertIcon(alert)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className={`font-semibold text-sm ${getAlertColor(alert)}`}>
                          {alert.title}
                        </h4>
                        {alert.blockchain && (
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {alert.blockchain === 'bitcoin' ? 'BTC' : 'ETH'}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{alert.message}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">
                          {formatTimeAgo(alert.timestamp)}
                        </span>
                        <Badge 
                          variant={
                            alert.severity === 'high' ? 'destructive' : 
                            alert.severity === 'medium' ? 'secondary' : 'outline'
                          }
                          className="text-[10px]"
                        >
                          {alert.severity}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Quick Stats at Bottom */}
        <div className="mt-4 pt-4 border-t border-border/30">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-background/30 rounded-lg p-2">
              <div className="flex items-center justify-center gap-1 text-destructive">
                <AlertTriangle className="h-3 w-3" />
                <span className="text-xs font-bold">
                  {alerts.filter(a => a.severity === 'high').length}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">Critical</p>
            </div>
            <div className="bg-background/30 rounded-lg p-2">
              <div className="flex items-center justify-center gap-1 text-warning">
                <Activity className="h-3 w-3" />
                <span className="text-xs font-bold">
                  {alerts.filter(a => a.severity === 'medium').length}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">Medium</p>
            </div>
            <div className="bg-background/30 rounded-lg p-2">
              <div className="flex items-center justify-center gap-1 text-muted-foreground">
                <Bell className="h-3 w-3" />
                <span className="text-xs font-bold">
                  {alerts.filter(a => a.severity === 'low').length}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">Info</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
