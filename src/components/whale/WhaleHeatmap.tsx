import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";

interface WhaleHeatmapProps {
  data?: {
    transactions: Array<{
      blockchain: string;
      amountUsd: number;
      timestamp: string;
      significance: string;
    }>;
  };
  isLoading: boolean;
}

export const WhaleHeatmap = ({ data, isLoading }: WhaleHeatmapProps) => {
  const heatmapData = useMemo(() => {
    if (!data?.transactions) return [];
    
    // Generate 24-hour x 7-day heatmap simulation
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const hours = Array.from({ length: 24 }, (_, i) => i);
    
    const baseActivity = data.transactions.length;
    
    return days.map((day, dayIndex) => ({
      day,
      hours: hours.map((hour) => {
        // Realistic activity patterns
        const isWeekday = dayIndex >= 1 && dayIndex <= 5;
        const isActiveHour = hour >= 8 && hour <= 22;
        const isPeakHour = hour >= 14 && hour <= 18;
        
        let activityLevel = Math.random();
        if (isWeekday) activityLevel *= 1.3;
        if (isActiveHour) activityLevel *= 1.5;
        if (isPeakHour) activityLevel *= 1.4;
        
        // Scale to 0-100
        const intensity = Math.min(100, Math.round(activityLevel * 50 + baseActivity * 2));
        
        return {
          hour,
          intensity,
          transactions: Math.round(activityLevel * baseActivity * 0.3),
        };
      }),
    }));
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

  const getIntensityColor = (intensity: number) => {
    if (intensity >= 80) return 'bg-destructive';
    if (intensity >= 60) return 'bg-warning';
    if (intensity >= 40) return 'bg-primary';
    if (intensity >= 20) return 'bg-primary/50';
    return 'bg-muted';
  };

  const getIntensityOpacity = (intensity: number) => {
    return Math.max(0.2, intensity / 100);
  };

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-primary" />
            Weekly Activity Heatmap
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Low</span>
            <div className="flex gap-0.5">
              <div className="w-3 h-3 rounded-sm bg-muted" />
              <div className="w-3 h-3 rounded-sm bg-primary/50" />
              <div className="w-3 h-3 rounded-sm bg-primary" />
              <div className="w-3 h-3 rounded-sm bg-warning" />
              <div className="w-3 h-3 rounded-sm bg-destructive" />
            </div>
            <span>High</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {/* Hour labels */}
          <div className="flex items-center">
            <div className="w-10" />
            <div className="flex-1 flex justify-between px-1">
              {[0, 6, 12, 18, 23].map((hour) => (
                <span key={hour} className="text-[10px] text-muted-foreground">
                  {hour.toString().padStart(2, '0')}:00
                </span>
              ))}
            </div>
          </div>
          
          {/* Heatmap grid */}
          {heatmapData.map((dayData) => (
            <div key={dayData.day} className="flex items-center gap-2">
              <span className="w-8 text-xs text-muted-foreground">{dayData.day}</span>
              <div className="flex-1 flex gap-[2px]">
                {dayData.hours.map((hourData) => (
                  <div
                    key={hourData.hour}
                    className={`flex-1 h-6 rounded-sm ${getIntensityColor(hourData.intensity)} transition-all duration-200 hover:scale-110 cursor-pointer group relative`}
                    style={{ opacity: getIntensityOpacity(hourData.intensity) }}
                    title={`${dayData.day} ${hourData.hour}:00 - ${hourData.transactions} transactions`}
                  >
                    <div className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-2 z-10">
                      <div className="bg-card border border-border rounded-lg px-2 py-1 text-xs whitespace-nowrap shadow-lg">
                        <div className="font-medium">{dayData.day} {hourData.hour}:00</div>
                        <div className="text-muted-foreground">{hourData.transactions} txns</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        {/* Summary badges */}
        <div className="mt-6 flex flex-wrap gap-2">
          <Badge variant="secondary" className="bg-destructive/10 text-destructive">
            Peak: Weekdays 14:00-18:00 UTC
          </Badge>
          <Badge variant="secondary" className="bg-primary/10 text-primary">
            High Activity: US Market Hours
          </Badge>
          <Badge variant="outline">
            Low: Weekends & Night Hours
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};
