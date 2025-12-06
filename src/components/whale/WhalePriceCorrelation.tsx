import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, ZAxis, Legend 
} from "recharts";
import { TrendingUp, TrendingDown, Activity, Zap } from "lucide-react";

interface HistoricalDataPoint {
  timestamp: string;
  totalVolume: number;
  btcPrice: number;
  ethPrice: number;
  netFlow: number;
}

interface WhalePriceCorrelationProps {
  historical?: {
    hourly: HistoricalDataPoint[];
    daily: HistoricalDataPoint[];
  };
  prices?: { btc: number; eth: number };
  isLoading: boolean;
}

export const WhalePriceCorrelation = ({ 
  historical, 
  prices,
  isLoading 
}: WhalePriceCorrelationProps) => {
  if (isLoading) {
    return (
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <Skeleton className="h-6 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const hourlyData = historical?.hourly || [];
  
  // Calculate correlation metrics
  const scatterData = hourlyData.map((d, i) => {
    const prevPrice = i > 0 ? hourlyData[i - 1].btcPrice : d.btcPrice;
    const priceChange = ((d.btcPrice - prevPrice) / prevPrice) * 100;
    
    return {
      volume: d.totalVolume / 1000000, // In millions
      priceChange,
      netFlow: d.netFlow,
      timestamp: d.timestamp,
      btcPrice: d.btcPrice,
    };
  });

  // Calculate correlation coefficient
  const calculateCorrelation = () => {
    if (scatterData.length < 2) return 0;
    
    const n = scatterData.length;
    const sumX = scatterData.reduce((s, d) => s + d.volume, 0);
    const sumY = scatterData.reduce((s, d) => s + d.priceChange, 0);
    const sumXY = scatterData.reduce((s, d) => s + (d.volume * d.priceChange), 0);
    const sumX2 = scatterData.reduce((s, d) => s + (d.volume * d.volume), 0);
    const sumY2 = scatterData.reduce((s, d) => s + (d.priceChange * d.priceChange), 0);
    
    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));
    
    return denominator === 0 ? 0 : numerator / denominator;
  };

  const correlation = calculateCorrelation();
  const correlationStrength = Math.abs(correlation) > 0.5 ? 'strong' : Math.abs(correlation) > 0.3 ? 'moderate' : 'weak';
  const correlationDirection = correlation > 0 ? 'positive' : correlation < 0 ? 'negative' : 'none';

  // Insights based on data
  const highVolumePoints = scatterData.filter(d => d.volume > 5);
  const avgPriceChangeOnHighVolume = highVolumePoints.length > 0 
    ? highVolumePoints.reduce((s, d) => s + d.priceChange, 0) / highVolumePoints.length 
    : 0;

  const formatVolume = (value: number) => `$${value.toFixed(1)}M`;

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5 text-primary" />
          Whale Volume vs Price Movement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scatter Chart */}
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 32%, 17%)" />
            <XAxis 
              dataKey="volume" 
              name="Volume"
              stroke="hsl(215, 20%, 65%)" 
              fontSize={11}
              tickFormatter={formatVolume}
              label={{ value: 'Whale Volume ($M)', position: 'bottom', fontSize: 10, fill: 'hsl(215, 20%, 65%)' }}
            />
            <YAxis 
              dataKey="priceChange" 
              name="Price Change"
              stroke="hsl(215, 20%, 65%)" 
              fontSize={11}
              tickFormatter={(v) => `${v.toFixed(1)}%`}
              label={{ value: 'Price Change (%)', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(215, 20%, 65%)' }}
            />
            <ZAxis dataKey="netFlow" range={[50, 400]} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(222, 47%, 8%)',
                border: '1px solid hsl(217, 32%, 17%)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number, name: string) => {
                if (name === 'Volume') return [formatVolume(value), name];
                if (name === 'Price Change') return [`${value.toFixed(2)}%`, name];
                return [value, name];
              }}
              labelStyle={{ color: 'hsl(210, 40%, 98%)' }}
            />
            <Scatter 
              data={scatterData.filter(d => d.priceChange >= 0)} 
              fill="hsl(142, 76%, 36%)" 
              name="Positive Move"
            />
            <Scatter 
              data={scatterData.filter(d => d.priceChange < 0)} 
              fill="hsl(0, 84%, 60%)" 
              name="Negative Move"
            />
            <Legend />
          </ScatterChart>
        </ResponsiveContainer>

        {/* Correlation Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className={`rounded-lg p-4 border ${
            correlationDirection === 'positive' 
              ? 'border-success/50 bg-success/10' 
              : correlationDirection === 'negative'
              ? 'border-destructive/50 bg-destructive/10'
              : 'border-border/50 bg-muted/10'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {correlationDirection === 'positive' ? (
                <TrendingUp className="h-4 w-4 text-success" />
              ) : correlationDirection === 'negative' ? (
                <TrendingDown className="h-4 w-4 text-destructive" />
              ) : (
                <Activity className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">Correlation Coefficient</span>
            </div>
            <div className="text-2xl font-bold">{correlation.toFixed(3)}</div>
            <Badge 
              variant={correlationDirection === 'positive' ? 'default' : correlationDirection === 'negative' ? 'destructive' : 'secondary'}
              className="mt-1"
            >
              {correlationStrength} {correlationDirection}
            </Badge>
          </div>
          
          <div className="rounded-lg p-4 border border-border/50 bg-card/30">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">High Volume Impact</span>
            </div>
            <div className={`text-2xl font-bold ${avgPriceChangeOnHighVolume >= 0 ? 'text-success' : 'text-destructive'}`}>
              {avgPriceChangeOnHighVolume >= 0 ? '+' : ''}{avgPriceChangeOnHighVolume.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Avg price move during high whale activity
            </p>
          </div>
        </div>

        {/* Insight */}
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
          <p className="text-sm">
            <span className="font-semibold text-primary">Insight:</span>{' '}
            {correlation > 0.3 
              ? 'High whale volumes tend to precede positive price movements. Consider this a bullish indicator.'
              : correlation < -0.3
              ? 'Whale activity often correlates with price drops. Large transactions may signal selling pressure.'
              : 'Whale volume shows mixed correlation with price. Other factors may be driving market movements.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};