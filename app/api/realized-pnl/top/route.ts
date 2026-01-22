import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ traders: [] }, { status: 200 });
  }

  const url = new URL(request.url);
  const window = (url.searchParams.get('window') || '1D').toUpperCase();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 5), 1), 25);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('wallet_address, pnl_sum, rank')
    .eq('window_key', window)
    .order('rank', { ascending: true })
    .limit(limit);

  if (error || !data) {
    return NextResponse.json({ traders: [] }, { status: 200 });
  }

  const wallets = data.map((row: any) => row.wallet_address?.toLowerCase()).filter(Boolean);
  const { data: traderRows } = await supabase
    .from('traders')
    .select('wallet_address, display_name')
    .in('wallet_address', wallets);

  const traderMap = new Map<string, string | null>(
    (traderRows || []).map((row: any) => [row.wallet_address?.toLowerCase(), row.display_name ?? null])
  );

  const payload = data.map((row: any) => ({
    wallet: row.wallet_address,
    pnl: Number(row.pnl_sum ?? 0),
    displayName: traderMap.get(row.wallet_address?.toLowerCase()) ?? null,
  }));

  return NextResponse.json({ traders: payload });
}
