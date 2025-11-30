import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Newspaper, ExternalLink, Clock, Smile, Frown, Meh } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

interface CoinNewsProps {
  coinName: string;
}

const CoinNews = ({ coinName }: CoinNewsProps) => {
  const navigate = useNavigate();
  const [displayCount, setDisplayCount] = useState(4);
  
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
        {news.slice(0, displayCount).map((article: any, index: number) => {
          const getSentimentIcon = (sentiment: string) => {
            switch (sentiment) {
              case "positive":
                return <Smile className="w-3 h-3" />;
              case "negative":
                return <Frown className="w-3 h-3" />;
              default:
                return <Meh className="w-3 h-3" />;
            }
          };

          const getSentimentColor = (sentiment: string) => {
            switch (sentiment) {
              case "positive":
                return "border-success text-success";
              case "negative":
                return "border-destructive text-destructive";
              default:
                return "border-accent text-accent";
            }
          };

          return (
            <div
              key={index}
              onClick={() => navigate(`/news/${index}`, { state: { newsItem: article } })}
              className="block p-4 rounded-lg border border-border/50 hover:border-primary/50 transition-all hover:bg-card/80 group cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors mb-2">
                    {article.title}
                  </h4>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {article.description}
                  </p>
                  <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>
                        {article.published_at && !isNaN(new Date(article.published_at).getTime())
                          ? formatDistanceToNow(new Date(article.published_at), { addSuffix: true })
                          : 'Recently'}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-xs border-muted">
                      {article.source}
                    </Badge>
                    {article.sentiment && (
                      <Badge variant="outline" className={`text-xs ${getSentimentColor(article.sentiment)}`}>
                        {getSentimentIcon(article.sentiment)}
                        <span className="ml-1 capitalize">{article.sentiment}</span>
                      </Badge>
                    )}
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
              </div>
            </div>
          );
        })}
        
        <div className="flex justify-center pt-4">
          <Button 
            variant="outline" 
            onClick={() => setDisplayCount(prev => prev + 4)}
            disabled={!news || displayCount >= news.length}
          >
            {displayCount >= (news?.length || 0) ? 'No More News' : 'Show More News'}
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default CoinNews;
