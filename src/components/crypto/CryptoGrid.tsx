import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";

interface CryptoGridProps {
  onSelectCrypto: (id: string) => void;
}

const CryptoGrid = ({ onSelectCrypto }: CryptoGridProps) => {
  const { data: cryptos, isLoading } = useQuery({
    queryKey: ["crypto-prices"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-crypto-data");
      
      if (error) {
        toast.error("Failed to fetch crypto data");
        throw error;
      }
      
      return data as any[];
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="p-6 glass-morphism">
            <Skeleton className="h-8 w-8 rounded-full mb-4" />
            <Skeleton className="h-6 w-24 mb-2" />
            <Skeleton className="h-8 w-32 mb-3" />
            <Skeleton className="h-4 w-20" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {cryptos?.map((crypto: any) => {
        const isPositive = crypto.price_change_percentage_24h >= 0;
        
        return (
          <Card
            key={crypto.id}
            className="p-6 glass-morphism cursor-pointer transition-all hover:scale-105 hover:glow-primary"
            onClick={() => onSelectCrypto(crypto.id)}
          >
            <div className="flex items-start justify-between mb-4">
              <img
                src={crypto.image}
                alt={crypto.name}
                className="w-10 h-10 rounded-full"
              />
              <span className="text-xs font-mono text-muted-foreground uppercase">
                {crypto.symbol}
              </span>
            </div>
            
            <h3 className="text-lg font-bold mb-2">{crypto.name}</h3>
            
            <div className="space-y-2">
              <p className="text-2xl font-bold font-mono">
                ${crypto.current_price.toLocaleString()}
              </p>
              
              <div className="flex items-center gap-2">
                {isPositive ? (
                  <TrendingUp className="w-4 h-4 text-success" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-destructive" />
                )}
                <span
                  className={`text-sm font-medium ${
                    isPositive ? "text-success" : "text-destructive"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {(
                    crypto.price_change_percentage_24h ??
                    crypto.price_change_percentage_24h_in_currency ??
                    0
                  ).toFixed(2)}%
                </span>
              </div>
              
              <div className="pt-3 border-t border-border/50 text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Market Cap</span>
                  <span className="font-mono">
                    {crypto.market_cap ? `$${(crypto.market_cap / 1e9).toFixed(2)}B` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>24h Volume</span>
                  <span className="font-mono">
                    {crypto.total_volume ? `$${(crypto.total_volume / 1e9).toFixed(2)}B` : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default CryptoGrid;
