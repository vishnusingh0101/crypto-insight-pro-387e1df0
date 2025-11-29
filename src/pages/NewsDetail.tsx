import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, ExternalLink, Smile, Frown, Meh } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const NewsDetail = () => {
  const { newsId } = useParams<{ newsId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const newsItem = location.state?.newsItem;

  if (!newsItem) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">News not found</h2>
          <Button onClick={() => navigate("/")}>Back to Dashboard</Button>
        </Card>
      </div>
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-xl bg-card/30 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => navigate(-1)}
              className="hover:bg-card"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              GlobalCryptoUpdate
            </h2>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Card className="p-8 glass-morphism">
          {/* News Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <Badge variant="outline" className={getSentimentColor(newsItem.sentiment)}>
                {getSentimentIcon(newsItem.sentiment)}
                <span className="ml-1 capitalize">{newsItem.sentiment}</span>
              </Badge>
              <Badge variant="outline" className="border-muted text-muted-foreground">
                {newsItem.source}
              </Badge>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                {formatDistanceToNow(new Date(newsItem.published_at), { addSuffix: true })}
              </div>
            </div>
            
            <h1 className="text-4xl font-bold mb-4">{newsItem.title}</h1>
          </div>

          {/* News Content */}
          <div className="prose prose-invert max-w-none mb-8">
            <p className="text-lg text-muted-foreground leading-relaxed">
              {newsItem.description || newsItem.title}
            </p>
          </div>

          {/* Source Link */}
          {newsItem.url && (
            <div className="pt-6 border-t border-border/50">
              <Button
                variant="outline"
                onClick={() => window.open(newsItem.url, "_blank")}
                className="gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Read Full Article on {newsItem.source}
              </Button>
            </div>
          )}
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-20 py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>GlobalCryptoUpdate • Real-time crypto news from around the world</p>
          <p className="mt-2 text-xs">Stay informed with the latest cryptocurrency updates</p>
        </div>
      </footer>
    </div>
  );
};

export default NewsDetail;
