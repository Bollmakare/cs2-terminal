import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = createClient()
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

  // Try CSFloat bulk prices first (uses CSFLOAT_API_KEY if set)
  let priceMap: Record<string, number> = {}
  const csFloatKey = process.env.CSFLOAT_API_KEY

  if (csFloatKey) {
    try {
      const res = await fetch('https://csfloat.com/api/v0/meta/prices', {
        headers: { Authorization: csFloatKey },
        signal: AbortSignal.timeout(15000),
      })
      if (res.ok) {
        const data = await res.json()
        // CSFloat returns { [market_hash_name]: { price: number (cents) } }
        for (const [name, info] of Object.entries(data as Record<string, any>)) {
          const price = (info?.price ?? info?.median ?? 0) / 100
          if (price > 0) priceMap[name] = price
        }
      }
    } catch {}
  }

  // Fall back to Steam Market API for any missing items (or all if no CSFloat key)
  const missing = uniqueNames.filter(n => !priceMap[n])
  for (const name of missing.slice(0, 30)) {
    try {
      const url = `https://steamcommunity.com/market/priceoverview/?currency=1&appid=730&market_hash_name=${encodeURIComponent(name)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (res.ok) {
        const d = await res.json()
        const price = parseFloat((d.median_price ?? d.lowest_price ?? '0').replace(/[^0-9.]/g, ''))
        if (price > 0) priceMap[name] = price
      }
      // Steam rate limit: 1 req/sec
      await new Promise(r => setTimeout(r, 1100))
    } catch {}
  }

  // Update holdings + store price history
  const today = new Date().toISOString().slice(0, 10)
  let updated = 0

  for (const holding of holdings) {
    const price = priceMap[holding.item_name]
    if (!price) continue

    await supabase.from('holdings').update({ current_price: price }).eq('id', holding.id)

    // Upsert into price_history (one record per item per day)
    await supabase.from('price_history').upsert(
      { item_name: holding.item_name, price, fetched_at: today },
      { onConflict: 'item_name,fetched_at' }
    )
    updated++
  }

  return NextResponse.json({ updated, total: holdings.length })
}
