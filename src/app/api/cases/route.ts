import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activeOnly = req.nextUrl.searchParams.get('active') !== 'false'
  let query = supabase.from('cases_data').select('*').order('is_active', { ascending: false }).order('roi_pct', { ascending: false, nullsFirst: false })
  if (activeOnly) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cases: data })
}

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret !== process.env.CRON_SECRET) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data: cases } = await supabase.from('cases_data').select('id, market_hash_name, ev_total, key_price_usd')
  if (!cases?.length) return NextResponse.json({ updated: 0 })

  let updated = 0
  for (const c of cases) {
    const { data: item } = await supabase.from('items').select('price_usd, price_7d_avg, price_30d_avg, price_7d_change_pct, volume_24h').ilike('market_hash_name', c.market_hash_name).single()
    if (!item?.price_usd) continue

    const cost_per_open = item.price_usd + (c.key_price_usd ?? 2.49)
    const ev = c.ev_total ?? 0
    const roi_pct = cost_per_open > 0 ? ((ev - cost_per_open) / cost_per_open) * 100 : null

    await supabase.from('cases_data').update({ price_usd: item.price_usd, price_7d_avg: item.price_7d_avg, price_30d_avg: item.price_30d_avg, price_7d_change: item.price_7d_change_pct, volume_24h: item.volume_24h, roi_pct, break_even_case: Math.max(0, ev - (c.key_price_usd ?? 2.49)), updated_at: new Date().toISOString() }).eq('id', c.id)
    updated++
  }
  return NextResponse.json({ updated })
}
