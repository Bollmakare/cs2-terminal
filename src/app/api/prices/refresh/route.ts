import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { body = {} }

  const portfolio_id: string = body?.portfolio_id
  if (!portfolio_id) return NextResponse.json({ error: 'missing portfolio_id' }, { status: 400 })

  const { data: holdings, error: holdingsErr } = await supabase
    .from('holdings')
    .select('id, item_name')
    .eq('portfolio_id', portfolio_id)
    .eq('user_id', user.id)

  if (holdingsErr) return NextResponse.json({ error: holdingsErr.message }, { status: 500 })
  if (!holdings?.length) return NextResponse.json({ updated: 0, total: 0 })

  const uniqueNames = [...new Set(holdings.map(h => h.item_name))]
  let priceMap: Record<string, number> = {}

  // 1) Try CSFloat bulk prices (fast, no rate limit)
  const csFloatKey = process.env.CSFLOAT_API_KEY
  if (csFloatKey) {
    try {
      const res = await fetch('https://csfloat.com/api/v0/meta/prices', {
        headers: { Authorization: csFloatKey },
        signal: AbortSignal.timeout(15000),
      })
      if (res.ok) {
        const data = await res.json()
        for (const [name, info] of Object.entries(data as Record<string, any>)) {
          const price = (info?.price ?? info?.median ?? 0) / 100
          if (price > 0) priceMap[name] = price
        }
      }
    } catch {}
  }

  // 2) Fall back to csgotrader price list (free static file, no auth, no IP blocks)
  if (Object.keys(priceMap).length === 0) {
    try {
      const res = await fetch('https://prices.csgotrader.app/latest/prices_v7.json', {
        signal: AbortSignal.timeout(20000),
        cache: 'no-store',
      })
      if (res.ok) {
        const data: Record<string, any> = await res.json()
        for (const name of uniqueNames) {
          const entry = data[name]
          if (!entry) continue
          const price =
            entry?.steam?.last_7d ??
            entry?.steam?.last_24h ??
            entry?.steam?.last_30d ??
            0
          if (price > 0) priceMap[name] = price
        }
      }
    } catch {}
  }

  // Update holdings with last_price
  const today = new Date().toISOString().slice(0, 10)
  let updated = 0

  for (const holding of holdings) {
    const price = priceMap[holding.item_name]
    if (!price) continue

    await supabase
      .from('holdings')
      .update({ last_price: price, price_updated_at: new Date().toISOString() })
      .eq('id', holding.id)

    // Store price history (one record per item per day)
    await supabase.from('price_history').upsert(
      { item_name: holding.item_name, price, fetched_at: today },
      { onConflict: 'item_name,fetched_at' }
    )

    updated++
  }

  return NextResponse.json({ updated, total: holdings.length })
}
