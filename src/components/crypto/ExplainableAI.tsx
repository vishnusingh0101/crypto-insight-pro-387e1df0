import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Brain } from "lucide-react";
import { toast } from "sonner";

interface ExplainableAIProps {
  selectedCrypto: string | null;
}

const ExplainableAI = ({ selectedCrypto }: ExplainableAIProps) => {
  const { data: explanation, isLoading } = useQuery({
    queryKey: ["ai-explanation", selectedCrypto],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("explain-signal", {
        body: { cryptoId: selectedCrypto },
      });
      
      if (error) {
        toast.error("Failed to generate explanation");
        throw error;
      }
      
      return data;
    },
    enabled: !!selectedCrypto,
    refetchInterval: 60000,
  });

  if (!selectedCrypto) {
    return (
      <Card className="p-8 glass-morphism text-center">
        <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">
          Select a cryptocurrency to view AI reasoning
        </p>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="p-6 glass-morphism space-y-4">
        <Skeleton className="h-6 w-48 mb-4" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </Card>
    );
  }

  return (
    <Card className="p-6 glass-morphism">
      <div className="flex items-center gap-2 mb-6">
        <Brain className="w-5 h-5 text-secondary" />
        <h3 className="font-bold text-lg">Feature Importance Analysis</h3>
      </div>
      
      <p className="text-sm text-muted-foreground mb-6">
        Understanding why the AI made this prediction. Higher values indicate stronger influence on the decision.
      </p>
      
      <div className="space-y-4">
        {explanation?.features?.map((feature: any, index: number) => {
          const isPositive = feature.impact > 0;
          const absImpact = Math.abs(feature.impact);
          
          return (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{feature.name}</span>
                <span
                  className={`text-sm font-bold ${
                    isPositive ? "text-success" : "text-destructive"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {(feature.impact * 100).toFixed(1)}%
                </span>
              </div>
              
              <div className="relative">
                <Progress
                  value={absImpact * 100}
                  className={`h-2 ${
                    isPositive ? "bg-success/20" : "bg-destructive/20"
                  }`}
                />
                <div
                  className="absolute top-0 h-2 rounded-full transition-all"
                  style={{
                    width: `${absImpact * 100}%`,
                    background: isPositive
                      ? "linear-gradient(90deg, hsl(142 76% 36%), hsl(177 100% 50%))"
                      : "linear-gradient(90deg, hsl(0 84% 60%), hsl(280 100% 70%))",
                  }}
                />
              </div>
              
              <p className="text-xs text-muted-foreground">{feature.description}</p>
            </div>
          );
        })}
      </div>
      
      <div className="mt-6 pt-6 border-t border-border/50">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            <span className="font-bold text-foreground">Model Explanation:</span>{" "}
            {explanation?.summary}
          </p>
        </div>
      </div>
    </Card>
  );
};

export default ExplainableAI;
