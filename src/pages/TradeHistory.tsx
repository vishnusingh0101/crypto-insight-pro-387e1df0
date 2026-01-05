import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Target, 
  Ban,
  CheckCircle2,
  XCircle,
  BarChart3,
  Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, formatDistanceToNow } from "date-fns";

type TradeHistoryItem = {
  id: string;
  coin_id: string;
  coin_name: string;
  coin_symbol: string;
  action: "BUY" | "SELL";
  entry_price: number;
  target_price: number;
  stop_loss: number;
  exit_price: number | null;
  profit_loss_percent: number | null;
  confidence_score: number | null;
  whale_intent: string | null;
  reasoning: string | null;
  result: "SUCCESS" | "FAILED" | "NOT_EXECUTED" | "PENDING" | null;
  created_at: string;
  closed_at: string | null;
};

const TradeHistory = () => {
  const navigate = useNavigate();

  const { data: trades, isLoading, error } = useQuery({
    queryKey: ['tradeHistory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trade_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data as TradeHistoryItem[];
    },
    refetchInterval: 60000, // Refresh every minute
  });

  const { data: stats } = useQuery({
    queryKey: ['tradeStats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_performance')
        .select('*')
        .order('last_updated_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error) return null;
      return data;
    },
  });

  const calculateRMultiple = (trade: TradeHistoryItem): string => {
    if (!trade.profit_loss_percent || !trade.exit_price) return "N/A";
    const riskPercent = Math.abs((trade.entry_price - trade.stop_loss) / trade.entry_price * 100);
    if (riskPercent === 0) return "N/A";
    const rMultiple = trade.profit_loss_percent / riskPercent;
    return `${rMultiple >= 0 ? '+' : ''}${rMultiple.toFixed(1)}R`;
  };

  const getTradeDuration = (trade: TradeHistoryItem): string => {
    if (!trade.closed_at) return "Active";
    const start = new Date(trade.created_at);
    const end = new Date(trade.closed_at);
    const hours = (end.getTime() - start.getTime()) / 3600000;
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${Math.round(hours)}h`;
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  };

  const getResultBadge = (result: string | null) => {
    switch (result) {
      case 'SUCCESS':
        return (
          <Badge variant="default" className="bg-green-500/20 text-green-600 dark:text-green-400 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Success
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Failed
          </Badge>
        );
      case 'NOT_EXECUTED':
        return (
          <Badge variant="secondary" className="gap-1">
            <Ban className="h-3 w-3" />
            Not Executed
          </Badge>
        );
      case 'PENDING':
        return (
          <Badge variant="outline" className="gap-1 text-blue-500">
            <Clock className="h-3 w-3" />
            Active
          </Badge>
        );
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">Failed to load trade history</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const successfulTrades = trades?.filter(t => t.result === 'SUCCESS') || [];
  const failedTrades = trades?.filter(t => t.result === 'FAILED') || [];
  const totalPnL = trades?.reduce((acc, t) => acc + (t.profit_loss_percent || 0), 0) || 0;
  const avgWin = successfulTrades.length > 0 
    ? successfulTrades.reduce((acc, t) => acc + (t.profit_loss_percent || 0), 0) / successfulTrades.length 
    : 0;
  const avgLoss = failedTrades.length > 0 
    ? failedTrades.reduce((acc, t) => acc + (t.profit_loss_percent || 0), 0) / failedTrades.length 
    : 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Trade History</h1>
              <p className="text-sm text-muted-foreground">
                All trades from the swing trading system
              </p>
            </div>
          </div>
          <Badge variant={stats?.mode === 'live' ? 'default' : 'secondary'} className="text-sm">
            {stats?.mode?.toUpperCase() || 'PAPER'} MODE
          </Badge>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold">{trades?.length || 0}</div>
              <div className="text-xs text-muted-foreground">Total Trades</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {successfulTrades.length}
              </div>
              <div className="text-xs text-muted-foreground">Won</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {failedTrades.length}
              </div>
              <div className="text-xs text-muted-foreground">Lost</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className={`text-2xl font-bold ${
                stats?.accuracy_percent >= 60 ? 'text-green-600 dark:text-green-400' : 
                stats?.accuracy_percent >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {stats?.accuracy_percent?.toFixed(1) || 0}%
              </div>
              <div className="text-xs text-muted-foreground">Win Rate</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Total P&L</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                +{avgWin.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Avg Win</div>
            </CardContent>
          </Card>
        </div>

        {/* Trade Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Trade Log
            </CardTitle>
            <CardDescription>
              Detailed history of all swing trades
            </CardDescription>
          </CardHeader>
          <CardContent>
            {trades && trades.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Coin</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">Exit</TableHead>
                      <TableHead className="text-right">P&L</TableHead>
                      <TableHead className="text-right">R-Multiple</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trades.map((trade) => (
                      <TableRow key={trade.id}>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {format(new Date(trade.created_at), 'MMM d, HH:mm')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(trade.created_at), { addSuffix: true })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{trade.coin_symbol?.toUpperCase()}</div>
                          <div className="text-xs text-muted-foreground">{trade.coin_name}</div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={trade.action === 'BUY' ? 'default' : 'secondary'}
                            className={trade.action === 'BUY' 
                              ? 'bg-green-500/20 text-green-600 dark:text-green-400' 
                              : 'bg-red-500/20 text-red-600 dark:text-red-400'
                            }
                          >
                            {trade.action === 'BUY' ? (
                              <><TrendingUp className="h-3 w-3 mr-1" /> Long</>
                            ) : (
                              <><TrendingDown className="h-3 w-3 mr-1" /> Short</>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${Number(trade.entry_price).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {trade.exit_price ? `$${Number(trade.exit_price).toFixed(2)}` : '-'}
                        </TableCell>
                        <TableCell className={`text-right font-mono font-medium ${
                          (trade.profit_loss_percent || 0) >= 0 
                            ? 'text-green-600 dark:text-green-400' 
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {trade.profit_loss_percent != null 
                            ? `${trade.profit_loss_percent >= 0 ? '+' : ''}${trade.profit_loss_percent.toFixed(2)}%`
                            : '-'
                          }
                        </TableCell>
                        <TableCell className={`text-right font-mono font-medium ${
                          (trade.profit_loss_percent || 0) >= 0 
                            ? 'text-green-600 dark:text-green-400' 
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {calculateRMultiple(trade)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {getTradeDuration(trade)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getResultBadge(trade.result)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No trades yet</p>
                <p className="text-sm">The swing trading system will record trades here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TradeHistory;
