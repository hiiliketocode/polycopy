import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase admin client not configured.' },
      { status: 500 }
    );
  }

  let payload: {
    conditionId?: string | null;
    espnUrl?: string | null;
    espnGameId?: string | null;
  } = {};

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const conditionId = payload.conditionId?.trim();
  const espnUrl = payload.espnUrl?.trim();

  if (!conditionId || !espnUrl) {
    return NextResponse.json(
      { error: 'conditionId and espnUrl are required.' },
      { status: 400 }
    );
  }

  const updates = {
    condition_id: conditionId,
    espn_url: espnUrl,
    espn_game_id: payload.espnGameId?.trim() || null,
    espn_last_checked: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from('markets')
    .upsert(updates, { onConflict: 'condition_id' });

  if (error) {
    console.error('[markets/espn] Failed to update market:', error);
    return NextResponse.json({ error: 'Failed to update market.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
