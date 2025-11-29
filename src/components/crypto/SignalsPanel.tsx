import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface SignalsPanelProps {
  selectedCrypto: string | null;
}

const SignalsPanel = ({ selectedCrypto }: SignalsPanelProps) => {
  const { data: signals, isLoading } = useQuery({
    queryKey: ["trading-signals", selectedCrypto],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-signals", {
        body: { cryptoId: selectedCrypto },
      });
      
      if (error) {
        toast.error("Failed to generate signals");
        throw error;
      }
      
      return data as any[];
    },
    enabled: !!selectedCrypto,
    refetchInterval: 60000, // Refetch every minute
  });

  if (!selectedCrypto) {
    return (
      <Card className="p-8 glass-morphism text-center">
        <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">
          Select a cryptocurrency to view AI-generated trading signals
        </p>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="p-6 glass-morphism space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </Card>
    );
  }

  return (
    <Card className="p-6 glass-morphism space-y-4">
      {signals?.map((signal: any, index: number) => {
        const isBullish = signal.signal === "BUY";
        
        return (
          <div
            key={index}
            className={`p-4 rounded-lg border-2 transition-all ${
              isBullish
                ? "border-success/50 bg-success/5 hover:border-success"
                : "border-destructive/50 bg-destructive/5 hover:border-destructive"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                {isBullish ? (
                  <TrendingUp className="w-5 h-5 text-success" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-destructive" />
                )}
                <span className="font-bold text-lg">{signal.signal}</span>
              </div>
              <Badge
                variant="outline"
                className={
                  signal.confidence >= 0.7
                    ? "border-success text-success"
                    : signal.confidence >= 0.5
                    ? "border-secondary text-secondary"
                    : "border-muted-foreground text-muted-foreground"
                }
              >
                {(signal.confidence * 100).toFixed(0)}% confidence
              </Badge>
            </div>
            
            <p className="text-sm text-muted-foreground mb-3">
              {signal.reasoning}
            </p>
            
            <div className="grid grid-cols-3 gap-3 text-xs font-mono">
              <div className="space-y-1">
                <span className="text-muted-foreground">Entry</span>
                <p className="font-bold text-primary">${signal.entry_price}</p>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground">Target</span>
                <p className="font-bold text-success">${signal.target_price}</p>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground">Stop Loss</span>
                <p className="font-bold text-destructive">${signal.stop_loss}</p>
              </div>
            </div>
            
            <div className="mt-3 pt-3 border-t border-border/50">
              <p className="text-xs text-muted-foreground">
                Risk/Reward Ratio: <span className="text-foreground font-bold">{signal.risk_reward}</span>
              </p>
            </div>
          </div>
        );
      })}
    </Card>
  );
};

export default SignalsPanel;
