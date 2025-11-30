import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, AlertCircle, Target, ShieldAlert, DollarSign } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface TradeRecommendationProps {
  selectedCrypto: string | null;
}

const TradeRecommendation = ({ selectedCrypto }: TradeRecommendationProps) => {
  const { data: recommendation, isLoading } = useQuery({
    queryKey: ['tradeRecommendation', selectedCrypto],
    queryFn: async () => {
      if (!selectedCrypto) return null;
      
      const { data, error } = await supabase.functions.invoke('generate-trade-recommendation', {
        body: { cryptoId: selectedCrypto }
      });

      if (error) throw error;
      return data;
    },
    enabled: !!selectedCrypto,
    refetchInterval: 120000, // Refetch every 2 minutes
  });

  if (!selectedCrypto) {
    return (
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Trade Recommendation
          </CardTitle>
          <CardDescription>
            Select a cryptocurrency to see comprehensive trade analysis
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="border-2">
        <CardHeader>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-full" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!recommendation) return null;

  const getActionColor = (action: string) => {
    switch (action) {
      case 'BUY': return 'text-green-600 dark:text-green-400';
      case 'SELL': return 'text-red-600 dark:text-red-400';
      default: return 'text-yellow-600 dark:text-yellow-400';
    }
  };

  const getActionBg = (action: string) => {
    switch (action) {
      case 'BUY': return 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800';
      case 'SELL': return 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800';
      default: return 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800';
    }
  };

  const getSuccessColor = (prob: number) => {
    if (prob >= 70) return 'text-green-600 dark:text-green-400';
    if (prob >= 50) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <Card className={`border-2 ${getActionBg(recommendation.action)}`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Complete Trade Analysis
          </div>
          <Badge variant="outline" className={`text-lg font-bold ${getActionColor(recommendation.action)}`}>
            {recommendation.action}
          </Badge>
        </CardTitle>
        <CardDescription>
          Based on Technical, Fundamental & News Analysis
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Success Probability */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Success Probability</span>
            <span className={`text-2xl font-bold ${getSuccessColor(recommendation.successProbability)}`}>
              {recommendation.successProbability}%
            </span>
          </div>
          <Progress value={recommendation.successProbability} className="h-3" />
        </div>

        {/* Trade Targets */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <DollarSign className="h-3 w-3" />
              Current
            </div>
            <div className="font-bold text-lg">${recommendation.currentPrice.toLocaleString()}</div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <TrendingUp className="h-3 w-3" />
              {recommendation.action === 'BUY' ? 'Entry' : 'Exit'}
            </div>
            <div className="font-bold text-lg text-blue-600 dark:text-blue-400">
              ${recommendation.buyPrice.toLocaleString()}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Target className="h-3 w-3" />
              Target
            </div>
            <div className="font-bold text-lg text-green-600 dark:text-green-400">
              ${recommendation.targetPrice.toLocaleString()}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <ShieldAlert className="h-3 w-3" />
              Stop Loss
            </div>
            <div className="font-bold text-lg text-red-600 dark:text-red-400">
              ${recommendation.stopLoss.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Risk/Reward */}
        <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg">
          <span className="text-sm font-medium">Risk/Reward Ratio</span>
          <span className="text-xl font-bold">{recommendation.riskReward}:1</span>
        </div>

        {/* Analysis Breakdown */}
        <div className="space-y-3">
          <h4 className="font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Analysis Breakdown
          </h4>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm">Technical Analysis</span>
              <Badge variant="secondary">{recommendation.analysis.technical.score}%</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{recommendation.analysis.technical.summary}</p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm">Fundamental Analysis</span>
              <Badge variant="secondary">{recommendation.analysis.fundamental.score}%</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{recommendation.analysis.fundamental.summary}</p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm">News Sentiment</span>
              <Badge variant="secondary">{recommendation.analysis.news.score}%</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{recommendation.analysis.news.summary}</p>
          </div>
        </div>

        {/* Reasoning */}
        <div className="p-4 bg-background/50 rounded-lg space-y-2">
          <h4 className="font-semibold text-sm">Trade Rationale</h4>
          <p className="text-sm text-muted-foreground">{recommendation.reasoning}</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default TradeRecommendation;
