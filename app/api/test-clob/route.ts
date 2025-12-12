import { clobClient } from '@/lib/polymarket-clob';

export async function GET() {
  try {
    // Test the CLOB client connection
    const response = await clobClient.getMarkets();
    
    // The response is a PaginationPayload with a 'data' property containing the markets array
    const marketsCount = Array.isArray(response) ? response.length : (response?.data?.length || 0);
    
    return Response.json({ 
      success: true, 
      marketsCount,
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
