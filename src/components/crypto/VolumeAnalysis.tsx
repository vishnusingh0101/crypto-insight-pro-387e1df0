import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, TrendingUp, TrendingDown, Activity, Waves, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect } from "react";

interface WhaleAlert {
  type: 'accumulation' | 'distribution' | 'large_movement';
  severity: 'high' | 'medium' | 'low';
  message: string;
  volumeRatio: number;
  priceImpact: number;
}

interface VolumeAnalysisProps {
  coinId: string;
  coinName: string;
}

const VolumeAnalysis = ({ coinId, coinName }: VolumeAnalysisProps) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["whale-activity", coinId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("detect-whale-activity", {
        body: { coinId },
      });
      
      if (error) throw error;
      return data;
    },
    enabled: !!coinId,
    staleTime: 60000, // 1 minute
    refetchInterval: 120000, // 2 minutes
  });

  // Show toast notification for high severity whale alerts
  useEffect(() => {
    if (data?.whaleAlerts?.length > 0) {
      const highAlerts = data.whaleAlerts.filter((a: WhaleAlert) => a.severity === 'high');
      highAlerts.forEach((alert: WhaleAlert) => {
        toast.warning(`🐋 Whale Alert: ${coinName}`, {
          description: alert.message,
          duration: 8000,
        });
      });
    }
  }, [data, coinName]);

  if (isLoading) {
    return (
      <Card className="p-6 glass-morphism">
        <Skeleton className="h-6 w-40 mb-4" />
        <Skeleton className="h-24 w-full mb-4" />
        <Skeleton className="h-16 w-full" />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-6 glass-morphism">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity className="w-5 h-5" />
          <span>Unable to analyze volume data</span>
        </div>
      </Card>
    );
  }

  const { whaleScore, whaleAlerts, metrics, exchangeVolumes } = data;

  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-destructive";
    if (score >= 40) return "text-warning";
    return "text-success";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 70) return "High Activity";
    if (score >= 40) return "Moderate Activity";
    return "Normal";
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return "bg-destructive/20 text-destructive border-destructive/50";
      case 'medium': return "bg-warning/20 text-warning border-warning/50";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'accumulation': return <TrendingUp className="w-4 h-4" />;
      case 'distribution': return <TrendingDown className="w-4 h-4" />;
      default: return <Waves className="w-4 h-4" />;
    }
  };

  return (
    <Card className="p-6 glass-morphism">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Waves className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-lg">Volume Analysis</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Whale Score:</span>
          <span className={`text-2xl font-bold ${getScoreColor(whaleScore)}`}>
            {whaleScore}
          </span>
          <Badge variant="outline" className={getScoreColor(whaleScore)}>
            {getScoreLabel(whaleScore)}
          </Badge>
        </div>
      </div>

      {/* Whale Alerts */}
      {whaleAlerts && whaleAlerts.length > 0 && (
        <div className="mb-6 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span>Whale Alerts Detected</span>
          </div>
          {whaleAlerts.map((alert: WhaleAlert, idx: number) => (
            <div
              key={idx}
              className={`p-3 rounded-lg border ${getSeverityColor(alert.severity)}`}
            >
              <div className="flex items-start gap-3">
                {getTypeIcon(alert.type)}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="capitalize text-xs">
                      {alert.type.replace('_', ' ')}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {alert.severity} severity
                    </Badge>
                  </div>
                  <p className="text-sm">{alert.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Volume Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="p-3 rounded-lg bg-card/50 border border-border/50">
          <p className="text-xs text-muted-foreground mb-1">Vol/MCap Ratio</p>
          <p className={`text-lg font-bold ${metrics?.volumeToMcapRatio > 10 ? 'text-warning' : ''}`}>
            {metrics?.volumeToMcapRatio?.toFixed(1)}%
          </p>
        </div>
        <div className="p-3 rounded-lg bg-card/50 border border-border/50">
          <p className="text-xs text-muted-foreground mb-1">24h Volatility</p>
          <p className={`text-lg font-bold ${metrics?.volatilityPercent > 10 ? 'text-warning' : ''}`}>
            {metrics?.volatilityPercent?.toFixed(1)}%
          </p>
        </div>
        <div className="p-3 rounded-lg bg-card/50 border border-border/50">
          <p className="text-xs text-muted-foreground mb-1">1h Change</p>
          <p className={`text-lg font-bold ${metrics?.priceChange1h >= 0 ? 'text-success' : 'text-destructive'}`}>
            {metrics?.priceChange1h >= 0 ? '+' : ''}{metrics?.priceChange1h?.toFixed(2)}%
          </p>
        </div>
        <div className="p-3 rounded-lg bg-card/50 border border-border/50">
          <p className="text-xs text-muted-foreground mb-1">Vol Concentration</p>
          <p className={`text-lg font-bold ${metrics?.volumeConcentration > 60 ? 'text-warning' : ''}`}>
            {metrics?.volumeConcentration?.toFixed(0)}%
          </p>
        </div>
      </div>

      {/* Exchange Volume Distribution */}
      {exchangeVolumes && exchangeVolumes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3 text-sm font-medium">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <span>Top Exchange Volumes</span>
          </div>
          <div className="space-y-2">
            {exchangeVolumes.slice(0, 5).map((ex: any, idx: number) => {
              const totalVol = exchangeVolumes.reduce((s: number, e: any) => s + e.volume, 0);
              const percent = totalVol > 0 ? (ex.volume / totalVol) * 100 : 0;
              return (
                <div key={idx} className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground w-24 truncate">{ex.exchange}</span>
                  <div className="flex-1 h-2 bg-card rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-primary to-secondary" 
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono w-16 text-right">{percent.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No alerts state */}
      {(!whaleAlerts || whaleAlerts.length === 0) && whaleScore < 40 && (
        <div className="text-center py-4 text-muted-foreground">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No unusual whale activity detected</p>
          <p className="text-xs">Volume patterns appear normal</p>
        </div>
      )}
    </Card>
  );
};

export default VolumeAnalysis;
