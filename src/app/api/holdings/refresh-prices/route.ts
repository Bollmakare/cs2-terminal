import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SKINSTRACK_BASE = 'https://api.skinstrack.com/v1'
const SKINSTRACK_KEY = process.env.SKINSTRACK_API_KEY ?? ''

// Fetch price for a single item by exact market_hash_name
async function fetchItemPrice(name: string): Promise<number | null> {
  if (!SKINSTRACK_KEY) return null
  try {
    const r = await fetch(`${SKINSTRACK_BASE}/item?name=${encodeURIComponent(name)}`, {
      headers: { 'x-api-key': SKINSTRACK_KEY },
      // No cache here — we want fresh prices each time
      cache: 'no-store',
    })
    if (!r.ok) return null
    const data = await r.json()
    // Response is the item object directly: { market_hash_name, price_usd, ... }
    return data?.price_usd ?? null
  } catch {
    return null
  }
}

export async function POST() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!SKINSTRACK_KEY) {
    return NextResponse.json({ error: 'SKINSTRACK_API_KEY not configured', updated: 0 })
  }

  // Get all user holdings
  const { data: holdings } = await supabase
    .from('holdings')
    .select('id, item_name')
    .eq('user_id', user.id)

  if (!holdings?.length) return NextResponse.json({ updated: 0 })

  // Fetch price per item — batch 5 at a time with small delay
  const BATCH = 5
  const DELAY = 200
  const now = new Date().toISOString()
  const updates: { id: string; last_price: number; price_source: string; price_updated_at: string }[] = []

  for (let i = 0; i < holdings.length; i += BATCH) {
    const batch = holdings.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(h => fetchItemPrice(h.item_name)))
    for (let j = 0; j < batch.length; j++) {
      const price = results[j]
      if (price !== null && price > 0) {
        updates.push({
          id: batch[j].id,
          last_price: price,
          price_source: 'skinstrack',
          price_updated_at: now,
        })
      }
    }
    if (i + BATCH < holdings.length) {
      await new Promise(r => setTimeout(r, DELAY))
    }
  }

  if (!updates.length) {
    return NextResponse.json({
      updated: 0,
      total: holdings.length,
      message: `No prices found for ${holdings.length} items`,
    })
  }

  const { error } = await supabase.from('holdings').upsert(updates, { onConflict: 'id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ updated: updates.length, total: holdings.length })
}
