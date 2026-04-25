import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ items: [] })

  // First try our DB
  const { data: dbItems } = await supabase
    .from('items')
    .select('id, market_hash_name, price_usd, icon_url')
    .ilike('market_hash_name', `%${q}%`)
    .order('price_usd', { ascending: false, nullsFirst: false })
    .limit(20)

  if (dbItems && dbItems.length >= 3) {
    return NextResponse.json({ items: dbItems.map(i => ({
      market_hash_name: i.market_hash_name,
      icon_url: i.icon_url,
      price_usd: i.price_usd,
      item_id: i.id,
      source: 'db'
    })) })
  }

  // Fallback: Steam Market search
  try {
    const url = `https://steamcommunity.com/market/search/render/?appid=730&search_description=0&sort_column=default&sort_dir=desc&start=0&count=20&query=${encodeURIComponent(q)}&format=json`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CS2Terminal/1.0)' },
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) throw new Error('Steam market unreachable')
    const data = await res.json()
    const items = (data.results || []).map((r: Record<string, unknown>) => {
      const desc = r.asset_description as Record<string, unknown>
      return {
        market_hash_name: r.hash_name as string,
        icon_url: desc?.icon_url as string,
        price_usd: r.sell_price ? Number(r.sell_price) / 100 : null,
        item_id: null,
        source: 'steam'
      }
    })
    return NextResponse.json({ items })
  } catch {
    // Return what we have from DB even if < 3
    return NextResponse.json({ items: (dbItems || []).map(i => ({
      market_hash_name: i.market_hash_name,
      icon_url: i.icon_url,
      price_usd: i.price_usd,
      item_id: i.id,
      source: 'db'
    })) })
  }
}