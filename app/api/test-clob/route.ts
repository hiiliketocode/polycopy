import { clobClient } from '@/lib/polymarket-clob';

export async function GET() {
  try {
    // Test the CLOB client connection
    const markets = await clobClient.getMarkets();
    
    return Response.json({ 
      success: true, 
      marketsCount: markets?.length || 0,
      message: 'CLOB client connected successfully'
    });
  } catch (error: any) {
    console.error('CLOB client error:', error);
    return Response.json({ 
      error: error?.message || 'Unknown error',
      success: false
    }, { status: 500 });
  }
}
