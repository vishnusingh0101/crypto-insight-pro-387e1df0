import { TrendingUp, Zap, Activity, Newspaper, Brain } from "lucide-react";
import { useNavigate } from "react-router-dom";
import CryptoGrid from "@/components/crypto/CryptoGrid";
import MarketOverview from "@/components/crypto/MarketOverview";
import SearchBar from "@/components/crypto/SearchBar";
import GeneralNews from "@/components/crypto/GeneralNews";
import MarketSentiment from "@/components/crypto/MarketSentiment";
import BestTradeToday from "@/components/crypto/BestTradeToday";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <header className="border-b border-border/50 backdrop-blur-xl bg-card/30 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Zap className="w-10 h-10 text-primary animate-pulse-glow" />
                <div className="absolute inset-0 animate-ping opacity-20">
                  <Zap className="w-10 h-10 text-primary" />
                </div>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gradient">Crypto Insight Pro</h1>
                <p className="text-sm text-muted-foreground">AI-Driven Trading Intelligence</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="glass-morphism px-4 py-2 rounded-lg flex items-center gap-2">
                <Activity className="w-4 h-4 text-success animate-pulse" />
                <span className="text-sm font-mono">Live</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Search Bar */}
        <SearchBar />

        {/* Market Overview & Sentiment */}
        <div className="grid gap-6 lg:grid-cols-2">
          <MarketOverview />
          <MarketSentiment />
        </div>

        {/* Best Trade Today */}
        <section>
          <BestTradeToday />
        </section>

        {/* Crypto Grid */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold">Top Cryptocurrencies</h2>
          </div>
          <CryptoGrid onSelectCrypto={(id) => navigate(`/analysis/${id}`)} />
        </section>

        {/* Latest Crypto News */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Newspaper className="w-6 h-6 text-accent" />
            <h2 className="text-2xl font-bold">Latest Crypto News</h2>
            <span className="text-sm text-muted-foreground">(Live updates)</span>
          </div>
          <GeneralNews />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-20 py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>Powered by AI • Real-time market data from CoinGecko</p>
          <p className="mt-2 text-xs">Trading involves risk. Past performance does not guarantee future results.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
