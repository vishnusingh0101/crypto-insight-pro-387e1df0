import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Newspaper, ExternalLink, Clock, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const GeneralNews = () => {
  const { data: news, isLoading } = useQuery({
    queryKey: ["general-crypto-news"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-general-news");
      
      if (error) throw error;
      
      return data as any[];
    },
    refetchInterval: 300000, // Refetch every 5 minutes
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="p-6 glass-morphism">
            <Skeleton className="h-6 w-3/4 mb-3" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-2/3 mb-3" />
            <Skeleton className="h-4 w-1/2" />
          </Card>
        ))}
      </div>
    );
  }

  if (!news || news.length === 0) {
    return (
      <Card className="p-8 glass-morphism text-center">
        <Newspaper className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">No recent news available</p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {news.map((article: any, index: number) => (
        <Card
          key={index}
          className="p-6 glass-morphism hover:scale-105 transition-all group cursor-pointer"
          onClick={() => window.open(article.url, '_blank')}
        >
          <div className="flex items-start justify-between mb-3">
            <Badge
              variant="outline"
              className={`${
                article.sentiment === "positive"
                  ? "border-success text-success"
                  : article.sentiment === "negative"
                  ? "border-destructive text-destructive"
                  : "border-accent text-accent"
              }`}
            >
              {article.sentiment}
            </Badge>
            <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          
          <h3 className="font-bold text-lg mb-3 group-hover:text-primary transition-colors line-clamp-2">
            {article.title}
          </h3>
          
          <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
            {article.description}
          </p>
          
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/50">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{article.timeAgo}</span>
            </div>
            <span className="font-medium">{article.source}</span>
          </div>
          
          {article.trending && (
            <div className="mt-3 flex items-center gap-1 text-xs text-accent">
              <TrendingUp className="w-3 h-3" />
              <span>Trending</span>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
};

export default GeneralNews;
