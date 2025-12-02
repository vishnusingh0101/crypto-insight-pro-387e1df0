import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NewsItem {
  title: string;
  description?: string;
  sentiment?: string;
  source?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { news } = await req.json();
    
    if (!news || !Array.isArray(news) || news.length === 0) {
      return new Response(
        JSON.stringify({ alerts: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ alerts: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare news summaries for analysis
    const newsSummaries = news.slice(0, 10).map((item: NewsItem, idx: number) => 
      `${idx + 1}. ${item.title}`
    ).join('\n');

    console.log("Analyzing news impact for:", newsSummaries);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are a crypto market analyst. Analyze news headlines and identify ONLY truly significant news that could cause immediate market movements (>3% price change). Be very selective - most news is not impactful enough.

Return a JSON array of alerts. Each alert should have:
- "title": short alert title (max 50 chars)
- "message": brief impact description (max 100 chars)
- "impact": "high" (major event), "medium" (notable), or "low" (minor)
- "coins": array of affected coin symbols (e.g., ["BTC", "ETH"])

Only include alerts for HIGH or MEDIUM impact news. Return empty array [] if no significant news.
Return ONLY valid JSON array, no markdown.`
          },
          {
            role: "user",
            content: `Analyze these crypto news headlines for market impact:\n\n${newsSummaries}`
          }
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ alerts: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";
    
    console.log("AI response:", content);

    // Parse the AI response
    let alerts = [];
    try {
      // Clean up the response in case it has markdown
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      alerts = JSON.parse(cleanContent);
      
      // Filter to only high/medium impact alerts
      alerts = alerts.filter((a: any) => a.impact === "high" || a.impact === "medium");
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      alerts = [];
    }

    console.log("Returning alerts:", alerts);

    return new Response(
      JSON.stringify({ alerts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error("Error analyzing news impact:", error);
    return new Response(
      JSON.stringify({ alerts: [], error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
