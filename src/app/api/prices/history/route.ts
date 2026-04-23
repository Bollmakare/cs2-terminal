import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const itemId = req.nextUrl.searchParams.get('item_id')
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30')
  if (!itemId) return NextResponse.json({ error: 'item_id required' }, { status: 400 })

  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('price_history')
    .select('price_usd, price_steam, price_buff, price_skinport, volume_24h, arb_spread_pct, snapped_at')
    .eq('item_id', itemId)
    .gte('snapped_at', since.toISOString().slice(0, 10))
    .order('snapped_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const history = (data ?? []).map(row => ({ date: row.snapped_at, price: row.price_usd ?? row.price_skinport ?? row.price_steam ?? 0, price_usd: row.price_usd, price_steam: row.price_steam, price_buff: row.price_buff, price_skinport: row.price_skinport, volume_24h: row.volume_24h, arb_spread_pct: row.arb_spread_pct }))
  return NextResponse.json({ history })
}
