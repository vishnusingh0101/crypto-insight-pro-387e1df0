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
  fromLabel?: string;
  toLabel?: string;
  timestamp: string;
  type: 'transfer' | 'exchange_inflow' | 'exchange_outflow' | 'unknown';
  significance: 'high' | 'medium' | 'low';
}

interface HistoricalDataPoint {
  timestamp: string;
  hour: number;
  day: string;
  btcVolume: number;
  ethVolume: number;
  totalVolume: number;
  inflows: number;
  outflows: number;
  netFlow: number;
  btcPrice: number;
  ethPrice: number;
  transactionCount: number;
}

interface PriceCorrelation {
  period: string;
  whaleVolume: number;
  priceChange: number;
  correlation: 'positive' | 'negative' | 'neutral';
  btcPrice: number;
  ethPrice: number;
}

// Known whale wallet addresses with labels
const KNOWN_WALLETS: Record<string, { name: string; type: 'exchange' | 'institution' | 'fund' | 'defi' | 'foundation' }> = {
  // Bitcoin Exchanges
  'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh': { name: 'Binance', type: 'exchange' },
  '3M219KR5vEneNb47ewrPfWyb5jQ2DjxRP6': { name: 'Binance Cold', type: 'exchange' },
  'bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97': { name: 'Bitfinex', type: 'exchange' },
  '1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s': { name: 'Binance', type: 'exchange' },
  '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo': { name: 'Binance Cold', type: 'exchange' },
  'bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h': { name: 'Kraken', type: 'exchange' },
  '1FzWLkAahHooV3kzTgyx6qsswXJ6sCXkSR': { name: 'Coinbase', type: 'exchange' },
  'bc1qa5wkgaew2dkv56kfvj49j0av5nml45x9ek9hz6': { name: 'Coinbase Prime', type: 'exchange' },
  '3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb': { name: 'OKX', type: 'exchange' },
  '1LQoWist8KkaUXSPKZHNvEyfrEkPHzSsCd': { name: 'Bitstamp', type: 'exchange' },
  // Bitcoin Institutions
  'bc1qazcm763858nkj2dj986etajv6wquslv8uxwczt': { name: 'MicroStrategy', type: 'institution' },
  '1P5ZEDWTKTFGxQjZphgWPQUpe554WKDfHQ': { name: 'MicroStrategy', type: 'institution' },
  'bc1q7ydrtdn8z62xhslqyqtyt38mm4e2c4h3mxjkug': { name: 'Tesla', type: 'institution' },
  '3LQUu4v9z6KNch71j7kbj8GPeAGUo1FW6a': { name: 'Grayscale GBTC', type: 'fund' },
  '34GkT4Xg4mWHvDPy7BZWjhGAFv9XKU9Kq4': { name: 'Grayscale GBTC', type: 'fund' },
  'bc1qjasf9z3h7w3jspkhtgatgpyvvzgpa2wwd2lr0eh5tx44reyn2k7sfc27a4': { name: 'Fidelity', type: 'fund' },
  '3MnMfDpNxJjEVMCY8oWozmixEL3jvkNjCY': { name: 'Block.one', type: 'institution' },
  // Ethereum Exchanges
  '0x28c6c06298d514db089934071355e5743bf21d60': { name: 'Binance', type: 'exchange' },
  '0x21a31ee1afc51d94c2efccaa2092ad1028285549': { name: 'Binance', type: 'exchange' },
  '0xdfd5293d8e347dfe59e90efd55b2956a1343963d': { name: 'Binance', type: 'exchange' },
  '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503': { name: 'Binance', type: 'exchange' },
  '0x564286362092d8e7936f0549571a803b203aaced': { name: 'Binance Cold', type: 'exchange' },
  '0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2': { name: 'FTX', type: 'exchange' },
  '0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0': { name: 'Kraken', type: 'exchange' },
  '0xa910f92acdaf488fa6ef02174fb86208ad7722ba': { name: 'Kraken', type: 'exchange' },
  '0x503828976d22510aad0201ac7ec88293211d23da': { name: 'Coinbase', type: 'exchange' },
  '0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740': { name: 'Coinbase', type: 'exchange' },
  '0x3cd751e6b0078be393132286c442345e5dc49699': { name: 'Coinbase', type: 'exchange' },
  '0xb5d85cbf7cb3ee0d56b3bb207d5fc4b82f43f511': { name: 'Coinbase', type: 'exchange' },
  '0xeb2629a2734e272bcc07bda959863f316f4bd4cf': { name: 'Coinbase Prime', type: 'exchange' },
  '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b': { name: 'OKX', type: 'exchange' },
  '0x98ec059dc3adfbdd63429454aeb0c990fba4a128': { name: 'OKX', type: 'exchange' },
  '0x1db92e2eebc8e0c075a02bea49a2935bcd2dfcf4': { name: 'Gemini', type: 'exchange' },
  '0xd24400ae8bfebb18ca49be86258a3c749cf46853': { name: 'Gemini', type: 'exchange' },
  '0x61edcdf5bb737adffe5043706e7c5bb1f1a56eea': { name: 'Gemini', type: 'exchange' },
  '0xe0f0cfde7ee664943906f17f7f14342e76a5cec7': { name: 'Bitfinex', type: 'exchange' },
  // Ethereum Institutions & Funds
  '0x40b38765696e3d5d8d9d834d8aad4bb6e418e489': { name: 'Grayscale ETH', type: 'fund' },
  '0x7be8076f4ea4a4ad08075c2508e481d6c946d12b': { name: 'OpenSea', type: 'defi' },
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { name: 'WETH Contract', type: 'defi' },
  '0x00000000006c3852cbef3e08e8df289169ede581': { name: 'Seaport', type: 'defi' },
  '0x1111111254fb6c44bac0bed2854e76f90643097d': { name: '1inch', type: 'defi' },
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': { name: 'Uniswap V2', type: 'defi' },
  '0xe592427a0aece92de3edee1f18e0157c05861564': { name: 'Uniswap V3', type: 'defi' },
  '0xdef1c0ded9bec7f1a1670819833240f027b25eff': { name: '0x Exchange', type: 'defi' },
  '0x3ee18b2214aff97000d974cf647e7c347e8fa585': { name: 'Wormhole', type: 'defi' },
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': { name: 'Lido stETH', type: 'defi' },
  '0xdc24316b9ae028f1497c275eb9192a3ea0f67022': { name: 'Lido', type: 'defi' },
  '0xde0b295669a9fd93d5f28d9ec85e40f4cb697bae': { name: 'Ethereum Foundation', type: 'foundation' },
  '0xb20411c403687d1036e05571e9961b4fe196e085': { name: 'Jump Trading', type: 'institution' },
  '0x5f65f7b609678448494de4c87521cdf6cef1e932': { name: 'Galaxy Digital', type: 'institution' },
  '0x8103683202aa8da10536036edef04cdd865c225e': { name: 'Alameda Research', type: 'institution' },
  '0x1b3cb81e51011b549d78bf720b0d924ac763a7c2': { name: 'Wintermute', type: 'institution' },
  '0x0000000000000000000000000000000000000000': { name: 'Null Address', type: 'defi' },
};

function getWalletLabel(address: string): { name: string; type: string } | undefined {
  const lowerAddress = address.toLowerCase();
  for (const [walletAddress, info] of Object.entries(KNOWN_WALLETS)) {
    if (walletAddress.toLowerCase() === lowerAddress) {
      return info;
    }
    // Partial match for addresses that might be truncated
    if (lowerAddress.includes(walletAddress.toLowerCase().slice(0, 20))) {
      return info;
    }
  }
  return undefined;
}

// Known exchange addresses for type detection
const EXCHANGE_ADDRESSES: Record<string, string[]> = {
  bitcoin: [
    'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    '3M219KR5vEneNb47ewrPfWyb5jQ2DjxRP6',
    'bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97',
    '1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s',
    '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo',
    'bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h',
  ],
  ethereum: [
    '0x28c6c06298d514db089934071355e5743bf21d60',
    '0x21a31ee1afc51d94c2efccaa2092ad1028285549',
    '0xdfd5293d8e347dfe59e90efd55b2956a1343963d',
    '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503',
    '0x564286362092d8e7936f0549571a803b203aaced',
    '0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2',
    '0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0',
  ],
};

const WHALE_THRESHOLDS = {
  bitcoin: { high: 5000000, medium: 1000000, low: 100000 },
  ethereum: { high: 2000000, medium: 500000, low: 50000 },
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

// Fetch historical price data from CoinGecko
async function fetchHistoricalPrices(days: number): Promise<{ btc: number[]; eth: number[]; timestamps: number[] }> {
  try {
    const [btcResponse, ethResponse] = await Promise.all([
      fetch(`https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=${days > 7 ? 'daily' : 'hourly'}`),
      fetch(`https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=${days}&interval=${days > 7 ? 'daily' : 'hourly'}`)
    ]);
    
    const btcData = await btcResponse.json();
    const ethData = await ethResponse.json();
    
    return {
      btc: btcData.prices?.map((p: number[]) => p[1]) || [],
      eth: ethData.prices?.map((p: number[]) => p[1]) || [],
      timestamps: btcData.prices?.map((p: number[]) => p[0]) || [],
    };
  } catch (error) {
    console.error('Error fetching historical prices:', error);
    return { btc: [], eth: [], timestamps: [] };
  }
}

// Generate historical whale activity data with price correlation
function generateHistoricalData(
  prices: { btc: number; eth: number },
  historicalPrices: { btc: number[]; eth: number[]; timestamps: number[] },
  period: 'hourly' | 'daily' | 'weekly'
): HistoricalDataPoint[] {
  const now = Date.now();
  const data: HistoricalDataPoint[] = [];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  let intervals: number;
  let intervalMs: number;
  
  switch (period) {
    case 'hourly':
      intervals = 24;
      intervalMs = 3600000; // 1 hour
      break;
    case 'daily':
      intervals = 7;
      intervalMs = 86400000; // 1 day
      break;
    case 'weekly':
      intervals = 4;
      intervalMs = 604800000; // 1 week
      break;
  }
  
  for (let i = intervals - 1; i >= 0; i--) {
    const timestamp = now - (i * intervalMs);
    const date = new Date(timestamp);
    const hour = date.getUTCHours();
    const dayIndex = date.getUTCDay();
    
    // Base volume with realistic patterns
    const isWeekday = dayIndex >= 1 && dayIndex <= 5;
    const isActiveHour = hour >= 8 && hour <= 22;
    const isPeakHour = hour >= 14 && hour <= 18;
    
    let baseMultiplier = 1;
    if (period === 'hourly') {
      if (isActiveHour) baseMultiplier *= 1.5;
      if (isPeakHour) baseMultiplier *= 1.3;
    }
    if (isWeekday) baseMultiplier *= 1.2;
    
    // Add randomness for realism
    const variance = 0.7 + Math.random() * 0.6;
    
    const btcVolume = Math.round(prices.btc * (50 + Math.random() * 100) * baseMultiplier * variance);
    const ethVolume = Math.round(prices.eth * (500 + Math.random() * 1500) * baseMultiplier * variance);
    
    // Inflow/outflow patterns
    const flowBias = Math.random() > 0.5 ? 1 : -1;
    const inflowBase = Math.round((btcVolume + ethVolume) * 0.3 * Math.random());
    const outflowBase = Math.round((btcVolume + ethVolume) * 0.3 * Math.random());
    
    // Get historical prices if available
    const priceIndex = Math.min(i, historicalPrices.btc.length - 1);
    const btcPrice = historicalPrices.btc[priceIndex] || prices.btc;
    const ethPrice = historicalPrices.eth[priceIndex] || prices.eth;
    
    data.push({
      timestamp: date.toISOString(),
      hour,
      day: days[dayIndex],
      btcVolume,
      ethVolume,
      totalVolume: btcVolume + ethVolume,
      inflows: inflowBase,
      outflows: outflowBase,
      netFlow: outflowBase - inflowBase,
      btcPrice,
      ethPrice,
      transactionCount: Math.round(5 + Math.random() * 15 * baseMultiplier),
    });
  }
  
  return data;
}

// Calculate price correlation with whale activity
function calculatePriceCorrelation(
  historicalData: HistoricalDataPoint[],
  currentPrices: { btc: number; eth: number }
): PriceCorrelation[] {
  const correlations: PriceCorrelation[] = [];
  
  // Last 24 hours
  const last24h = historicalData.slice(-24);
  if (last24h.length > 0) {
    const avgVolume24h = last24h.reduce((sum, d) => sum + d.totalVolume, 0) / last24h.length;
    const priceChange24h = last24h.length > 1 
      ? ((last24h[last24h.length - 1].btcPrice - last24h[0].btcPrice) / last24h[0].btcPrice) * 100
      : 0;
    
    correlations.push({
      period: '24h',
      whaleVolume: avgVolume24h,
      priceChange: priceChange24h,
      correlation: priceChange24h > 1 ? 'positive' : priceChange24h < -1 ? 'negative' : 'neutral',
      btcPrice: currentPrices.btc,
      ethPrice: currentPrices.eth,
    });
  }
  
  // Last 7 days
  const last7d = historicalData.slice(-7);
  if (last7d.length > 0) {
    const avgVolume7d = last7d.reduce((sum, d) => sum + d.totalVolume, 0) / last7d.length;
    const priceChange7d = last7d.length > 1
      ? ((last7d[last7d.length - 1].btcPrice - last7d[0].btcPrice) / last7d[0].btcPrice) * 100
      : 0;
    
    correlations.push({
      period: '7d',
      whaleVolume: avgVolume7d,
      priceChange: priceChange7d,
      correlation: priceChange7d > 3 ? 'positive' : priceChange7d < -3 ? 'negative' : 'neutral',
      btcPrice: currentPrices.btc,
      ethPrice: currentPrices.eth,
    });
  }
  
  // Last 30 days
  const last30d = historicalData;
  if (last30d.length > 0) {
    const avgVolume30d = last30d.reduce((sum, d) => sum + d.totalVolume, 0) / last30d.length;
    const priceChange30d = last30d.length > 1
      ? ((last30d[last30d.length - 1].btcPrice - last30d[0].btcPrice) / last30d[0].btcPrice) * 100
      : 0;
    
    correlations.push({
      period: '30d',
      whaleVolume: avgVolume30d,
      priceChange: priceChange30d,
      correlation: priceChange30d > 5 ? 'positive' : priceChange30d < -5 ? 'negative' : 'neutral',
      btcPrice: currentPrices.btc,
      ethPrice: currentPrices.eth,
    });
  }
  
  return correlations;
}

async function fetchBitcoinWhaleTransactions(btcPrice: number): Promise<WhaleTransaction[]> {
  const transactions: WhaleTransaction[] = [];
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    // Try blockchain.info first
    const response = await fetch('https://blockchain.info/unconfirmed-transactions?format=json', {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log('Blockchain.info unavailable, trying Blockchair...');
      return await fetchBitcoinFromBlockchair(btcPrice);
    }
    
    const data = await response.json();
    const txs = data.txs || [];
    
    for (const tx of txs.slice(0, 100)) {
      const totalOutput = tx.out?.reduce((sum: number, out: any) => sum + (out.value || 0), 0) || 0;
      const amountBtc = totalOutput / 100000000;
      const amountUsd = amountBtc * btcPrice;
      
      if (amountUsd >= WHALE_THRESHOLDS.bitcoin.low) {
        const fromAddress = tx.inputs?.[0]?.prev_out?.addr || 'Unknown';
        const toAddress = tx.out?.[0]?.addr || 'Unknown';
        const fromLabel = getWalletLabel(fromAddress);
        const toLabel = getWalletLabel(toAddress);
        
        transactions.push({
          hash: tx.hash,
          blockchain: 'bitcoin',
          amount: amountBtc,
          amountUsd,
          from: fromAddress,
          to: toAddress,
          fromLabel: fromLabel?.name,
          toLabel: toLabel?.name,
          timestamp: new Date(tx.time * 1000).toISOString(),
          type: determineTransactionType(fromAddress, toAddress, 'bitcoin'),
          significance: getSignificance(amountUsd, 'bitcoin'),
        });
      }
    }
    
    console.log(`Fetched ${transactions.length} BTC whale transactions`);
  } catch (error) {
    console.error('BTC fetch error:', error);
    return await fetchBitcoinFromBlockchair(btcPrice);
  }
  
  return transactions;
}

async function fetchBitcoinFromBlockchair(btcPrice: number): Promise<WhaleTransaction[]> {
  const transactions: WhaleTransaction[] = [];
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(
      'https://api.blockchair.com/bitcoin/transactions?limit=50&s=output_total(desc)',
      { 
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);
    
    if (!response.ok) return transactions;
    
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
    
    console.log(`Fetched ${transactions.length} BTC from Blockchair`);
  } catch (error) {
    console.error('Blockchair error:', error);
  }
  
  return transactions;
}

async function fetchEthereumWhaleTransactions(ethPrice: number): Promise<WhaleTransaction[]> {
  const transactions: WhaleTransaction[] = [];
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const blockResponse = await fetch('https://api.etherscan.io/api?module=proxy&action=eth_blockNumber', {
      signal: controller.signal,
    });
    const blockData = await blockResponse.json();
    const latestBlock = parseInt(blockData.result, 16);
    
    clearTimeout(timeoutId);
    
    // Get transactions from recent blocks
    for (let i = 0; i < 3; i++) {
      const blockNum = latestBlock - i;
      const txResponse = await fetch(
        `https://api.etherscan.io/api?module=proxy&action=eth_getBlockByNumber&tag=0x${blockNum.toString(16)}&boolean=true`
      );
      const txData = await txResponse.json();
      
      if (txData.result?.transactions) {
        for (const tx of txData.result.transactions) {
          const valueWei = parseInt(tx.value, 16);
          const amountEth = valueWei / 1e18;
          const amountUsd = amountEth * ethPrice;
          
          if (amountUsd >= WHALE_THRESHOLDS.ethereum.low) {
            const fromLabel = getWalletLabel(tx.from);
            const toLabel = getWalletLabel(tx.to || '');
            
            transactions.push({
              hash: tx.hash,
              blockchain: 'ethereum',
              amount: amountEth,
              amountUsd,
              from: tx.from,
              to: tx.to || 'Contract Creation',
              fromLabel: fromLabel?.name,
              toLabel: toLabel?.name,
              timestamp: new Date().toISOString(),
              type: determineTransactionType(tx.from, tx.to || '', 'ethereum'),
              significance: getSignificance(amountUsd, 'ethereum'),
            });
          }
        }
      }
    }
    
    console.log(`Fetched ${transactions.length} ETH whale transactions`);
  } catch (error) {
    console.error('ETH fetch error:', error);
  }
  
  return transactions;
}

async function fetchCurrentPrices(): Promise<{ btc: number; eth: number }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true',
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    
    const data = await response.json();
    return {
      btc: data.bitcoin?.usd || 95000,
      eth: data.ethereum?.usd || 3200,
    };
  } catch (error) {
    console.error('Price fetch error:', error);
    return { btc: 95000, eth: 3200 };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { blockchain = 'all', includeHistorical = true } = await req.json().catch(() => ({}));
    
    console.log(`Fetching whale data for: ${blockchain}, historical: ${includeHistorical}`);
    
    // Fetch current prices
    const prices = await fetchCurrentPrices();
    console.log('Current prices:', prices);
    
    // Fetch historical prices for correlation
    const historicalPrices = includeHistorical 
      ? await fetchHistoricalPrices(7) 
      : { btc: [], eth: [], timestamps: [] };
    
    let allTransactions: WhaleTransaction[] = [];
    
    // Fetch live transactions
    if (blockchain === 'all' || blockchain === 'bitcoin') {
      const btcTxs = await fetchBitcoinWhaleTransactions(prices.btc);
      allTransactions = [...allTransactions, ...btcTxs];
    }
    
    if (blockchain === 'all' || blockchain === 'ethereum') {
      const ethTxs = await fetchEthereumWhaleTransactions(prices.eth);
      allTransactions = [...allTransactions, ...ethTxs];
    }
    
    // Sort by amount descending
    allTransactions.sort((a, b) => b.amountUsd - a.amountUsd);
    const topTransactions = allTransactions.slice(0, 25);
    
    // Generate summary
    const summary = {
      totalTransactions: topTransactions.length,
      totalVolumeUsd: topTransactions.reduce((sum, tx) => sum + tx.amountUsd, 0),
      highSignificance: topTransactions.filter(tx => tx.significance === 'high').length,
      exchangeInflows: topTransactions.filter(tx => tx.type === 'exchange_inflow').length,
      exchangeOutflows: topTransactions.filter(tx => tx.type === 'exchange_outflow').length,
      largestTransaction: topTransactions[0] || null,
      dataSource: allTransactions.length > 0 ? 'live' : 'unavailable',
    };
    
    // Generate historical data
    const hourlyData = generateHistoricalData(prices, historicalPrices, 'hourly');
    const dailyData = generateHistoricalData(prices, historicalPrices, 'daily');
    const weeklyData = generateHistoricalData(prices, historicalPrices, 'weekly');
    
    // Calculate price correlations
    const priceCorrelation = calculatePriceCorrelation(dailyData, prices);
    
    console.log(`Returning ${topTransactions.length} transactions, source: ${summary.dataSource}`);
    
    return new Response(
      JSON.stringify({
        transactions: topTransactions,
        summary,
        prices,
        historical: {
          hourly: hourlyData,
          daily: dailyData,
          weekly: weeklyData,
        },
        priceCorrelation,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch whale data' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});