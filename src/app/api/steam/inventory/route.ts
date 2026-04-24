import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSteamInventory } from '@/lib/api/steam'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const steamId = req.nextUrl.searchParams.get('steam_id')
  if (!steamId) return NextResponse.json({ error: 'steam_id required' }, { status: 400 })

  try {
    const items = await getSteamInventory(steamId)
    return NextResponse.json({ items, count: items.length, steam_id: steamId })
  } catch (err) {
    const msg = err.message
    return NextResponse.json({ error: msg, code: msg.includes('429') ? 'RATE_LIMITED' : msg.includes('private') ? 'PRIVATE' : 'ERROR' }, { status: msg.includes('429') ? 429 : 400 })
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { steam_id, portfolio_id, items: selItems } = await req.json()
  if (!steam_id || !portfolio_id) return NextResponse.json({ error: 'steam_id and portfolio_id required' }, { status: 400 })

  const { data: pf } = await supabase.from('portfolios').select('id').eq('id', portfolio_id).eq('user_id', user.id).single()
  if (!pf) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })

  const items = selItems ?? await getSteamInventory(steam_id)
  const today = new Date().toISOString().slice(0, 10)
  const slug = (name) => name.toLowerCase().replace(/[|]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const rows = items.filter(it => it.marketable).map(it => ({ portfolio_id, user_id: user.id, item_id: slug(it.market_hash_name), item_name: it.item_name, item_condition: it.condition, item_category: it.category, is_stattrak: it.is_stattrak, quantity: 1, cost_basis: 0, acquired_at: today, steam_asset_id: it.asset_id }))
  const { data: ins, error } = await supabase.from('holdings').insert(rows).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ imported: ins?.length ?? 0, total: items.length })
}
