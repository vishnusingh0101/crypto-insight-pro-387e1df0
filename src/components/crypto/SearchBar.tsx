import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";

const SearchBar = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const navigate = useNavigate();

  const handleAnalyze = async () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter a cryptocurrency name or symbol");
      return;
    }
    
    setIsSearching(true);
    
    try {
      // Search CoinGecko to find the correct coin ID
      const response = await fetch(
        `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(searchQuery.trim())}`,
        { headers: { 'Accept': 'application/json' } }
      );
      
      if (!response.ok) {
        throw new Error("Search failed");
      }
      
      const data = await response.json();
      
      if (data.coins && data.coins.length > 0) {
        // Use the first result's ID
        const coinId = data.coins[0].id;
        navigate(`/analysis/${coinId}`);
      } else {
        toast.error("Cryptocurrency not found. Try 'bitcoin', 'ethereum', or 'btc'");
      }
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Failed to search. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAnalyze();
    }
  };

  return (
    <div className="glass-morphism p-6 rounded-xl">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search cryptocurrency (e.g., bitcoin, ethereum, BTC)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            className="pl-10 h-12 bg-card border-border/50 focus:border-primary transition-colors"
          />
        </div>
        <Button
          onClick={handleAnalyze}
          disabled={isSearching}
          size="lg"
          className="h-12 px-8 bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all glow-primary disabled:opacity-50"
        >
          {isSearching ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Searching...
            </>
          ) : (
            <>
              <Zap className="w-5 h-5 mr-2" />
              Analyze
            </>
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Enter any cryptocurrency name or symbol to get AI-powered analysis, trading signals, and latest news
      </p>
    </div>
  );
};

export default SearchBar;
