import { NextRequest, NextResponse } from 'next/server';
import { loadTopRealizedIndexPayload } from '@/lib/realized-pnl-index';

export async function GET(_: NextRequest) {
  const payload = await loadTopRealizedIndexPayload();
  return NextResponse.json(payload);
}
