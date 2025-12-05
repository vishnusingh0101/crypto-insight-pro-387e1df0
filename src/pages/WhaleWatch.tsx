import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  ArrowLeft, 
  Wallet, 
  Activity, 
  TrendingUp, 
  TrendingDown,
  Filter,
  RefreshCw,
  Zap
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { WhaleVolumeChart } from "@/components/whale/WhaleVolumeChart";
import { WhaleFlowChart } from "@/components/whale/WhaleFlowChart";
import { WhaleHeatmap } from "@/components/whale/WhaleHeatmap";
import { WhaleTransactionTable } from "@/components/whale/WhaleTransactionTable";
import { WhaleAlertsFeed } from "@/components/whale/WhaleAlertsFeed";
import { WhaleStats } from "@/components/whale/WhaleStats";

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

const WhaleWatch = () => {
  const [selectedBlockchain, setSelectedBlockchain] = useState<'all' | 'bitcoin' | 'ethereum'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data, isLoading, error, refetch, isFetching } = useQuery<WhaleTrackerData>({
    queryKey: ['whale-watch', selectedBlockchain],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('track-whale-transactions', {
        body: { blockchain: selectedBlockchain },
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: autoRefresh ? 30000 : false,
    staleTime: 15000,
  });

  const netFlow = data ? data.summary.exchangeOutflows - data.summary.exchangeInflows : 0;
  const flowSentiment = netFlow > 0 ? 'bullish' : netFlow < 0 ? 'bearish' : 'neutral';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-xl bg-card/30 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Wallet className="w-8 h-8 text-primary animate-pulse-glow" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gradient">Whale Watch</h1>
                  <p className="text-xs text-muted-foreground">Real-time On-chain Intelligence</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={autoRefresh ? "border-success text-success" : ""}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                {autoRefresh ? 'Auto' : 'Manual'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
              <div className="glass-morphism px-3 py-1.5 rounded-lg flex items-center gap-2">
                <span className="animate-pulse h-2 w-2 rounded-full bg-success" />
                <span className="text-xs font-mono">Live</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Blockchain Filter */}
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <div className="flex gap-2">
            {(['all', 'bitcoin', 'ethereum'] as const).map((chain) => (
              <Button
                key={chain}
                variant={selectedBlockchain === chain ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedBlockchain(chain)}
                className="capitalize"
              >
                {chain === 'all' ? 'All Chains' : chain}
              </Button>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <WhaleStats data={data} isLoading={isLoading} />

        {/* Market Sentiment Banner */}
        {data && (
          <Card className={`border-2 ${
            flowSentiment === 'bullish' 
              ? 'border-success/50 bg-success/5' 
              : flowSentiment === 'bearish' 
              ? 'border-destructive/50 bg-destructive/5'
              : 'border-border/50 bg-card/50'
          }`}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {flowSentiment === 'bullish' ? (
                    <TrendingUp className="h-6 w-6 text-success" />
                  ) : flowSentiment === 'bearish' ? (
                    <TrendingDown className="h-6 w-6 text-destructive" />
                  ) : (
                    <Activity className="h-6 w-6 text-muted-foreground" />
                  )}
                  <div>
                    <h3 className={`font-semibold ${
                      flowSentiment === 'bullish' ? 'text-success' 
                      : flowSentiment === 'bearish' ? 'text-destructive'
                      : 'text-foreground'
                    }`}>
                      {flowSentiment === 'bullish' ? 'Bullish Whale Behavior' 
                        : flowSentiment === 'bearish' ? 'Bearish Whale Behavior'
                        : 'Neutral Market Flow'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {flowSentiment === 'bullish' 
                        ? 'More coins leaving exchanges - accumulation detected'
                        : flowSentiment === 'bearish'
                        ? 'More coins entering exchanges - potential selling pressure'
                        : 'Balanced exchange flows observed'}
                    </p>
                  </div>
                </div>
                <Badge 
                  variant={flowSentiment === 'bullish' ? 'default' : flowSentiment === 'bearish' ? 'destructive' : 'secondary'}
                  className="text-sm px-3 py-1"
                >
                  Net Flow: {netFlow > 0 ? '+' : ''}{netFlow}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Charts Section - Takes 2 columns */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="volume" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-card/50">
                <TabsTrigger value="volume">Volume Trends</TabsTrigger>
                <TabsTrigger value="flow">Exchange Flow</TabsTrigger>
                <TabsTrigger value="heatmap">Activity Map</TabsTrigger>
              </TabsList>
              <TabsContent value="volume" className="mt-4">
                <WhaleVolumeChart data={data} isLoading={isLoading} />
              </TabsContent>
              <TabsContent value="flow" className="mt-4">
                <WhaleFlowChart data={data} isLoading={isLoading} />
              </TabsContent>
              <TabsContent value="heatmap" className="mt-4">
                <WhaleHeatmap data={data} isLoading={isLoading} />
              </TabsContent>
            </Tabs>

            {/* Transaction Table */}
            <WhaleTransactionTable 
              transactions={data?.transactions || []} 
              isLoading={isLoading} 
            />
          </div>

          {/* Alerts Feed - Takes 1 column */}
          <div className="lg:col-span-1">
            <WhaleAlertsFeed 
              transactions={data?.transactions || []} 
              isLoading={isLoading}
              prices={data?.prices}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-12 py-6">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          <p className="flex items-center justify-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Real-time data from Blockchain.com, Blockchair & Etherscan
          </p>
          <p className="mt-1 text-xs">Data refreshes every 30 seconds • Historical data is simulated for demonstration</p>
        </div>
      </footer>
    </div>
  );
};

export default WhaleWatch;
