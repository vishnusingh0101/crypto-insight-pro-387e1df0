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
    const { coinName } = await req.json();
    console.log("Fetching news for:", coinName);

    // Fetch news from CryptoPanic API (free tier)
    // Note: In production, you should use a proper news API with your API key
    // For now, we'll simulate news data based on the coin
    
    const mockNews = [
      {
        title: `${coinName} Shows Strong Momentum as Institutional Interest Grows`,
        description: `Market analysts report increased institutional buying pressure for ${coinName}, with on-chain data showing significant accumulation patterns. Trading volume has surged by 40% in the past 24 hours.`,
        url: "#",
        source: "CryptoNews",
        timeAgo: "2 hours ago",
        sentiment: "positive",
      },
      {
        title: `Technical Analysis: ${coinName} Breaks Key Resistance Level`,
        description: `${coinName} has successfully breached the critical resistance level, suggesting potential for further upward movement. RSI indicators show healthy momentum without entering overbought territory.`,
        url: "#",
        source: "TradingView",
        timeAgo: "5 hours ago",
        sentiment: "positive",
      },
      {
        title: `${coinName} Network Upgrade Scheduled for Next Quarter`,
        description: `Development team announces major protocol upgrade aimed at improving transaction speeds and reducing fees. The upgrade has received positive feedback from the community and validators.`,
        url: "#",
        source: "CoinDesk",
        timeAgo: "8 hours ago",
        sentiment: "positive",
      },
      {
        title: `Market Volatility Affects ${coinName} Price Action`,
        description: `Broader market uncertainty has led to increased volatility in ${coinName} trading. Traders are advised to monitor support levels and maintain proper risk management strategies.`,
        url: "#",
        source: "Bloomberg Crypto",
        timeAgo: "12 hours ago",
        sentiment: "neutral",
      },
      {
        title: `Whale Alert: Large ${coinName} Transfers Detected`,
        description: `Blockchain analytics reveal multiple large transfers of ${coinName} to exchanges, potentially signaling profit-taking activity. Market participants are closely watching for price impact.`,
        url: "#",
        source: "Whale Alert",
        timeAgo: "1 day ago",
        sentiment: "neutral",
      },
    ];

    console.log(`Generated ${mockNews.length} news articles for ${coinName}`);

    return new Response(JSON.stringify(mockNews), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in fetch-crypto-news function:', error);
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
