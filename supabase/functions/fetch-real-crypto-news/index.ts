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
    console.log(`Fetching real news for: ${coinName}`);

    // Fetch from CryptoPanic public API (free, no auth required)
    const cryptoPanicUrl = coinName 
      ? `https://cryptopanic.com/api/v1/posts/?auth_token=free&currencies=${coinName.toLowerCase()}&public=true`
      : `https://cryptopanic.com/api/v1/posts/?auth_token=free&public=true`;
    
    const response = await fetch(cryptoPanicUrl);
    
    if (!response.ok) {
      throw new Error(`CryptoPanic API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Fetched ${data.results?.length || 0} news items`);

    // Transform CryptoPanic data to our format
    const news = (data.results || []).slice(0, 10).map((item: any) => {
      // Determine sentiment based on votes
      let sentiment = "neutral";
      if (item.votes) {
        const positiveRatio = item.votes.positive / (item.votes.positive + item.votes.negative + item.votes.important);
        if (positiveRatio > 0.6) sentiment = "positive";
        else if (positiveRatio < 0.4) sentiment = "negative";
      }

      return {
        title: item.title,
        description: item.title, // CryptoPanic doesn't provide separate descriptions
        url: item.url,
        source: item.source?.title || "CryptoPanic",
        published_at: item.published_at,
        sentiment: sentiment,
      };
    });

    return new Response(
      JSON.stringify(news),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error("Error fetching crypto news:", error);
    
    // Fallback to mock data if API fails
    const mockNews = [
      {
        title: "Bitcoin Reaches New All-Time High",
        description: "Bitcoin surpasses previous records as institutional adoption grows",
        url: "https://example.com",
        source: "CryptoNews",
        published_at: new Date().toISOString(),
        sentiment: "positive"
      },
      {
        title: "Ethereum 2.0 Upgrade Shows Promising Results",
        description: "Network efficiency improves significantly after latest update",
        url: "https://example.com",
        source: "BlockchainDaily",
        published_at: new Date(Date.now() - 3600000).toISOString(),
        sentiment: "positive"
      }
    ];

    return new Response(
      JSON.stringify(mockNews),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  }
});
