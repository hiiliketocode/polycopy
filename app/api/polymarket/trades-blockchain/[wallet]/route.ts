import { NextResponse } from 'next/server';
import { enrichBlockchainTrades } from '@/lib/polymarket/blockchain-trades';

/**
 * Fetch complete trade history from Polygon blockchain using Alchemy RPC
 * 
 * This queries the CTF Exchange contract for OrderFilled events
 * to get ALL historical trades (no 100-trade limit!)
 */

// CTF Exchange contract address on Polygon
const CTF_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

// OrderFilled event signature
// event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)
const ORDER_FILLED_TOPIC = '0xd0a08e8c493f9c94f29311604c9de1b4e8c8d4c06bd0c789af57f2d65bfec5f6';

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
    const walletLower = wallet.toLowerCase();
    
    // Pad wallet address to 32 bytes (64 hex chars) for topic filtering
    const paddedWallet = '0x' + walletLower.slice(2).padStart(64, '0');
    
    const { searchParams } = new URL(request.url);
    const fromBlock = searchParams.get('from_block') || '0x0';
    const toBlock = searchParams.get('to_block') || 'latest';

    console.log(`🔗 Fetching blockchain trades for ${walletLower} using Public Polygon RPC`);
    console.log(`   From block: ${fromBlock}, To block: ${toBlock}`);

    // Use public Polygon RPC endpoint (no API key needed!)
    const rpcUrl = 'https://polygon-rpc.com/';
    
    console.log('📥 Querying OrderFilled events from public Polygon RPC...');
    
    // Make direct JSON-RPC calls to Alchemy
    // Query for maker trades (wallet as maker in topic[2])
    const makerParams = {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getLogs',
      params: [{
        fromBlock,
        toBlock,
        address: CTF_EXCHANGE_ADDRESS,
        topics: [
          ORDER_FILLED_TOPIC,
          null, // orderHash
          paddedWallet, // maker
        ],
      }],
    };
    
    // Query for taker trades (wallet as taker in topic[3])
    const takerParams = {
      jsonrpc: '2.0',
      id: 2,
      method: 'eth_getLogs',
      params: [{
        fromBlock,
        toBlock,
        address: CTF_EXCHANGE_ADDRESS,
        topics: [
          ORDER_FILLED_TOPIC,
          null, // orderHash
          null, // maker
          paddedWallet, // taker
        ],
      }],
    };
    
    const [makerResponse, takerResponse] = await Promise.all([
      fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makerParams),
        cache: 'no-store',
      }),
      fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(takerParams),
        cache: 'no-store',
      }),
    ]);
    
    const [makerData, takerData] = await Promise.all([
      makerResponse.json(),
      takerResponse.json(),
    ]);
    
    if (makerData.error) {
      console.error('❌ Polygon RPC API error (maker):', makerData.error);
      throw new Error(`Polygon RPC error: ${makerData.error.message}`);
    }
    
    if (takerData.error) {
      console.error('❌ Polygon RPC API error (taker):', takerData.error);
      throw new Error(`Polygon RPC error: ${takerData.error.message}`);
    }
    
    const makerLogs = makerData.result || [];
    const takerLogs = takerData.result || [];
    
    console.log(`✅ Found ${makerLogs.length} maker trades, ${takerLogs.length} taker trades`);

    // Combine and deduplicate logs
    const allLogs = [...makerLogs, ...takerLogs];
    const uniqueLogs = Array.from(
      new Map(allLogs.map((log: any) => [log.transactionHash + log.logIndex, log])).values()
    );

    console.log(`📊 Processing ${uniqueLogs.length} unique trades...`);

    // Parse events from Alchemy format
    const trades = uniqueLogs.map((log: any) => {
      try {
        // Get block timestamp
        const timestamp = log.timeStamp ? parseInt(log.timeStamp, 16) * 1000 : Date.now();

        // Parse topics array
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
        const isMaker = maker.toLowerCase() === walletLower;
        const side = isMaker ? 'SELL' : 'BUY';
        
        // For the wallet's perspective:
        // - If maker (seller): they sold outcome tokens for USDC
        // - If taker (buyer): they bought outcome tokens with USDC
        const tokenId = isMaker ? makerAssetId : takerAssetId;
        const shares = isMaker ? 
          Number(makerAmountFilled) / 1e6 : 
          Number(takerAmountFilled) / 1e6;
        const usdcAmount = isMaker ? 
          Number(takerAmountFilled) / 1e6 : 
          Number(makerAmountFilled) / 1e6;

        return {
          id: log.transactionHash + '-' + log.logIndex,
          market: 'Unknown', // Will be enriched later
          outcome: 'Unknown', // Will be enriched later
          tokenId: tokenId.replace(/^0x0+/, '0x'), // Remove leading zeros
          side,
          shares,
          price: shares > 0 ? usdcAmount / shares : 0,
          amount: usdcAmount,
          timestamp,
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber ? parseInt(log.blockNumber, 16) : 0,
        };
      } catch (error) {
        console.error('❌ Error parsing log:', error, log);
        return null;
      }
    }).filter((trade): trade is NonNullable<typeof trade> => trade !== null);

    console.log(`🎉 Parsed ${trades.length} raw blockchain trades`);

    // Enrich with market data
    const enrichedTrades = await enrichBlockchainTrades(trades);

    console.log(`✅ Returning ${enrichedTrades.length} enriched blockchain trades`);

    return NextResponse.json({
      success: true,
      trades: enrichedTrades,
      count: enrichedTrades.length,
      source: 'alchemy-blockchain',
    });

  } catch (error: any) {
    console.error('❌ Error fetching blockchain trades:', error);
    
    // Fall back to public API if blockchain query fails
    console.log('⚠️ Falling back to public Polymarket API (100 trade limit)...');
    
    try {
      const response = await fetch(
        `https://data-api.polymarket.com/trades?user=${wallet.toLowerCase()}&limit=100`,
        { cache: 'no-store' }
      );
      
      if (!response.ok) {
        throw new Error(`Fallback API failed: ${response.statusText}`);
      }
      
      const fallbackTrades = await response.json();
      
      return NextResponse.json({
        success: true,
        trades: fallbackTrades,
        count: fallbackTrades.length,
        source: 'fallback-public-api',
        limited: true,
      });
    } catch (fallbackError) {
      console.error('❌ Fallback API also failed:', fallbackError);
      
      return NextResponse.json(
        { 
          error: 'Failed to fetch trades from blockchain and fallback API',
          details: error.message,
        },
        { status: 500 }
      );
    }
  }
}
