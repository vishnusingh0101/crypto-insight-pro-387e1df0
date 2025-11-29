import { useState } from "react";
import { TrendingUp, Zap, Activity, Brain } from "lucide-react";
import CryptoGrid from "@/components/crypto/CryptoGrid";
import SignalsPanel from "@/components/crypto/SignalsPanel";
import ExplainableAI from "@/components/crypto/ExplainableAI";
import MarketOverview from "@/components/crypto/MarketOverview";

const Index = () => {
  const [selectedCrypto, setSelectedCrypto] = useState<string | null>(null);

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
        {/* Market Overview */}
        <MarketOverview />

        {/* Crypto Grid */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold">Live Market Data</h2>
          </div>
          <CryptoGrid onSelectCrypto={setSelectedCrypto} />
        </section>

        {/* AI Analysis Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Signals Panel */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <Zap className="w-6 h-6 text-accent" />
              <h2 className="text-2xl font-bold">AI Trading Signals</h2>
            </div>
            <SignalsPanel selectedCrypto={selectedCrypto} />
          </section>

          {/* Explainable AI */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <Brain className="w-6 h-6 text-secondary" />
              <h2 className="text-2xl font-bold">Signal Explanation</h2>
            </div>
            <ExplainableAI selectedCrypto={selectedCrypto} />
          </section>
        </div>
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
