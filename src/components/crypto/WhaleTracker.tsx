import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, ArrowDownRight, ArrowUpRight, ExternalLink, TrendingUp, Wallet } from "lucide-react";
import { useEffect } from "react";
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

interface WhaleTrackerData {
  transactions: WhaleTransaction[];
  summary: {
    totalTransactions: number;
    totalVolumeUsd: number;
    highSignificance: number;
    exchangeInflows: number;
    exchangeOutflows: number;
    largestTransaction: WhaleTransaction | null;
  };
  prices: { btc: number; eth: number };
  timestamp: string;
}

const formatAmount = (amount: number, blockchain: string) => {
  if (blockchain === 'bitcoin') {
    return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} BTC`;
  }
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ETH`;
};

const formatUsd = (amount: number) => {
  if (amount >= 1000000000) {
    return `$${(amount / 1000000000).toFixed(2)}B`;
  }
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(2)}M`;
  }
  return `$${(amount / 1000).toFixed(0)}K`;
};

const truncateAddress = (address: string) => {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
};

const getTypeIcon = (type: WhaleTransaction['type']) => {
  switch (type) {
    case 'exchange_inflow':
      return <ArrowDownRight className="h-4 w-4 text-destructive" />;
    case 'exchange_outflow':
      return <ArrowUpRight className="h-4 w-4 text-green-500" />;
    default:
      return <Activity className="h-4 w-4 text-muted-foreground" />;
  }
};

const getTypeLabel = (type: WhaleTransaction['type']) => {
  switch (type) {
    case 'exchange_inflow':
      return 'Exchange Inflow';
    case 'exchange_outflow':
      return 'Exchange Outflow';
    case 'transfer':
      return 'Whale Transfer';
    default:
      return 'Transaction';
  }
};

const getSignificanceBadge = (significance: WhaleTransaction['significance']) => {
  switch (significance) {
    case 'high':
      return <Badge variant="destructive">High Impact</Badge>;
    case 'medium':
      return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400">Medium</Badge>;
    default:
      return <Badge variant="outline">Low</Badge>;
  }
};

const getBlockchainExplorer = (hash: string, blockchain: string) => {
  if (blockchain === 'bitcoin') {
    return `https://blockchair.com/bitcoin/transaction/${hash}`;
  }
  return `https://etherscan.io/tx/${hash}`;
};

export const WhaleTracker = () => {
  const { data, isLoading, error } = useQuery<WhaleTrackerData>({
    queryKey: ['whale-tracker'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('track-whale-transactions', {
        body: { blockchain: 'all' },
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000,
  });

  // Show notifications for high significance transactions
  useEffect(() => {
    if (data?.transactions) {
      const highImpactTxs = data.transactions.filter(tx => tx.significance === 'high');
      if (highImpactTxs.length > 0) {
        const tx = highImpactTxs[0];
        toast.warning(
          `🐋 Whale Alert: ${formatUsd(tx.amountUsd)} ${tx.blockchain.toUpperCase()} ${getTypeLabel(tx.type)}`,
          {
            description: `${formatAmount(tx.amount, tx.blockchain)} moved on-chain`,
            duration: 8000,
          }
        );
      }
    }
  }, [data?.timestamp]);

  if (isLoading) {
    return (
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Live Whale Tracker
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Live Whale Tracker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Unable to fetch whale data. Retrying...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Live Whale Tracker
          </div>
          <div className="flex items-center gap-2">
            <span className="animate-pulse h-2 w-2 rounded-full bg-green-500" />
            <span className="text-xs text-muted-foreground">Live</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-background/50 rounded-lg p-3 border border-border/30">
            <p className="text-xs text-muted-foreground">Total Volume</p>
            <p className="text-lg font-bold text-foreground">{formatUsd(data.summary.totalVolumeUsd)}</p>
          </div>
          <div className="bg-background/50 rounded-lg p-3 border border-border/30">
            <p className="text-xs text-muted-foreground">High Impact</p>
            <p className="text-lg font-bold text-destructive">{data.summary.highSignificance}</p>
          </div>
          <div className="bg-background/50 rounded-lg p-3 border border-border/30">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ArrowDownRight className="h-3 w-3 text-destructive" />
              Exchange Inflows
            </p>
            <p className="text-lg font-bold text-destructive">{data.summary.exchangeInflows}</p>
          </div>
          <div className="bg-background/50 rounded-lg p-3 border border-border/30">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3 text-green-500" />
              Exchange Outflows
            </p>
            <p className="text-lg font-bold text-green-500">{data.summary.exchangeOutflows}</p>
          </div>
        </div>

        {/* Transactions List */}
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
          {data.transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No whale transactions detected recently
            </p>
          ) : (
            data.transactions.map((tx, index) => (
              <div
                key={`${tx.hash}-${index}`}
                className="bg-background/30 rounded-lg p-3 border border-border/30 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(tx.type)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {formatAmount(tx.amount, tx.blockchain)}
                        </span>
                        <Badge variant="outline" className="text-xs uppercase">
                          {tx.blockchain}
                        </Badge>
                      </div>
                      <p className="text-sm text-primary font-semibold">
                        {formatUsd(tx.amountUsd)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getSignificanceBadge(tx.significance)}
                    <a
                      href={getBlockchainExplorer(tx.hash, tx.blockchain)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    {getTypeIcon(tx.type)}
                    {getTypeLabel(tx.type)}
                  </span>
                  <span>•</span>
                  <span>{truncateAddress(tx.from)} → {truncateAddress(tx.to)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Market Insight */}
        {data.summary.exchangeInflows > data.summary.exchangeOutflows && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-destructive">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-medium">Bearish Signal</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              More coins flowing into exchanges than out - potential selling pressure ahead
            </p>
          </div>
        )}
        {data.summary.exchangeOutflows > data.summary.exchangeInflows && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-green-500">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-medium">Bullish Signal</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              More coins leaving exchanges - potential accumulation phase
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
