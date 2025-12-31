import { NextResponse } from 'next/server';
import { enrichBlockchainTrades } from '@/lib/polymarket/blockchain-trades';

/**
 * Fetch complete trade history from Polygon blockchain using Polygonscan API
 * 
 * This queries the CTF Exchange contract for OrderFilled events
 * to get ALL historical trades (no 100-trade limit!)
 */

// CTF Exchange contract address on Polygon
const CTF_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

// OrderFilled event signature
// event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)
const ORDER_FILLED_TOPIC = '0xd0a08e8c493f9c94f29311604c9de1b4e8c8d4c06bd0c789af57f2d65bfec5f6';

// Etherscan API V2 - unified endpoint for all chains
// See: https://docs.etherscan.io/v2-migration
const ETHERSCAN_API_V2 = 'https://api.etherscan.io/v2/api';
const POLYGON_CHAIN_ID = '137';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await params;
  
  if (!wallet) {
    return NextResponse.json(
      { error: 'Wallet address is required' },
      { status: 400 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const fromBlock = searchParams.get('from_block') || '0';
    const toBlock = searchParams.get('to_block') || 'latest';

    console.log(`🔗 Fetching blockchain trades for ${wallet} using Etherscan V2 API`);
    console.log(`   From block: ${fromBlock}, To block: ${toBlock}`);

    // Pad the wallet address to 32 bytes for topic filtering
    const paddedWallet = '0x' + wallet.toLowerCase().slice(2).padStart(64, '0');

    console.log('📥 Querying OrderFilled events from Etherscan V2 API...');
    
    const apiKey = process.env.ETHERSCAN_API_KEY || '';
    
    if (!apiKey) {
      console.warn('⚠️ No ETHERSCAN_API_KEY found in environment variables');
      throw new Error('Etherscan API key required');
    }
    
    // Query Etherscan V2 API with chainid for Polygon
    // Format: https://api.etherscan.io/v2/api?chainid=137&module=logs&action=getLogs...
    const makerUrl = `${ETHERSCAN_API_V2}?chainid=${POLYGON_CHAIN_ID}` +
      `&module=logs&action=getLogs` +
      `&address=${CTF_EXCHANGE_ADDRESS}` +
      `&topic0=${ORDER_FILLED_TOPIC}` +
      `&topic1=${paddedWallet}` +
      `&fromBlock=${fromBlock}` +
      `&toBlock=${toBlock}` +
      `&page=1` +
      `&offset=10000` +
      `&apikey=${apiKey}`;
    
    const takerUrl = `${ETHERSCAN_API_V2}?chainid=${POLYGON_CHAIN_ID}` +
      `&module=logs&action=getLogs` +
      `&address=${CTF_EXCHANGE_ADDRESS}` +
      `&topic0=${ORDER_FILLED_TOPIC}` +
      `&topic2=${paddedWallet}` +
      `&fromBlock=${fromBlock}` +
      `&toBlock=${toBlock}` +
      `&page=1` +
      `&offset=10000` +
      `&apikey=${apiKey}`;
    
    console.log('🔗 Maker URL:', makerUrl.replace(apiKey, 'HIDDEN'));
    console.log('🔗 Taker URL:', takerUrl.replace(apiKey, 'HIDDEN'));
    
    const [makerResponse, takerResponse] = await Promise.all([
      fetch(makerUrl, { cache: 'no-store' }),
      fetch(takerUrl, { cache: 'no-store' }),
    ]);

    const [makerData, takerData] = await Promise.all([
      makerResponse.json(),
      takerResponse.json(),
    ]);

    console.log('Maker API response:', makerData.status, makerData.message);
    console.log('Taker API response:', takerData.status, takerData.message);

    if (makerData.status !== '1' && makerData.message !== 'No records found') {
      console.error('❌ Polygonscan API error (maker):', makerData.message, makerData.result);
    }

    if (takerData.status !== '1' && takerData.message !== 'No records found') {
      console.error('❌ Polygonscan API error (taker):', takerData.message, takerData.result);
    }

    const makerLogs = (makerData.status === '1' ? makerData.result : []) || [];
    const takerLogs = (takerData.status === '1' ? takerData.result : []) || [];

    console.log(`✅ Found ${makerLogs.length} maker trades, ${takerLogs.length} taker trades`);

    // Combine and deduplicate logs
    const allLogs = [...makerLogs, ...takerLogs];
    const uniqueLogs = Array.from(
      new Map(allLogs.map((log: any) => [log.transactionHash + log.logIndex, log])).values()
    );

    console.log(`📊 Processing ${uniqueLogs.length} unique trades...`);

    // Parse events from Polygonscan format
    const trades = uniqueLogs.map((log: any) => {
      try {
        // Polygonscan returns timestamp in hex
        const timestamp = parseInt(log.timeStamp, 16) * 1000;

        // Parse topics array - Polygonscan returns topics as array
        // topics[0] = event signature
        // topics[1] = orderHash (indexed)
        // topics[2] = maker (indexed)
        // topics[3] = taker (indexed)
        if (!log.topics || log.topics.length < 4) {
          console.warn('⚠️ Invalid topics length for log:', log.transactionHash);
          return null;
        }

        const maker = '0x' + log.topics[2].slice(26); // Remove padding
        const taker = '0x' + log.topics[3].slice(26); // Remove padding

        // Parse data field: makerAssetId, takerAssetId, makerAmountFilled, takerAmountFilled, fee
        // Each uint256 is 32 bytes (64 hex chars)
        const dataWithoutPrefix = log.data.slice(2);
        const makerAssetId = '0x' + dataWithoutPrefix.slice(0, 64);
        const takerAssetId = '0x' + dataWithoutPrefix.slice(64, 128);
        const makerAmountFilledHex = dataWithoutPrefix.slice(128, 192);
        const takerAmountFilledHex = dataWithoutPrefix.slice(192, 256);

        // Convert hex to decimal
        const makerAmountFilled = BigInt('0x' + makerAmountFilledHex);
        const takerAmountFilled = BigInt('0x' + takerAmountFilledHex);

        // Determine if this wallet was buying or selling
        const isMaker = maker.toLowerCase() === wallet.toLowerCase();
        const side = isMaker ? 'SELL' : 'BUY'; // Maker typically sells, taker buys
        
        // Calculate price (price per share in USDC, 6 decimals)
        // If buying: price = takerAmount / makerAmount
        // If selling: price = makerAmount / takerAmount
        const makerAmount = Number(makerAmountFilled) / 1e6;
        const takerAmount = Number(takerAmountFilled) / 1e6;
        
        const price = isMaker
          ? (takerAmount / makerAmount)
          : (makerAmount / takerAmount);

        // Size is the number of outcome tokens traded
        const size = isMaker ? makerAmount : takerAmount;

        return {
          timestamp,
          transactionHash: log.transactionHash,
          blockNumber: parseInt(log.blockNumber, 16),
          side,
          price: isNaN(price) || !isFinite(price) ? 0 : price,
          size: isNaN(size) ? 0 : size,
          tokenId: isMaker ? makerAssetId : takerAssetId,
          conditionId: null, // Will be enriched later
          market: 'Loading...', // Will be enriched later
          outcome: 'Loading...', // Will be enriched later
        };
      } catch (err) {
        console.error('❌ Error parsing trade:', err, 'Log:', log);
        return null;
      }
    });

    // Filter out null trades
    const validTrades = trades.filter((t: any): t is NonNullable<typeof t> => t !== null);

    // Sort by timestamp (most recent first)
    validTrades.sort((a, b) => b.timestamp - a.timestamp);

    console.log(`🎉 Parsed ${validTrades.length} raw blockchain trades`);

    // Enrich trades with market metadata
    const enrichedTrades = await enrichBlockchainTrades(validTrades);

    console.log(`✅ Returning ${enrichedTrades.length} enriched blockchain trades`);

    return NextResponse.json({
      success: true,
      trades: enrichedTrades,
      count: enrichedTrades.length,
      source: 'blockchain',
    });

  } catch (error) {
    console.error('❌ Error fetching blockchain trades:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch blockchain trades',
        details: error instanceof Error ? error.message : String(error),
        fallback: true
      },
      { status: 500 }
    );
  }
}

