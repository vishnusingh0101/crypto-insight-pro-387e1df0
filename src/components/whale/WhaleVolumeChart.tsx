import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp } from "lucide-react";

interface HistoricalDataPoint {
  timestamp: string;
  btcVolume: number;
  ethVolume: number;
  totalVolume: number;
}

interface WhaleVolumeChartProps {
  historical?: {
    hourly: HistoricalDataPoint[];
  };
  isLoading: boolean;
}

export const WhaleVolumeChart = ({ historical, isLoading }: WhaleVolumeChartProps) => {
  const chartData = useMemo(() => {
    if (!historical?.hourly?.length) return [];
    
    return historical.hourly.map((d) => ({
      time: new Date(d.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      bitcoin: d.btcVolume,
      ethereum: d.ethVolume,
      total: d.totalVolume,
    }));
  }, [historical]);

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