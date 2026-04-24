import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pid = req.nextUrl.searchParams.get('portfolio_id')
  if (!pid) return NextResponse.json({ error: 'portfolio_id required' }, { status: 400 })

  const { data: holdings, error: hErr } = await supabase
    .from('holdings')
    .select('*, item:items(price_usd,price_buff,price_steam,price_skinport,price_7d_avg,price_30d_avg,price_7d_change_pct,price_30d_change_pct,volume_24h,arb_spread_pct,arb_sell_market,buff_buy_order,category), scanner:scanner_cache(score_total)')
    .eq('portfolio_id', pid)
    .eq('user_id', user.id)
  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 })

  const today = new Date(); today.setHours(0,0,0,0)
  const until = new Date(today); until.setDate(until.getDate() + 60)
  const { data: events } = await supabase.from('market_events').select('event_type,title,starts_at,ends_at,expected_impact,affected_categories,impact_magnitude,is_confirmed').gte('starts_at', today.toISOString().slice(0,10)).lte('starts_at', until.toISOString().slice(0,10)).in('expected_impact',['bearish','mixed']).order('starts_at',{ascending:true})

  const upcoming = (events ?? []).map(e => ({ event_type: e.event_type, title: e.title, days_until: Math.ceil((new Date(e.starts_at).getTime()-today.getTime())/86400000), expected_impact: e.expected_impact, affected_categories: e.affected_categories??[], impact_magnitude: e.impact_magnitude??1, is_confirmed: e.is_confirmed??false }))

  import('@/lib/signals/sell').then(({ computeSellSignal }) => {
    const signals = (holdings ?? []).filter(h => h.cost_basis > 0).map(h => {
      const item = h.item ?? {}
      const signal = computeSellSignal({ ...h, last_price: item.price_usd }, { ...item }, upcoming)
      return { holding_id: h.id, item_name: h.item_name, quantity: h.quantity, last_price: h.last_price, ...signal }
    }).filter(s => s.urgency !== 'none').sort((a,b) => b.sell_score-a.sell_score)
    return NextResponse.json({ signals, total: signals.length })
  })
}
