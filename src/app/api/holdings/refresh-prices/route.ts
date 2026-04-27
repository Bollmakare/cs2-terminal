import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

const SKINSTRACK_BASE = 'https://api.skinstrack.com'

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchItemPrice(name: string): Promise<number | null> {
  const key = process.env.SKINSTRACK_API_KEY
  if (!key) return null

  try {
    const encoded = encodeURIComponent(name)
    const res = await fetch(`${SKINSTRACK_BASE}/v1/prices/${encoded}?currency=USD`, {
      headers: { 'x-api-key': key },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()

    return (
      data?.price_usd ??
      data?.best_buy_price ??
      data?.steam_price ??
      data?.skinport_price ??
      null
    )
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { portfolio_id } = await req.json()
  if (!portfolio_id) return NextResponse.json({ error: 'portfolio_id required' }, { status: 400 })

  const { data: pf } = await supabase
    .from('portfolios')
    .select('id')
    .eq('id', portfolio_id)
    .eq('user_id', user.id)
    .single()
  if (!pf) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })

  const { data: holdings, error } = await supabase
    .from('holdings')
    .select('id, item_name')
    .eq('portfolio_id', portfolio_id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!holdings?.length) return NextResponse.json({ updated: 0 })

  let updated = 0
  let failed  = 0

  const BATCH = 5
  for (let i = 0; i < holdings.length; i += BATCH) {
    const batch = holdings.slice(i, i + BATCH)

    await Promise.all(batch.map(async (h) => {
      const price = await fetchItemPrice(h.item_name)
      if (price == null) { failed++; return }

      const { error: upErr } = await supabase
        .from('holdings')
        .update({ last_price: price })
        .eq('id', h.id)
        .eq('user_id', user.id)

      if (!upErr) updated++
      else failed++
    }))

    if (i + BATCH < holdings.length) await sleep(200)
  }

  return NextResponse.json({ updated, failed, total: holdings.length })
}
