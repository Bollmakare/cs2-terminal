import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { names } = await req.json()
  if (!names || !Array.isArray(names)) return NextResponse.json({ error: 'names array required' }, { status: 400 })

  const { data: items } = await supabase
    .from('items')
    .select('id, market_hash_name, price_usd, price_buff, price_steam, arb_spread_pct')
    .in('market_hash_name', names.slice(0, 500))

  return NextResponse.json({ items: items || [] })
}