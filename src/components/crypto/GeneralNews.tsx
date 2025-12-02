import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Newspaper, ExternalLink, Smile, Frown, Meh } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

const GeneralNews = () => {
  const navigate = useNavigate();
  const [displayCount, setDisplayCount] = useState(6);
  
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

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case "positive":
        return <Smile className="w-4 h-4" />;
      case "negative":
        return <Frown className="w-4 h-4" />;
      default:
        return <Meh className="w-4 h-4" />;
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {news.slice(0, displayCount).map((article: any, index: number) => (
        <Card
          key={index}
          className="p-6 glass-morphism hover:bg-card/80 transition-all group cursor-pointer"
          onClick={() => navigate(`/news/${index}`, { state: { newsItem: article } })}
        >
          <div className="flex items-start justify-between mb-3">
            <Badge variant="outline" className={getSentimentColor(article.sentiment)}>
              {getSentimentIcon(article.sentiment)}
              <span className="ml-1 capitalize">{article.sentiment}</span>
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
            <span>
              {article.published_at && !isNaN(new Date(article.published_at).getTime())
                ? formatDistanceToNow(new Date(article.published_at), { addSuffix: true })
                : 'Recently'}
            </span>
            <span className="font-medium">{article.source}</span>
          </div>
        </Card>
        ))}
      </div>
      
      {news && displayCount < news.length && (
        <div className="flex justify-center">
          <Button 
            variant="outline" 
            onClick={() => setDisplayCount(prev => Math.min(prev + 6, news.length))}
          >
            Show More News ({news.length - displayCount} remaining)
          </Button>
        </div>
      )}
    </div>
  );
};

export default GeneralNews;
