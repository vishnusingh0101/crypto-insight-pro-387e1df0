import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, DollarSign, Activity, BarChart3 } from "lucide-react";

const MarketOverview = () => {
  const { data: overview, isLoading } = useQuery({
    queryKey: ["market-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("market-overview");
      
      if (error) throw error;
      
      return data;
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-6 glass-morphism">
            <Skeleton className="h-10 w-10 rounded-lg mb-4" />
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-32" />
          </Card>
        ))}
      </div>
    );
  }

  const stats = [
    {
      icon: DollarSign,
      label: "Total Market Cap",
      value: `$${(overview?.total_market_cap / 1e12).toFixed(2)}T`,
      change: overview?.market_cap_change_24h,
      color: "text-primary",
    },
    {
      icon: Activity,
      label: "24h Volume",
      value: `$${(overview?.total_volume / 1e9).toFixed(2)}B`,
      change: overview?.volume_change_24h,
      color: "text-secondary",
    },
    {
      icon: TrendingUp,
      label: "BTC Dominance",
      value: `${overview?.btc_dominance?.toFixed(1)}%`,
      change: overview?.btc_dominance_change,
      color: "text-accent",
    },
    {
      icon: BarChart3,
      label: "Active Cryptos",
      value: overview?.active_cryptocurrencies?.toLocaleString() || "0",
      color: "text-success",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        const hasChange = stat.change !== undefined;
        const isPositive = hasChange && stat.change >= 0;
        
        return (
          <Card
            key={index}
            className="p-6 glass-morphism hover:scale-105 transition-all"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-lg bg-card ${stat.color}`}>
                <Icon className="w-6 h-6" />
              </div>
              {hasChange && (
                <span
                  className={`text-sm font-bold ${
                    isPositive ? "text-success" : "text-destructive"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {stat.change.toFixed(2)}%
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
            <p className="text-2xl font-bold font-mono">{stat.value}</p>
          </Card>
        );
      })}
    </div>
  );
};

export default MarketOverview;
