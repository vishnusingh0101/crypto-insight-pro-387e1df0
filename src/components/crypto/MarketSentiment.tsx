import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, TrendingUp, AlertTriangle, Smile } from "lucide-react";

const MarketSentiment = () => {
  const { data: sentiment, isLoading } = useQuery({
    queryKey: ["market-sentiment"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("market-sentiment");
      
      if (error) throw error;
      
      return data;
    },
    refetchInterval: 120000, // Refetch every 2 minutes
  });

  if (isLoading) {
    return (
      <Card className="p-8 glass-morphism">
        <Skeleton className="h-32 w-full" />
      </Card>
    );
  }

  const score = sentiment?.score || 50;
  const status = sentiment?.status || "neutral";
  
  const getStatusColor = () => {
    if (status === "extreme-fear") return "text-destructive";
    if (status === "fear") return "text-orange-400";
    if (status === "neutral") return "text-accent";
    if (status === "greed") return "text-success";
    if (status === "extreme-greed") return "text-green-400";
    return "text-accent";
  };

  const getStatusIcon = () => {
    if (status === "extreme-fear" || status === "fear") return AlertTriangle;
    if (status === "greed" || status === "extreme-greed") return TrendingUp;
    return Smile;
  };

  const StatusIcon = getStatusIcon();

  return (
    <Card className="p-8 glass-morphism relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div 
          className="h-full transition-all duration-1000"
          style={{
            width: `${score}%`,
            background: `linear-gradient(90deg, 
              ${status === "extreme-fear" || status === "fear" ? "hsl(0 84% 60%)" : "hsl(142 76% 36%)"} 0%, 
              ${status === "extreme-fear" || status === "fear" ? "hsl(280 100% 70%)" : "hsl(177 100% 50%)"} 100%)`
          }}
        />
      </div>
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Brain className="w-6 h-6 text-secondary" />
            <h3 className="text-xl font-bold">AI Market Sentiment</h3>
          </div>
          <div className={`flex items-center gap-2 ${getStatusColor()}`}>
            <StatusIcon className="w-5 h-5" />
            <span className="text-sm font-bold uppercase">{status.replace("-", " ")}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Fear</span>
            <span className="text-4xl font-bold font-mono">{score}</span>
            <span className="text-sm text-muted-foreground">Greed</span>
          </div>
          
          <div className="relative h-3 bg-card rounded-full overflow-hidden">
            <div 
              className="absolute top-0 left-0 h-full transition-all duration-1000 rounded-full"
              style={{
                width: `${score}%`,
                background: `linear-gradient(90deg, 
                  hsl(0 84% 60%) 0%, 
                  hsl(280 100% 70%) 25%,
                  hsl(177 100% 50%) 50%,
                  hsl(142 76% 36%) 75%,
                  hsl(142 76% 46%) 100%)`
              }}
            />
          </div>

          <p className="text-sm text-muted-foreground mt-4">
            {sentiment?.description || "Analyzing market conditions based on price action, volume, and social sentiment..."}
          </p>
        </div>
      </div>
    </Card>
  );
};

export default MarketSentiment;
