import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Legend, ComposedChart, Line, Bar 
} from "recharts";
import { Calendar, TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";

interface HistoricalDataPoint {
  timestamp: string;
  hour: number;
  day: string;
  btcVolume: number;
  ethVolume: number;
  totalVolume: number;
  inflows: number;
  outflows: number;
  netFlow: number;
  btcPrice: number;
  ethPrice: number;
  transactionCount: number;
}

interface PriceCorrelation {
  period: string;
  whaleVolume: number;
  priceChange: number;
  correlation: 'positive' | 'negative' | 'neutral';
  btcPrice: number;
  ethPrice: number;
}

interface WhaleHistoricalAnalyticsProps {
  historical?: {
    hourly: HistoricalDataPoint[];
    daily: HistoricalDataPoint[];
    weekly: HistoricalDataPoint[];
  };
  priceCorrelation?: PriceCorrelation[];
  isLoading: boolean;
}

export const WhaleHistoricalAnalytics = ({ 
  historical, 
  priceCorrelation,
  isLoading 
}: WhaleHistoricalAnalyticsProps) => {
  const [timeframe, setTimeframe] = useState<'hourly' | 'daily' | 'weekly'>('hourly');
  
  if (isLoading) {
    return (
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <Skeleton className="h-6 w-64" />
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-[350px] w-full" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = historical?.[timeframe] || [];
  
  const formatYAxis = (value: number) => {
    if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  const formatXAxis = (timestamp: string) => {
    const date = new Date(timestamp);
    if (timeframe === 'hourly') {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    if (timeframe === 'daily') {
      return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getCorrelationIcon = (correlation: string) => {
    switch (correlation) {
      case 'positive': return <TrendingUp className="h-4 w-4 text-success" />;
      case 'negative': return <TrendingDown className="h-4 w-4 text-destructive" />;
      default: return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getCorrelationColor = (correlation: string) => {
    switch (correlation) {
      case 'positive': return 'border-success/50 bg-success/10';
      case 'negative': return 'border-destructive/50 bg-destructive/10';
      default: return 'border-border/50 bg-muted/10';
    }
  };

  // Calculate trends
  const totalVolume = data.reduce((sum, d) => sum + d.totalVolume, 0);
  const avgNetFlow = data.length > 0 ? data.reduce((sum, d) => sum + d.netFlow, 0) / data.length : 0;
  const avgTransactions = data.length > 0 ? data.reduce((sum, d) => sum + d.transactionCount, 0) / data.length : 0;

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5 text-primary" />
            Historical Whale Analytics
          </CardTitle>
          <div className="flex gap-2">
            {(['hourly', 'daily', 'weekly'] as const).map((tf) => (
              <Button
                key={tf}
                variant={timeframe === tf ? "default" : "outline"}
                size="sm"
                onClick={() => setTimeframe(tf)}
                className="capitalize"
              >
                {tf === 'hourly' ? '24H' : tf === 'daily' ? '7D' : '4W'}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Combined Chart */}
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 32%, 17%)" />
            <XAxis 
              dataKey="timestamp" 
              stroke="hsl(215, 20%, 65%)" 
              fontSize={11}
              tickFormatter={formatXAxis}
              tickLine={false}
            />
            <YAxis 
              yAxisId="left"
              stroke="hsl(215, 20%, 65%)" 
              fontSize={11}
              tickFormatter={formatYAxis}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              stroke="hsl(38, 92%, 50%)" 
              fontSize={11}
              tickFormatter={(v) => `$${(v/1000).toFixed(0)}K`}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(222, 47%, 8%)',
                border: '1px solid hsl(217, 32%, 17%)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number, name: string) => {
                if (name.includes('Price')) return [`$${value.toLocaleString()}`, name];
                return [formatYAxis(value), name];
              }}
              labelFormatter={(label) => new Date(label).toLocaleString()}
              labelStyle={{ color: 'hsl(210, 40%, 98%)' }}
            />
            <Legend />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="totalVolume"
              name="Whale Volume"
              stroke="hsl(var(--primary))"
              fillOpacity={1}
              fill="url(#colorTotal)"
              strokeWidth={2}
            />
            <Bar 
              yAxisId="left"
              dataKey="netFlow" 
              name="Net Flow"
              fill="hsl(142, 76%, 36%)"
              radius={[2, 2, 0, 0]}
              opacity={0.6}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="btcPrice"
              name="BTC Price"
              stroke="hsl(38, 92%, 50%)"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card/30 rounded-lg p-4 border border-border/30">
            <div className="text-xs text-muted-foreground mb-1">Total Volume</div>
            <div className="text-xl font-bold">{formatYAxis(totalVolume)}</div>
            <Badge variant="outline" className="mt-1 text-xs">
              {timeframe === 'hourly' ? 'Last 24h' : timeframe === 'daily' ? 'Last 7d' : 'Last 4w'}
            </Badge>
          </div>
          <div className="bg-card/30 rounded-lg p-4 border border-border/30">
            <div className="text-xs text-muted-foreground mb-1">Avg Net Flow</div>
            <div className={`text-xl font-bold ${avgNetFlow >= 0 ? 'text-success' : 'text-destructive'}`}>
              {avgNetFlow >= 0 ? '+' : ''}{formatYAxis(avgNetFlow)}
            </div>
            <Badge variant={avgNetFlow >= 0 ? 'default' : 'destructive'} className="mt-1 text-xs">
              {avgNetFlow >= 0 ? 'Bullish' : 'Bearish'}
            </Badge>
          </div>
          <div className="bg-card/30 rounded-lg p-4 border border-border/30">
            <div className="text-xs text-muted-foreground mb-1">Avg Transactions</div>
            <div className="text-xl font-bold">{avgTransactions.toFixed(1)}</div>
            <Badge variant="secondary" className="mt-1 text-xs">per period</Badge>
          </div>
        </div>

        {/* Price Correlation Cards */}
        {priceCorrelation && priceCorrelation.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Whale Activity vs Price Correlation
            </h4>
            <div className="grid grid-cols-3 gap-3">
              {priceCorrelation.map((corr) => (
                <div 
                  key={corr.period}
                  className={`rounded-lg p-3 border ${getCorrelationColor(corr.correlation)}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">{corr.period}</span>
                    {getCorrelationIcon(corr.correlation)}
                  </div>
                  <div className="text-lg font-bold">
                    {corr.priceChange >= 0 ? '+' : ''}{corr.priceChange.toFixed(2)}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Vol: {formatYAxis(corr.whaleVolume)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};