import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting strategy analysis with AI...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch predictions with outcomes from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: predictions, error: predError } = await supabase
      .from('trade_predictions')
      .select('*')
      .not('was_successful', 'is', null)
      .gte('predicted_at', sevenDaysAgo)
      .order('predicted_at', { ascending: false });

    if (predError) {
      throw new Error(`Failed to fetch predictions: ${predError.message}`);
    }

    if (!predictions || predictions.length < 5) {
      return new Response(JSON.stringify({
        message: "Not enough prediction data for analysis. Need at least 5 predictions with outcomes.",
        predictions_available: predictions?.length || 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate statistics
    const successful = predictions.filter(p => p.was_successful).length;
    const failed = predictions.filter(p => !p.was_successful).length;
    const successRate = (successful / predictions.length) * 100;

    // Group by action type
    const buyPredictions = predictions.filter(p => p.action === 'BUY');
    const sellPredictions = predictions.filter(p => p.action === 'SELL');
    const buySuccessRate = buyPredictions.length > 0 
      ? (buyPredictions.filter(p => p.was_successful).length / buyPredictions.length) * 100 
      : 0;
    const sellSuccessRate = sellPredictions.length > 0
      ? (sellPredictions.filter(p => p.was_successful).length / sellPredictions.length) * 100
      : 0;

    // Analyze by RSI ranges
    const lowRsiPredictions = predictions.filter(p => p.rsi_at_prediction && p.rsi_at_prediction < 30);
    const midRsiPredictions = predictions.filter(p => p.rsi_at_prediction && p.rsi_at_prediction >= 30 && p.rsi_at_prediction <= 70);
    const highRsiPredictions = predictions.filter(p => p.rsi_at_prediction && p.rsi_at_prediction > 70);

    const analysisData = {
      total_predictions: predictions.length,
      successful,
      failed,
      success_rate: successRate.toFixed(2),
      buy_predictions: buyPredictions.length,
      buy_success_rate: buySuccessRate.toFixed(2),
      sell_predictions: sellPredictions.length,
      sell_success_rate: sellSuccessRate.toFixed(2),
      low_rsi_predictions: lowRsiPredictions.length,
      low_rsi_success_rate: lowRsiPredictions.length > 0 
        ? ((lowRsiPredictions.filter(p => p.was_successful).length / lowRsiPredictions.length) * 100).toFixed(2)
        : 'N/A',
      mid_rsi_predictions: midRsiPredictions.length,
      mid_rsi_success_rate: midRsiPredictions.length > 0
        ? ((midRsiPredictions.filter(p => p.was_successful).length / midRsiPredictions.length) * 100).toFixed(2)
        : 'N/A',
      high_rsi_predictions: highRsiPredictions.length,
      high_rsi_success_rate: highRsiPredictions.length > 0
        ? ((highRsiPredictions.filter(p => p.was_successful).length / highRsiPredictions.length) * 100).toFixed(2)
        : 'N/A',
      avg_profit_loss: predictions.filter(p => p.profit_loss_percent != null)
        .reduce((sum, p) => sum + Number(p.profit_loss_percent), 0) / predictions.length,
      sample_predictions: predictions.slice(0, 10).map(p => ({
        coin: p.coin_name,
        action: p.action,
        success: p.was_successful,
        profit_loss: p.profit_loss_percent,
        rsi: p.rsi_at_prediction,
        atr: p.atr_at_prediction,
        buy_score: p.buy_score,
        sell_score: p.sell_score,
      })),
    };

    console.log("Sending data to AI for analysis...");

    // Use Lovable AI to analyze and suggest improvements
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert quantitative trading analyst. Analyze cryptocurrency trading signal performance data and provide actionable improvements to the trading strategy.

Your analysis should:
1. Identify patterns in successful vs failed predictions
2. Suggest specific parameter adjustments (RSI thresholds, ATR ranges, score weights)
3. Recommend which market conditions favor BUY vs SELL signals
4. Provide concrete, implementable changes

Output your analysis in a clear, structured format with:
- Summary of findings
- Top 3-5 recommended changes with specific values
- Risk assessment of the current strategy`
          },
          {
            role: "user",
            content: `Analyze this trading prediction performance data from the last 7 days and suggest improvements:

${JSON.stringify(analysisData, null, 2)}

Focus on:
1. Why are certain predictions failing?
2. What RSI/ATR combinations work best?
3. Should we adjust the success probability thresholds?
4. Are BUY or SELL signals more reliable?`
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI analysis failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiAnalysis = aiData.choices?.[0]?.message?.content || "No analysis generated";

    console.log("AI analysis complete, storing results...");

    // Store the analysis
    const { error: insertError } = await supabase
      .from('strategy_improvements')
      .insert({
        total_predictions_analyzed: predictions.length,
        successful_predictions: successful,
        failed_predictions: failed,
        success_rate: successRate,
        ai_analysis: aiAnalysis,
        recommended_changes: analysisData,
      });

    if (insertError) {
      console.error("Failed to store analysis:", insertError);
    }

    return new Response(JSON.stringify({
      success: true,
      statistics: analysisData,
      ai_analysis: aiAnalysis,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in analyze-strategy:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
