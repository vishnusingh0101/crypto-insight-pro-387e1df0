import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp } from "lucide-react";

interface WhaleVolumeChartProps {
  data?: {
    transactions: Array<{
      blockchain: string;
      amountUsd: number;
      timestamp: string;
    }>;
  };
  isLoading: boolean;
}

export const WhaleVolumeChart = ({ data, isLoading }: WhaleVolumeChartProps) => {
  const chartData = useMemo(() => {
    if (!data?.transactions) return [];
    
    // Generate simulated historical data based on current transactions
    const now = new Date();
    const hours = Array.from({ length: 24 }, (_, i) => {
      const date = new Date(now);
      date.setHours(date.getHours() - (23 - i));
      return {
        time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        hour: date.getHours(),
      };
    });

    // Distribute transactions across hours with some randomization
    const baseVolume = (data.transactions.reduce((sum, tx) => sum + tx.amountUsd, 0) / 24);
    
    return hours.map((h, index) => {
      // Add realistic variance
      const variance = 0.3 + Math.random() * 1.4;
      const btcTxs = data.transactions.filter(tx => tx.blockchain === 'bitcoin');
      const ethTxs = data.transactions.filter(tx => tx.blockchain === 'ethereum');
      
      const btcBase = btcTxs.length > 0 
        ? (btcTxs.reduce((sum, tx) => sum + tx.amountUsd, 0) / 24) * variance
        : baseVolume * 0.6 * variance;
      const ethBase = ethTxs.length > 0
        ? (ethTxs.reduce((sum, tx) => sum + tx.amountUsd, 0) / 24) * variance
        : baseVolume * 0.4 * variance;
      
      // Add time-based patterns (more activity during certain hours)
      const hourMultiplier = h.hour >= 8 && h.hour <= 18 ? 1.3 : 0.7;
      
      return {
        time: h.time,
        bitcoin: Math.round(btcBase * hourMultiplier),
        ethereum: Math.round(ethBase * hourMultiplier),
        total: Math.round((btcBase + ethBase) * hourMultiplier),
      };
    });
  }, [data]);

  if (isLoading) {
    return (
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const formatYAxis = (value: number) => {
    if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5 text-primary" />
          24h Whale Volume Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorBtc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorEth" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 32%, 17%)" />
            <XAxis 
              dataKey="time" 
              stroke="hsl(215, 20%, 65%)" 
              fontSize={11}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis 
              stroke="hsl(215, 20%, 65%)" 
              fontSize={11}
              tickFormatter={formatYAxis}
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
              formatter={(value: number) => [formatYAxis(value), '']}
              labelStyle={{ color: 'hsl(210, 40%, 98%)' }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="bitcoin"
              name="Bitcoin"
              stroke="hsl(38, 92%, 50%)"
              fillOpacity={1}
              fill="url(#colorBtc)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="ethereum"
              name="Ethereum"
              stroke="hsl(217, 91%, 60%)"
              fillOpacity={1}
              fill="url(#colorEth)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
