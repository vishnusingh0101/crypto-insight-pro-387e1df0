import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Bell, 
  BellOff,
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  Clock,
  Zap,
  Activity
} from "lucide-react";
import { toast } from "sonner";
import { useWhaleNotifications } from "@/hooks/useWhaleNotifications";

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
  hash?: string;
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
  const { isSupported, isEnabled, toggleNotifications, sendNotification } = useWhaleNotifications();

  useEffect(() => {
    if (!transactions.length) return;

    const newAlerts: Alert[] = [];
    
    // Generate alerts from high-significance transactions
    transactions
      .filter(tx => tx.significance === 'high' || tx.significance === 'medium')
      .slice(0, 8)
      .forEach((tx, index) => {
        newAlerts.push({
          id: `whale-${tx.hash}`,
          type: 'whale',
          title: `${tx.significance === 'high' ? 'Massive' : 'Large'} ${tx.blockchain.toUpperCase()} Movement`,
          message: `${formatUsd(tx.amountUsd)} ${tx.type === 'exchange_inflow' ? 'moved to exchange' : tx.type === 'exchange_outflow' ? 'withdrawn from exchange' : 'transferred'}`,
          timestamp: new Date(tx.timestamp),
          severity: tx.significance,
          blockchain: tx.blockchain,
          hash: tx.hash,
        });
      });

    // Add trend alerts based on patterns
    const inflows = transactions.filter(tx => tx.type === 'exchange_inflow');
    const outflows = transactions.filter(tx => tx.type === 'exchange_outflow');
    
    if (inflows.length > outflows.length * 1.5 && inflows.length > 2) {
      newAlerts.push({
        id: 'trend-bearish',
        type: 'warning',
        title: 'Bearish Flow Detected',
        message: 'Significant exchange inflows suggest potential selling pressure',
        timestamp: new Date(Date.now() - 300000),
        severity: 'high',
      });
    } else if (outflows.length > inflows.length * 1.5 && outflows.length > 2) {
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

    // Add summary for low significance transactions
    const lowTxs = transactions.filter(tx => tx.significance === 'low');
    if (lowTxs.length > 0) {
      const totalVolume = lowTxs.reduce((sum, tx) => sum + tx.amountUsd, 0);
      newAlerts.push({
        id: 'low-summary',
        type: 'info',
        title: 'Smaller Whale Activity',
        message: `${lowTxs.length} transactions totaling ${formatUsd(totalVolume)}`,
        timestamp: new Date(Date.now() - 180000),
        severity: 'low',
      });
    }

    setAlerts(newAlerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));

    // Send push notifications for high-severity transactions
    const highSeverityTxs = transactions.filter(tx => tx.significance === 'high');
    highSeverityTxs.forEach(tx => {
      if (!notifiedHashes.has(tx.hash)) {
        // Show in-app toast
        toast.warning(`🐋 ${formatUsd(tx.amountUsd)} ${tx.blockchain.toUpperCase()} whale alert!`, {
          description: tx.type === 'exchange_inflow' ? 'Moved to exchange' : tx.type === 'exchange_outflow' ? 'Withdrawn from exchange' : 'Large transfer detected',
          duration: 5000,
        });
        
        // Send browser push notification
        sendNotification({
          title: `🐋 ${tx.blockchain.toUpperCase()} Whale Alert`,
          body: `${formatUsd(tx.amountUsd)} ${tx.type === 'exchange_inflow' ? 'moved to exchange' : tx.type === 'exchange_outflow' ? 'withdrawn from exchange' : 'transferred'}`,
          data: { hash: tx.hash, blockchain: tx.blockchain },
        });
        
        setNotifiedHashes(prev => new Set([...prev, tx.hash]));
      }
    });
  }, [transactions, prices, sendNotification]);

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
            {isSupported && (
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleNotifications}
                className={`h-8 px-2 ${isEnabled ? 'text-success' : 'text-muted-foreground'}`}
                title={isEnabled ? 'Disable push notifications' : 'Enable push notifications'}
              >
                {isEnabled ? (
                  <Bell className="h-4 w-4" />
                ) : (
                  <BellOff className="h-4 w-4" />
                )}
              </Button>
            )}
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

        {/* Push Notification Status */}
        {isSupported && (
          <div className="mt-4 pt-4 border-t border-border/30">
            <Button
              variant={isEnabled ? "default" : "outline"}
              size="sm"
              className="w-full"
              onClick={toggleNotifications}
            >
              {isEnabled ? (
                <>
                  <Bell className="h-4 w-4 mr-2" />
                  Push Notifications Enabled
                </>
              ) : (
                <>
                  <BellOff className="h-4 w-4 mr-2" />
                  Enable Push Notifications
                </>
              )}
            </Button>
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              {isEnabled ? 'You\'ll receive alerts even when this tab is closed' : 'Get notified of whale activity even when away'}
            </p>
          </div>
        )}

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
