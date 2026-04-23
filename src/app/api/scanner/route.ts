import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = req.nextUrl.searchParams
  const cat = p.get('cat')
  const verdict = p.get('verdict')
  const minScore = parseInt(p.get('min_score') ?? '0')
  const minPrice = parseFloat(p.get('min_price') ?? '0')
  const maxPrice = parseFloat(p.get('max_price') ?? '999999')
  const minVol = parseInt(p.get('min_vol') ?? '0')
  const search = p.get('q')
  const sortBy = p.get('sort') ?? 'score_total'
  const limit = Math.min(500, parseInt(p.get('limit') ?? '100'))

  let query = supabase.from('scanner_cache').select('item_id, score_total, score_price_vs_avg, score_arb, score_volume, score_trend, score_float, signals, verdict, price_usd, arb_spread_pct, volume_24h, price_vs_7d_pct, price_vs_30d_pct, scored_at, item:items(id,market_hash_name,category,condition,is_stattrak,price_usd,price_steam,price_buff,price_skinport,arb_buy_market,arb_sell_market,arb_spread_pct,volume_24h,price_7d_change_pct,price_30d_change_pct)').gte('score_total', minScore).gte('price_usd', minPrice).lte('price_usd', maxPrice).limit(limit)
  if (cat && cat !== 'all') query = query.eq('item.category', cat)
  if (verdict && verdict !== 'all') query = query.eq('verdict', verdict)
  if (minVol > 0) query = query.gte('volume_24h', minVol)

  const sortMap = { score_total: {col:'score_total',asc:false}, arb_spread_pct: {col:'arb_spread_pct',asc:false}, price_usd: {col:'price_usd',asc:false}, volume_24h: {col:'volume_24h',asc:false} }
  const sort = sortMap[sortBy] ?? sortMap.score_total
  query = query.order(sort.col, { ascending: sort.asc, nullsFirst: false })

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let results = data ?? []
  if (search) { const q = search.toLowerCase(); results = results.filter((r: any) => r.item?.market_hash_name?.toLowerCase().includes(q)) }
  return NextResponse.json({ results, count: results.length })
}
