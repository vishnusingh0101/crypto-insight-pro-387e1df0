import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhaleTransaction {
  hash: string;
  blockchain: string;
  amount: number;
  amountUsd: number;
  from: string;
  to: string;
  timestamp: string;
  type: 'transfer' | 'exchange_inflow' | 'exchange_outflow' | 'unknown';
  significance: 'high' | 'medium' | 'low';
}

// Known exchange addresses (simplified list)
const EXCHANGE_ADDRESSES: Record<string, string[]> = {
  bitcoin: [
    'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', // Binance
    '3M219KR5vEneNb47ewrPfWyb5jQ2DjxRP6', // Binance Cold
    'bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97', // Bitfinex
    '1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s', // Binance
  ],
  ethereum: [
    '0x28c6c06298d514db089934071355e5743bf21d60', // Binance
    '0x21a31ee1afc51d94c2efccaa2092ad1028285549', // Binance
    '0xdfd5293d8e347dfe59e90efd55b2956a1343963d', // Binance
    '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503', // Binance Cold
    '0x564286362092d8e7936f0549571a803b203aaced', // Binance Hot
  ],
};

// Whale thresholds in USD
const WHALE_THRESHOLDS = {
  bitcoin: { high: 10000000, medium: 5000000, low: 1000000 },
  ethereum: { high: 5000000, medium: 2000000, low: 500000 },
};

function isExchangeAddress(address: string, blockchain: string): boolean {
  const addresses = EXCHANGE_ADDRESSES[blockchain] || [];
  return addresses.some(ex => address.toLowerCase().includes(ex.toLowerCase().slice(0, 20)));
}

function determineTransactionType(from: string, to: string, blockchain: string): WhaleTransaction['type'] {
  const fromIsExchange = isExchangeAddress(from, blockchain);
  const toIsExchange = isExchangeAddress(to, blockchain);
  
  if (fromIsExchange && !toIsExchange) return 'exchange_outflow';
  if (!fromIsExchange && toIsExchange) return 'exchange_inflow';
  if (!fromIsExchange && !toIsExchange) return 'transfer';
  return 'unknown';
}

function getSignificance(amountUsd: number, blockchain: string): WhaleTransaction['significance'] {
  const thresholds = WHALE_THRESHOLDS[blockchain as keyof typeof WHALE_THRESHOLDS] || WHALE_THRESHOLDS.ethereum;
  if (amountUsd >= thresholds.high) return 'high';
  if (amountUsd >= thresholds.medium) return 'medium';
  return 'low';
}

async function fetchBitcoinWhaleTransactions(btcPrice: number): Promise<WhaleTransaction[]> {
  const transactions: WhaleTransaction[] = [];
  
  try {
    // Use Blockchain.com free API for recent blocks
    const response = await fetch('https://blockchain.info/unconfirmed-transactions?format=json', {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      console.log('Blockchain.info API unavailable, trying Blockchair...');
      return await fetchBitcoinFromBlockchair(btcPrice);
    }
    
    const data = await response.json();
    const txs = data.txs || [];
    
    for (const tx of txs.slice(0, 100)) {
      // Calculate total output value
      const totalOutput = tx.out?.reduce((sum: number, out: any) => sum + (out.value || 0), 0) || 0;
      const amountBtc = totalOutput / 100000000; // Convert satoshis to BTC
      const amountUsd = amountBtc * btcPrice;
      
      // Only track whale transactions (> $1M)
      if (amountUsd >= WHALE_THRESHOLDS.bitcoin.low) {
        const fromAddress = tx.inputs?.[0]?.prev_out?.addr || 'Unknown';
        const toAddress = tx.out?.[0]?.addr || 'Unknown';
        
        transactions.push({
          hash: tx.hash,
          blockchain: 'bitcoin',
          amount: amountBtc,
          amountUsd,
          from: fromAddress,
          to: toAddress,
          timestamp: new Date(tx.time * 1000).toISOString(),
          type: determineTransactionType(fromAddress, toAddress, 'bitcoin'),
          significance: getSignificance(amountUsd, 'bitcoin'),
        });
      }
    }
  } catch (error) {
    console.error('Error fetching Bitcoin transactions:', error);
    return await fetchBitcoinFromBlockchair(btcPrice);
  }
  
  return transactions;
}

async function fetchBitcoinFromBlockchair(btcPrice: number): Promise<WhaleTransaction[]> {
  const transactions: WhaleTransaction[] = [];
  
  try {
    // Blockchair free API - get recent large transactions
    const response = await fetch(
      'https://api.blockchair.com/bitcoin/transactions?limit=50&s=output_total(desc)',
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) {
      console.log('Blockchair API also unavailable');
      return transactions;
    }
    
    const data = await response.json();
    const txs = data.data || [];
    
    for (const tx of txs) {
      const amountBtc = (tx.output_total || 0) / 100000000;
      const amountUsd = amountBtc * btcPrice;
      
      if (amountUsd >= WHALE_THRESHOLDS.bitcoin.low) {
        transactions.push({
          hash: tx.hash,
          blockchain: 'bitcoin',
          amount: amountBtc,
          amountUsd,
          from: 'Multiple Inputs',
          to: 'Multiple Outputs',
          timestamp: tx.time || new Date().toISOString(),
          type: 'transfer',
          significance: getSignificance(amountUsd, 'bitcoin'),
        });
      }
    }
  } catch (error) {
    console.error('Error fetching from Blockchair:', error);
  }
  
  return transactions;
}

async function fetchEthereumWhaleTransactions(ethPrice: number): Promise<WhaleTransaction[]> {
  const transactions: WhaleTransaction[] = [];
  
  try {
    // Use Etherscan free API (no key needed for basic requests, with rate limits)
    // Get recent blocks and look for large transactions
    const blockResponse = await fetch('https://api.etherscan.io/api?module=proxy&action=eth_blockNumber');
    const blockData = await blockResponse.json();
    const latestBlock = parseInt(blockData.result, 16);
    
    // Get transactions from the latest block
    const txResponse = await fetch(
      `https://api.etherscan.io/api?module=proxy&action=eth_getBlockByNumber&tag=${latestBlock.toString(16)}&boolean=true`
    );
    const txData = await txResponse.json();
    
    if (txData.result?.transactions) {
      for (const tx of txData.result.transactions) {
        const valueWei = parseInt(tx.value, 16);
        const amountEth = valueWei / 1e18;
        const amountUsd = amountEth * ethPrice;
        
        if (amountUsd >= WHALE_THRESHOLDS.ethereum.low) {
          transactions.push({
            hash: tx.hash,
            blockchain: 'ethereum',
            amount: amountEth,
            amountUsd,
            from: tx.from,
            to: tx.to || 'Contract Creation',
            timestamp: new Date().toISOString(),
            type: determineTransactionType(tx.from, tx.to || '', 'ethereum'),
            significance: getSignificance(amountUsd, 'ethereum'),
          });
        }
      }
    }
  } catch (error) {
    console.error('Error fetching Ethereum transactions:', error);
  }
  
  return transactions;
}

async function fetchCurrentPrices(): Promise<{ btc: number; eth: number }> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd'
    );
    const data = await response.json();
    return {
      btc: data.bitcoin?.usd || 95000,
      eth: data.ethereum?.usd || 3200,
    };
  } catch (error) {
    console.error('Error fetching prices:', error);
    return { btc: 95000, eth: 3200 };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { blockchain = 'all' } = await req.json().catch(() => ({}));
    
    console.log(`Fetching whale transactions for: ${blockchain}`);
    
    // Get current prices for USD conversion
    const prices = await fetchCurrentPrices();
    console.log('Current prices:', prices);
    
    let allTransactions: WhaleTransaction[] = [];
    
    if (blockchain === 'all' || blockchain === 'bitcoin') {
      const btcTxs = await fetchBitcoinWhaleTransactions(prices.btc);
      console.log(`Found ${btcTxs.length} Bitcoin whale transactions`);
      allTransactions = [...allTransactions, ...btcTxs];
    }
    
    if (blockchain === 'all' || blockchain === 'ethereum') {
      const ethTxs = await fetchEthereumWhaleTransactions(prices.eth);
      console.log(`Found ${ethTxs.length} Ethereum whale transactions`);
      allTransactions = [...allTransactions, ...ethTxs];
    }
    
    // Sort by USD amount descending
    allTransactions.sort((a, b) => b.amountUsd - a.amountUsd);
    
    // Take top 20 whale transactions
    const topTransactions = allTransactions.slice(0, 20);
    
    // Generate summary stats
    const summary = {
      totalTransactions: topTransactions.length,
      totalVolumeUsd: topTransactions.reduce((sum, tx) => sum + tx.amountUsd, 0),
      highSignificance: topTransactions.filter(tx => tx.significance === 'high').length,
      exchangeInflows: topTransactions.filter(tx => tx.type === 'exchange_inflow').length,
      exchangeOutflows: topTransactions.filter(tx => tx.type === 'exchange_outflow').length,
      largestTransaction: topTransactions[0] || null,
    };
    
    return new Response(
      JSON.stringify({
        transactions: topTransactions,
        summary,
        prices,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in track-whale-transactions:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fetch whale transactions',
        transactions: [],
        summary: {
          totalTransactions: 0,
          totalVolumeUsd: 0,
          highSignificance: 0,
          exchangeInflows: 0,
          exchangeOutflows: 0,
          largestTransaction: null,
        },
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});
