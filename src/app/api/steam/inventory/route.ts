import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const steamId = req.nextUrl.searchParams.get('steam_id')
  if (!steamId) return NextResponse.json({ error: 'steam_id required' }, { status: 400 })

  try {
    // Fetch from Steam Community inventory API (no key needed, must be public)
    let allAssets: Record<string, string>[] = []
    let allDescriptions: Record<string, unknown>[] = []
    let lastAssetId: string | undefined
    let more = true

    while (more) {
      const url = `https://steamcommunity.com/inventory/${steamId}/730/2?l=english&count=5000${lastAssetId ? '&start_assetid=' + lastAssetId : ''}`
      const res = await fetch(url, { headers: { 'User-Agent': 'CS2-Terminal/1.0' }, next: { revalidate: 60 } })

      if (res.status === 403) return NextResponse.json({ error: 'Inventory is private. Set it to Public in Steam Privacy Settings.', code: 'PRIVATE' }, { status: 400 })
      if (!res.ok) return NextResponse.json({ error: 'Steam API error: ' + res.status, code: 'ERROR' }, { status: 400 })

      const data = await res.json()
      if (!data.assets || !data.descriptions) break

      allAssets = [...allAssets, ...data.assets]
      allDescriptions = [...allDescriptions, ...data.descriptions]

      if (data.more && data.last_assetid) {
        lastAssetId = data.last_assetid
      } else {
        more = false
      }
    }

    // Build a lookup map from classid+instanceid -> description
    const descMap = new Map<string, Record<string, unknown>>()
    for (const d of allDescriptions) {
      const key = `${d.classid}_${d.instanceid}`
      descMap.set(key, d)
    }

    // Get prices from our items table
    const marketNames = [...new Set(allDescriptions
      .filter((d: Record<string, unknown>) => d.marketable === 1)
      .map((d: Record<string, unknown>) => d.market_hash_name as string)
    )]

    const { data: prices } = await supabase
      .from('items')
      .select('id, market_hash_name, price_usd')
      .in('market_hash_name', marketNames.slice(0, 500))

    const priceMap = new Map<string, { id: string; price_usd: number | null }>()
    for (const p of (prices || [])) {
      priceMap.set(p.market_hash_name, { id: p.id, price_usd: p.price_usd })
    }

    // Merge assets with descriptions and prices
    const items = allAssets.map((asset: Record<string, string>) => {
      const desc = descMap.get(`${asset.classid}_${asset.instanceid}`) as Record<string, unknown> | undefined
      if (!desc || !desc.market_hash_name) return null
      const price = priceMap.get(desc.market_hash_name as string)
      return {
        assetid: asset.assetid,
        market_hash_name: desc.market_hash_name,
        icon_url: desc.icon_url,
        tradable: desc.tradable,
        marketable: desc.marketable,
        tags: desc.tags,
        price_usd: price?.price_usd ?? null,
        item_id: price?.id ?? null,
      }
    }).filter(Boolean)

    return NextResponse.json({ items, count: items.length, steam_id: steamId })
  } catch (err: unknown) {
    const msg = (err as Error).message || 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
