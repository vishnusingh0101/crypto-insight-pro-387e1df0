import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Fetching general crypto news...");

    // Generate diverse crypto news feed
    const generalNews = [
      {
        title: "Bitcoin ETF Sees Record Inflows as Institutional Interest Surges",
        description: "Major financial institutions pour billions into Bitcoin ETFs, marking a historic shift in institutional crypto adoption. The trend signals growing confidence in digital assets as a legitimate investment class.",
        url: "#",
        source: "Bloomberg Crypto",
        timeAgo: "1 hour ago",
        sentiment: "positive",
        trending: true,
      },
      {
        title: "DeFi Protocol Launches Revolutionary Cross-Chain Bridge",
        description: "New technology enables seamless asset transfers across multiple blockchains without centralized intermediaries. Early adopters report 90% reduction in transaction costs and improved security.",
        url: "#",
        source: "DeFi Pulse",
        timeAgo: "3 hours ago",
        sentiment: "positive",
        trending: true,
      },
      {
        title: "Regulatory Clarity: SEC Announces Comprehensive Crypto Framework",
        description: "Securities and Exchange Commission releases detailed guidelines for cryptocurrency classification and compliance. Industry leaders welcome the clarity while preparing for stricter oversight.",
        url: "#",
        source: "CoinDesk",
        timeAgo: "5 hours ago",
        sentiment: "neutral",
        trending: false,
      },
      {
        title: "Major Exchange Enhances Security Following Industry-Wide Audit",
        description: "Leading cryptocurrency exchange implements multi-layered security protocols after comprehensive third-party audit. New measures include cold storage expansion and AI-powered fraud detection.",
        url: "#",
        source: "CryptoNews",
        timeAgo: "7 hours ago",
        sentiment: "positive",
        trending: false,
      },
      {
        title: "NFT Market Shows Signs of Recovery with Blue-Chip Collections",
        description: "Top-tier NFT collections experience renewed trading activity and price appreciation. Analysts attribute recovery to improved utility integration and institutional collector interest.",
        url: "#",
        source: "NFT Evening",
        timeAgo: "9 hours ago",
        sentiment: "positive",
        trending: true,
      },
      {
        title: "Energy-Efficient Mining: Green Crypto Initiative Gains Momentum",
        description: "Major mining operations transition to renewable energy sources as environmental sustainability becomes priority. New facilities powered by solar and wind energy report 80% reduction in carbon footprint.",
        url: "#",
        source: "Crypto Climate",
        timeAgo: "12 hours ago",
        sentiment: "positive",
        trending: false,
      },
      {
        title: "Central Bank Digital Currencies: 15 Countries Advance Pilot Programs",
        description: "Global central banks accelerate CBDC development with successful pilot programs. Experts predict widespread adoption within next two years as traditional finance embraces digital transformation.",
        url: "#",
        source: "Financial Times",
        timeAgo: "14 hours ago",
        sentiment: "neutral",
        trending: false,
      },
      {
        title: "Layer 2 Solutions Process Record Transaction Volume",
        description: "Ethereum scaling solutions handle unprecedented transaction throughput with minimal fees. Technology breakthrough addresses longstanding scalability concerns while maintaining security.",
        url: "#",
        source: "Ethereum World News",
        timeAgo: "16 hours ago",
        sentiment: "positive",
        trending: false,
      },
      {
        title: "Crypto Wallet Security Alert: Users Urged to Update Software",
        description: "Security researchers identify potential vulnerability in popular wallet software. Developers release emergency patch and recommend immediate updates for all users.",
        url: "#",
        source: "Security Weekly",
        timeAgo: "18 hours ago",
        sentiment: "negative",
        trending: true,
      },
    ];

    console.log(`Generated ${generalNews.length} general news articles`);

    return new Response(JSON.stringify(generalNews), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in fetch-general-news function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
