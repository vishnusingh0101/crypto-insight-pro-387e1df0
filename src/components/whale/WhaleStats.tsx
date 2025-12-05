import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Wallet, 
  ArrowDownRight, 
  ArrowUpRight, 
  AlertTriangle,
  DollarSign,
  BarChart3
} from "lucide-react";

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

interface WhaleStatsProps {
  data?: {
    transactions: WhaleTransaction[];
    summary: {
      totalTransactions: number;
      totalVolumeUsd: number;
      highSignificance: number;
      exchangeInflows: number;
      exchangeOutflows: number;
      largestTransaction: WhaleTransaction | null;
    };
    prices: { btc: number; eth: number };
  };
  isLoading: boolean;
}

const formatUsd = (amount: number) => {
  if (amount >= 1000000000) return `$${(amount / 1000000000).toFixed(2)}B`;
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
};

export const WhaleStats = ({ data, isLoading }: WhaleStatsProps) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const stats = [
    {
      label: "Total Volume",
      value: formatUsd(data?.summary.totalVolumeUsd || 0),
      icon: DollarSign,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Transactions",
      value: data?.summary.totalTransactions || 0,
      icon: BarChart3,
      color: "text-secondary",
      bgColor: "bg-secondary/10",
    },
    {
      label: "High Impact",
      value: data?.summary.highSignificance || 0,
      icon: AlertTriangle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
    {
      label: "Exchange Inflows",
      value: data?.summary.exchangeInflows || 0,
      icon: ArrowDownRight,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
    {
      label: "Exchange Outflows",
      value: data?.summary.exchangeOutflows || 0,
      icon: ArrowUpRight,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      label: "Largest TX",
      value: data?.summary.largestTransaction 
        ? formatUsd(data.summary.largestTransaction.amountUsd)
        : 'N/A',
      icon: Wallet,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {stats.map((stat, index) => (
        <Card 
          key={stat.label} 
          className="bg-card/50 backdrop-blur border-border/50 hover:border-primary/30 transition-all duration-300 hover:scale-105"
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
                <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
