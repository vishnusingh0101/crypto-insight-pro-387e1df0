import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Newspaper, ExternalLink, Clock } from "lucide-react";
import { toast } from "sonner";

interface CoinNewsProps {
  coinName: string;
}

const CoinNews = ({ coinName }: CoinNewsProps) => {
  const { data: news, isLoading } = useQuery({
    queryKey: ["coin-news", coinName],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-crypto-news", {
        body: { coinName },
      });
      
      if (error) {
        toast.error("Failed to fetch news");
        throw error;
      }
      
      return data as any[];
    },
    refetchInterval: 300000, // Refetch every 5 minutes
  });

  if (isLoading) {
    return (
      <Card className="p-6 glass-morphism">
        <div className="flex items-center gap-2 mb-6">
          <Newspaper className="w-5 h-5 text-accent" />
          <h3 className="font-bold text-lg">Latest News</h3>
        </div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (!news || news.length === 0) {
    return (
      <Card className="p-6 glass-morphism">
        <div className="flex items-center gap-2 mb-6">
          <Newspaper className="w-5 h-5 text-accent" />
          <h3 className="font-bold text-lg">Latest News</h3>
        </div>
        <p className="text-muted-foreground text-center py-8">
          No recent news available for this cryptocurrency
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 glass-morphism">
      <div className="flex items-center gap-2 mb-6">
        <Newspaper className="w-5 h-5 text-accent" />
        <h3 className="font-bold text-lg">Latest News</h3>
      </div>
      
      <div className="space-y-4">
        {news.map((article: any, index: number) => (
          <a
            key={index}
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-4 rounded-lg border border-border/50 hover:border-primary/50 transition-all hover:bg-card/80 group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-2">
                  {article.title}
                </h4>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                  {article.description}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{article.timeAgo}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">{article.source}</span>
                  </div>
                  {article.sentiment && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        article.sentiment === "positive"
                          ? "bg-success/20 text-success"
                          : article.sentiment === "negative"
                          ? "bg-destructive/20 text-destructive"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {article.sentiment}
                    </span>
                  )}
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
            </div>
          </a>
        ))}
      </div>
    </Card>
  );
};

export default CoinNews;
