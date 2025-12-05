import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import { ArrowLeftRight } from "lucide-react";

interface WhaleFlowChartProps {
  data?: {
    transactions: Array<{
      type: string;
      amountUsd: number;
      timestamp: string;
    }>;
    summary: {
      exchangeInflows: number;
      exchangeOutflows: number;
    };
  };
  isLoading: boolean;
}

export const WhaleFlowChart = ({ data, isLoading }: WhaleFlowChartProps) => {
  const chartData = useMemo(() => {
    if (!data?.transactions) return [];
    
    // Generate 12-hour flow data
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const date = new Date(now);
      date.setHours(date.getHours() - (11 - i));
      
      // Simulate realistic flow patterns
      const baseInflow = (data.summary.exchangeInflows / 12) * (0.5 + Math.random());
      const baseOutflow = (data.summary.exchangeOutflows / 12) * (0.5 + Math.random());
      
      // Add time-based variance
      const hourMultiplier = date.getHours() >= 9 && date.getHours() <= 17 ? 1.4 : 0.6;
      
      return {
        time: date.toLocaleTimeString('en-US', { hour: '2-digit' }),
        inflow: -Math.round(baseInflow * hourMultiplier * 1000000), // Negative for visual effect
        outflow: Math.round(baseOutflow * hourMultiplier * 1000000),
        netFlow: Math.round((baseOutflow - baseInflow) * hourMultiplier * 1000000),
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
    const absValue = Math.abs(value);
    if (absValue >= 1000000) return `${value >= 0 ? '+' : '-'}$${(absValue / 1000000).toFixed(1)}M`;
    if (absValue >= 1000) return `${value >= 0 ? '+' : '-'}$${(absValue / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ArrowLeftRight className="h-5 w-5 text-primary" />
          Exchange Flow Analysis (12h)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 32%, 17%)" />
            <XAxis 
              dataKey="time" 
              stroke="hsl(215, 20%, 65%)" 
              fontSize={11}
              tickLine={false}
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
              formatter={(value: number, name: string) => [
                formatYAxis(Math.abs(value)), 
                name === 'inflow' ? 'Exchange Inflow' : name === 'outflow' ? 'Exchange Outflow' : 'Net Flow'
              ]}
              labelStyle={{ color: 'hsl(210, 40%, 98%)' }}
            />
            <Legend />
            <ReferenceLine y={0} stroke="hsl(215, 20%, 65%)" strokeDasharray="3 3" />
            <Bar 
              dataKey="inflow" 
              name="Inflow (Bearish)"
              fill="hsl(0, 84%, 60%)" 
              radius={[4, 4, 0, 0]}
              opacity={0.8}
            />
            <Bar 
              dataKey="outflow" 
              name="Outflow (Bullish)"
              fill="hsl(142, 76%, 36%)" 
              radius={[4, 4, 0, 0]}
              opacity={0.8}
            />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 flex items-center justify-center gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-destructive" />
            <span>Inflow = Potential Sell Pressure</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-success" />
            <span>Outflow = Accumulation</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
