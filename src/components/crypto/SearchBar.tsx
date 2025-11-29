import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Zap } from "lucide-react";
import { toast } from "sonner";

const SearchBar = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const handleAnalyze = () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter a cryptocurrency name or symbol");
      return;
    }
    
    // Convert to lowercase and remove spaces for the coin ID
    const coinId = searchQuery.toLowerCase().trim().replace(/\s+/g, "-");
    navigate(`/analysis/${coinId}`);
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
          size="lg"
          className="h-12 px-8 bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all glow-primary"
        >
          <Zap className="w-5 h-5 mr-2" />
          Analyze
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Enter any cryptocurrency name or symbol to get AI-powered analysis, trading signals, and latest news
      </p>
    </div>
  );
};

export default SearchBar;
