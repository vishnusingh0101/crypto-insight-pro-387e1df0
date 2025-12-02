import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CryptoCompare News API (free, no API key required for basic usage)
const CRYPTOCOMPARE_NEWS_URL = "https://min-api.cryptocompare.com/data/v2/news/?lang=EN";

// Alternative: CoinGecko status updates (free)
const COINGECKO_STATUS_URL = "https://api.coingecko.com/api/v3/status_updates";

interface CryptoCompareArticle {
  id: string;
  guid: string;
  published_on: number;
  imageurl: string;
  title: string;
  url: string;
  source: string;
  body: string;
  tags: string;
  categories: string;
  upvotes: string;
  downvotes: string;
  lang: string;
  source_info: {
    name: string;
    lang: string;
    img: string;
  };
}

interface NewsItem {
  title: string;
  description: string;
  url: string;
  source: string;
  published_at: string;
  sentiment: "positive" | "negative" | "neutral";
  trending: boolean;
  imageUrl?: string;
}

function analyzeSentiment(text: string): "positive" | "negative" | "neutral" {
  const lowerText = text.toLowerCase();
  
  const positiveWords = [
    'surge', 'soar', 'rally', 'gain', 'bullish', 'growth', 'profit', 'success',
    'breakthrough', 'milestone', 'adoption', 'partnership', 'launch', 'upgrade',
    'record', 'high', 'boost', 'rise', 'increase', 'positive', 'strong', 'win'
  ];
  
  const negativeWords = [
    'crash', 'plunge', 'drop', 'fall', 'bearish', 'loss', 'hack', 'scam',
    'fraud', 'warning', 'risk', 'ban', 'regulation', 'investigation', 'lawsuit',
    'vulnerability', 'exploit', 'decline', 'fear', 'concern', 'alert', 'danger'
  ];
  
  let positiveScore = 0;
  let negativeScore = 0;
  
  for (const word of positiveWords) {
    if (lowerText.includes(word)) positiveScore++;
  }
  
  for (const word of negativeWords) {
    if (lowerText.includes(word)) negativeScore++;
  }
  
  if (positiveScore > negativeScore + 1) return "positive";
  if (negativeScore > positiveScore + 1) return "negative";
  return "neutral";
}

async function fetchCryptoCompareNews(): Promise<NewsItem[]> {
  try {
    console.log("Fetching news from CryptoCompare...");
    
    const response = await fetch(CRYPTOCOMPARE_NEWS_URL, {
      headers: {
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      console.error("CryptoCompare API error:", response.status);
      return [];
    }
    
    const data = await response.json();
    const articles: CryptoCompareArticle[] = data.Data || [];
    
    console.log(`Fetched ${articles.length} articles from CryptoCompare`);
    
    return articles.map((article, index) => {
      const fullText = `${article.title} ${article.body}`;
      const sentiment = analyzeSentiment(fullText);
      
      return {
        title: article.title,
        description: article.body.length > 300 
          ? article.body.substring(0, 300) + "..." 
          : article.body,
        url: article.url,
        source: article.source_info?.name || article.source || "CryptoCompare",
        published_at: new Date(article.published_on * 1000).toISOString(),
        sentiment,
        trending: index < 5, // Mark first 5 as trending
        imageUrl: article.imageurl,
      };
    });
  } catch (error) {
    console.error("Error fetching CryptoCompare news:", error);
    return [];
  }
}

async function fetchCoinGeckoUpdates(): Promise<NewsItem[]> {
  try {
    console.log("Fetching updates from CoinGecko...");
    
    const response = await fetch(`${COINGECKO_STATUS_URL}?per_page=50`, {
      headers: {
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      console.error("CoinGecko API error:", response.status);
      return [];
    }
    
    const data = await response.json();
    const updates = data.status_updates || [];
    
    console.log(`Fetched ${updates.length} updates from CoinGecko`);
    
    return updates.map((update: any) => {
      const sentiment = analyzeSentiment(update.description || "");
      
      return {
        title: update.project?.name 
          ? `${update.project.name}: ${update.category || "Update"}`
          : update.category || "Crypto Update",
        description: update.description || "",
        url: update.project?.links?.homepage?.[0] || "#",
        source: update.project?.name || "CoinGecko",
        published_at: update.created_at || new Date().toISOString(),
        sentiment,
        trending: false,
        imageUrl: update.project?.image?.small,
      };
    });
  } catch (error) {
    console.error("Error fetching CoinGecko updates:", error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Fetching general crypto news from multiple sources...");

    // Fetch from multiple sources in parallel
    const [cryptoCompareNews, coinGeckoUpdates] = await Promise.all([
      fetchCryptoCompareNews(),
      fetchCoinGeckoUpdates(),
    ]);

    // Combine and deduplicate news
    const allNews: NewsItem[] = [];
    const seenTitles = new Set<string>();

    // Add CryptoCompare news first (usually higher quality)
    for (const news of cryptoCompareNews) {
      const titleLower = news.title.toLowerCase();
      if (!seenTitles.has(titleLower)) {
        seenTitles.add(titleLower);
        allNews.push(news);
      }
    }

    // Add CoinGecko updates
    for (const news of coinGeckoUpdates) {
      const titleLower = news.title.toLowerCase();
      if (!seenTitles.has(titleLower) && news.description.length > 20) {
        seenTitles.add(titleLower);
        allNews.push(news);
      }
    }

    // Sort by published date (newest first)
    allNews.sort((a, b) => {
      const dateA = new Date(a.published_at).getTime();
      const dateB = new Date(b.published_at).getTime();
      return dateB - dateA;
    });

    console.log(`Returning ${allNews.length} total news articles`);

    return new Response(JSON.stringify(allNews), {
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
