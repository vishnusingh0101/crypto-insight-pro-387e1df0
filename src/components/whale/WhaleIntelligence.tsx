import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Target,
  XCircle,
  Eye,
  Zap,
  Activity,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

interface WhaleTransaction {
  hash: string;
  blockchain: string;
  amount: number;
  amountUsd: number;
  from: string;
  to: string;
  timestamp: string;
  type: 'transfer' | 'exchange_inflow' | 'exchange_outflow' | 'unknown';
  significance: 'high' | 'medium' | 'low';
}

interface WhaleIntelligenceData {
  marketBias: {
    shortTerm: 'bullish' | 'bearish' | 'neutral';
    intraday: 'bullish' | 'bearish' | 'neutral';
    swing: 'bullish' | 'bearish' | 'neutral';
  };
  whaleIntent: {
    classification: 'accumulating' | 'distributing' | 'neutral';
    strength: 'strong' | 'moderate' | 'weak';
    description: string;
  };
  actionGuidance: {
    recommendation: 'trade' | 'wait' | 'avoid';
    reason: string;
    details: string;
  };
  riskWarnings: {
    level: 'low' | 'medium' | 'high';
    warnings: string[];
  };
  confidenceScore: number;
  confidenceFactors: string[];
  shouldAlert: boolean;
  alertMessage: string | null;
  metrics: {
    totalVolume: number;
    transactionCount: number;
    inflowCount: number;
    outflowCount: number;
    netFlow: number;
    largestTx: number;
    avgTxSize: number;
  };
  marketContext: {
    btcPrice: number;
    ethPrice: number;
    btcChange24h: number;
    ethChange24h: number;
    volatilityState: 'low' | 'medium' | 'high';
    trendDirection: 'bullish' | 'bearish' | 'sideways';
  };
  timestamp: string;
}

interface WhaleIntelligenceProps {
  transactions: WhaleTransaction[];
  summary: {
    exchangeInflows: number;
    exchangeOutflows: number;
  };
  isLoading: boolean;
}

const formatUsd = (amount: number) => {
  if (amount >= 1000000000) return `$${(amount / 1000000000).toFixed(2)}B`;
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
};

const BiasIndicator = ({ bias, label }: { bias: 'bullish' | 'bearish' | 'neutral'; label: string }) => {
  const getIcon = () => {
    if (bias === 'bullish') return <TrendingUp className="h-4 w-4" />;
    if (bias === 'bearish') return <TrendingDown className="h-4 w-4" />;
    return <Minus className="h-4 w-4" />;
  };
  
  const getColor = () => {
    if (bias === 'bullish') return 'text-success bg-success/10 border-success/30';
    if (bias === 'bearish') return 'text-destructive bg-destructive/10 border-destructive/30';
    return 'text-muted-foreground bg-muted/50 border-border';
  };
  
  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg border ${getColor()}`}>
      <div className="flex items-center gap-1.5">
        {getIcon()}
        <span className="text-xs font-medium uppercase">{bias}</span>
      </div>
      <span className="text-xs text-muted-foreground ml-auto">{label}</span>
    </div>
  );
};

export const WhaleIntelligence = ({ transactions, summary, isLoading: parentLoading }: WhaleIntelligenceProps) => {
  const previousAlertRef = useRef<string | null>(null);
  
  const { data: intelligence, isLoading } = useQuery<WhaleIntelligenceData>({
    queryKey: ['whale-intelligence', transactions.length, summary?.exchangeInflows, summary?.exchangeOutflows],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('analyze-whale-intelligence', {
        body: { transactions, summary },
      });
      if (error) throw error;
      return data;
    },
    enabled: transactions.length > 0 && !parentLoading,
    staleTime: 30000,
    refetchInterval: 60000,
  });
  
  // Alert notification effect
  useEffect(() => {
    if (!intelligence?.shouldAlert || !intelligence?.alertMessage) return;
    
    if (previousAlertRef.current !== intelligence.alertMessage) {
      toast.info(intelligence.alertMessage, {
        duration: 10000,
        icon: <Brain className="h-5 w-5 text-primary" />,
      });
      previousAlertRef.current = intelligence.alertMessage;
    }
  }, [intelligence?.shouldAlert, intelligence?.alertMessage]);
  
  if (parentLoading || isLoading) {
    return (
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary animate-pulse" />
            <Skeleton className="h-6 w-48" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }
  
  if (!intelligence) {
    return (
      <Card className="border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-amber-500/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-amber-500" />
            Analyzing Whale Data...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Waiting for sufficient whale transaction data to generate intelligence.
          </p>
        </CardContent>
      </Card>
    );
  }
  
  const getIntentIcon = () => {
    if (intelligence.whaleIntent.classification === 'accumulating') 
      return <ArrowUpRight className="h-6 w-6 text-success" />;
    if (intelligence.whaleIntent.classification === 'distributing') 
      return <ArrowDownRight className="h-6 w-6 text-destructive" />;
    return <Activity className="h-6 w-6 text-muted-foreground" />;
  };
  
  const getActionIcon = () => {
    if (intelligence.actionGuidance.recommendation === 'trade') 
      return <Target className="h-5 w-5 text-success" />;
    if (intelligence.actionGuidance.recommendation === 'avoid') 
      return <XCircle className="h-5 w-5 text-destructive" />;
    return <Eye className="h-5 w-5 text-amber-500" />;
  };
  
  const getActionColor = () => {
    if (intelligence.actionGuidance.recommendation === 'trade') 
      return 'border-success/50 bg-success/10';
    if (intelligence.actionGuidance.recommendation === 'avoid') 
      return 'border-destructive/50 bg-destructive/10';
    return 'border-amber-500/50 bg-amber-500/10';
  };
  
  const getRiskColor = () => {
    if (intelligence.riskWarnings.level === 'high') 
      return 'text-destructive border-destructive/30 bg-destructive/10';
    if (intelligence.riskWarnings.level === 'medium') 
      return 'text-amber-500 border-amber-500/30 bg-amber-500/10';
    return 'text-success border-success/30 bg-success/10';
  };
  
  const getConfidenceColor = (score: number) => {
    if (score >= 70) return 'text-success';
    if (score >= 50) return 'text-amber-500';
    return 'text-destructive';
  };

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            Whale Intelligence
          </CardTitle>
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            Live
          </Badge>
        </div>
        <CardDescription className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          AI-powered analysis of on-chain whale activity
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Confidence Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">Analysis Confidence</span>
            <span className={`text-2xl font-bold ${getConfidenceColor(intelligence.confidenceScore)}`}>
              {intelligence.confidenceScore}%
            </span>
          </div>
          <Progress value={intelligence.confidenceScore} className="h-2" />
          <div className="flex flex-wrap gap-1 mt-2">
            {intelligence.confidenceFactors.map((factor, idx) => (
              <Badge key={idx} variant="outline" className="text-[10px]">
                {factor}
              </Badge>
            ))}
          </div>
        </div>
        
        {/* Market Bias */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Market Bias
          </h4>
          <div className="grid grid-cols-3 gap-2">
            <BiasIndicator bias={intelligence.marketBias.shortTerm} label="Short-term" />
            <BiasIndicator bias={intelligence.marketBias.intraday} label="Intraday" />
            <BiasIndicator bias={intelligence.marketBias.swing} label="Swing" />
          </div>
        </div>
        
        {/* Whale Intent Summary */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            {getIntentIcon()}
            Whale Intent
          </h4>
          <div className={`p-4 rounded-lg border ${
            intelligence.whaleIntent.classification === 'accumulating' 
              ? 'border-success/30 bg-success/10' 
              : intelligence.whaleIntent.classification === 'distributing'
              ? 'border-destructive/30 bg-destructive/10'
              : 'border-border bg-muted/50'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <Badge 
                variant={
                  intelligence.whaleIntent.classification === 'accumulating' ? 'default' :
                  intelligence.whaleIntent.classification === 'distributing' ? 'destructive' : 'secondary'
                }
                className="uppercase text-xs"
              >
                {intelligence.whaleIntent.classification}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {intelligence.whaleIntent.strength} signal
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{intelligence.whaleIntent.description}</p>
          </div>
        </div>
        
        {/* Action Guidance */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            {getActionIcon()}
            Action Guidance
          </h4>
          <div className={`p-4 rounded-lg border ${getActionColor()}`}>
            <div className="flex items-center gap-2 mb-2">
              <Badge 
                variant={
                  intelligence.actionGuidance.recommendation === 'trade' ? 'default' :
                  intelligence.actionGuidance.recommendation === 'avoid' ? 'destructive' : 'secondary'
                }
                className="uppercase text-xs font-bold"
              >
                {intelligence.actionGuidance.recommendation}
              </Badge>
              <span className="text-sm font-medium">{intelligence.actionGuidance.reason}</span>
            </div>
            <p className="text-sm text-muted-foreground">{intelligence.actionGuidance.details}</p>
          </div>
        </div>
        
        {/* Risk Warnings */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Risk Assessment
          </h4>
          <div className={`p-4 rounded-lg border ${getRiskColor()}`}>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-4 w-4" />
              <span className="font-medium uppercase text-xs">{intelligence.riskWarnings.level} Risk</span>
            </div>
            <ul className="space-y-2">
              {intelligence.riskWarnings.warnings.map((warning, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  {intelligence.riskWarnings.level === 'low' ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-success" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  )}
                  <span className="text-muted-foreground">{warning}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        {/* Quick Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-border/50">
          <div className="text-center p-2 bg-background/50 rounded-lg">
            <p className="text-xs text-muted-foreground">Volume</p>
            <p className="font-bold text-sm">{formatUsd(intelligence.metrics.totalVolume)}</p>
          </div>
          <div className="text-center p-2 bg-background/50 rounded-lg">
            <p className="text-xs text-muted-foreground">Transactions</p>
            <p className="font-bold text-sm">{intelligence.metrics.transactionCount}</p>
          </div>
          <div className="text-center p-2 bg-success/10 rounded-lg">
            <p className="text-xs text-success">Outflows</p>
            <p className="font-bold text-sm text-success">{intelligence.metrics.outflowCount}</p>
          </div>
          <div className="text-center p-2 bg-destructive/10 rounded-lg">
            <p className="text-xs text-destructive">Inflows</p>
            <p className="font-bold text-sm text-destructive">{intelligence.metrics.inflowCount}</p>
          </div>
        </div>
        
        <p className="text-[10px] text-center text-muted-foreground pt-2">
          Less alerts • More clarity • No hype • Only high-quality intelligence
        </p>
      </CardContent>
    </Card>
  );
};
