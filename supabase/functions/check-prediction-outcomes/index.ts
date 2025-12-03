import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function fetchCurrentPrice(coinId: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return data[coinId]?.usd || null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Checking prediction outcomes...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find predictions older than 24 hours that haven't been checked
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: uncheckedPredictions, error: fetchError } = await supabase
      .from('trade_predictions')
      .select('*')
      .is('was_successful', null)
      .lt('predicted_at', twentyFourHoursAgo)
      .limit(20); // Process in batches

    if (fetchError) {
      throw new Error(`Failed to fetch predictions: ${fetchError.message}`);
    }

    if (!uncheckedPredictions || uncheckedPredictions.length === 0) {
      return new Response(JSON.stringify({
        message: "No predictions to check",
        checked: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${uncheckedPredictions.length} predictions to check`);

    let checkedCount = 0;
    let successCount = 0;

    for (const prediction of uncheckedPredictions) {
      // Rate limit CoinGecko calls
      await new Promise(resolve => setTimeout(resolve, 2000));

      const currentPrice = await fetchCurrentPrice(prediction.coin_id);
      
      if (currentPrice === null) {
        console.log(`Could not fetch price for ${prediction.coin_id}, skipping`);
        continue;
      }

      const entryPrice = Number(prediction.entry_price);
      const targetPrice = Number(prediction.target_price);
      const stopLoss = Number(prediction.stop_loss);
      
      let wasSuccessful = false;
      let profitLossPercent = 0;

      if (prediction.action === 'BUY') {
        // BUY is successful if price went up towards target
        profitLossPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
        // Success if price reached at least 50% of target or is above entry
        const targetGain = ((targetPrice - entryPrice) / entryPrice) * 100;
        wasSuccessful = profitLossPercent >= (targetGain * 0.5) || currentPrice >= targetPrice;
        // Also check if it didn't hit stop loss
        if (currentPrice <= stopLoss) {
          wasSuccessful = false;
        }
      } else if (prediction.action === 'SELL') {
        // SELL is successful if price went down towards target
        profitLossPercent = ((entryPrice - currentPrice) / entryPrice) * 100;
        const targetGain = ((entryPrice - targetPrice) / entryPrice) * 100;
        wasSuccessful = profitLossPercent >= (targetGain * 0.5) || currentPrice <= targetPrice;
        // Check if it didn't hit stop loss
        if (currentPrice >= stopLoss) {
          wasSuccessful = false;
        }
      } else {
        // HOLD - check if price stayed stable (within 5%)
        profitLossPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
        wasSuccessful = Math.abs(profitLossPercent) <= 5;
      }

      // Update the prediction
      const { error: updateError } = await supabase
        .from('trade_predictions')
        .update({
          outcome_checked_at: new Date().toISOString(),
          actual_price_after_24h: currentPrice,
          was_successful: wasSuccessful,
          profit_loss_percent: profitLossPercent,
        })
        .eq('id', prediction.id);

      if (updateError) {
        console.error(`Failed to update prediction ${prediction.id}:`, updateError);
      } else {
        checkedCount++;
        if (wasSuccessful) successCount++;
        console.log(`Checked ${prediction.coin_name}: ${prediction.action} - ${wasSuccessful ? 'SUCCESS' : 'FAILED'} (${profitLossPercent.toFixed(2)}%)`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      checked: checkedCount,
      successful: successCount,
      failed: checkedCount - successCount,
      success_rate: checkedCount > 0 ? ((successCount / checkedCount) * 100).toFixed(2) : 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in check-prediction-outcomes:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
