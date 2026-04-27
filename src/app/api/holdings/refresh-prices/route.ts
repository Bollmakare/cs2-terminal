import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SKINSTRACK_BASE = 'https://api.skinstrack.com/v1'
const SKINSTRACK_KEY = process.env.SKINSTRACK_API_KEY ?? ''

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!SKINSTRACK_KEY) {
    return NextResponse.json({ error: 'SKINSTRACK_API_KEY not configured', updated: 0 })
  }

  // Get all user holdings
  const { data: holdings, error: hErr } = await supabase
    .from('holdings')
    .select('id, item_name')
    .eq('user_id', user.id)

  if (hErr || !holdings?.length) {
    return NextResponse.json({ updated: 0 })
  }

  // Fetch all prices from Skinstrack
  let prices: { market_hash_name: string; price_usd: number }[] = []
  try {
    const r = await fetch(`${SKINSTRACK_BASE}/prices?limit=10000`, {
      headers: { 'x-api-key': SKINSTRACK_KEY },
      next: { revalidate: 300 },
    })
    if (r.ok) prices = await r.json()
  } catch (e) {
    console.error('Skinstrack fetch failed:', e)
    return NextResponse.json({ error: 'Price fetch failed', updated: 0 }, { status: 502 })
  }

  const priceMap = new Map(prices.map(p => [p.market_hash_name, p.price_usd]))

  // Build updates for matched holdings
  const now = new Date().toISOString()
  const updates = holdings
    .filter(h => priceMap.has(h.item_name))
    .map(h => ({
      id: h.id,
      last_price: priceMap.get(h.item_name)!,
      price_source: 'skinstrack',
      price_updated_at: now,
    }))

  if (!updates.length) {
    return NextResponse.json({ updated: 0, total: holdings.length, message: 'No Skinstrack matches found' })
  }

  // Update matched holdings
  const { error: uErr } = await supabase
    .from('holdings')
    .upsert(updates, { onConflict: 'id' })

  if (uErr) {
    console.error('Holdings price update error:', uErr)
    return NextResponse.json({ error: uErr.message }, { status: 500 })
  }

  return NextResponse.json({ updated: updates.length, total: holdings.length })
}
