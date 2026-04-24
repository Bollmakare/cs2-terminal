import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const steamId = req.nextUrl.searchParams.get('steam_id')
  if (!steamId) return NextResponse.json({ error: 'steam_id required' }, { status: 400 })

  const apiKey = process.env.STEAM_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      error: 'STEAM_API_KEY not configured. Get a free key at https://steamcommunity.com/dev/apikey and add it to Vercel.',
      code: 'NO_API_KEY'
    }, { status: 503 })
  }

  try {
    const res = await fetch(
      `https://api.steampowered.com/IEconService/GetInventoryItemsWithDescriptions/v1/?steamid=${steamId}&appid=730&contextid=2&count=5000&key=${apiKey}`,
      { headers: { 'User-Agent': 'Valve/Steam HTTP Client 1.0' } }
    )

    if (res.status === 403) {
      return NextResponse.json({ error: 'Inventory is private. Set to Public in Steam Privacy Settings.', code: 'PRIVATE' }, { status: 400 })
    }
    if (!res.ok) {
      return NextResponse.json({ error: 'Steam API error: ' + res.status }, { status: 400 })
    }

    const json = await res.json()
    const assets: Record<string, string>[] = json.response?.assets || []
    const descriptions: Record<string, unknown>[] = json.response?.descriptions || []

    if (!assets.length) return NextResponse.json({ items: [], count: 0, steam_id: steamId })

    const descMap = new Map<string, Record<string, unknown>>()
    for (const d of descriptions) descMap.set(`${d.classid}_${d.instanceid}`, d)

    const marketNames = [...new Set(
      assets.map(a => {
        const d = descMap.get(`${a.classid}_${a.instanceid}`)
        return (d?.marketable === 1 || d?.marketable === '1') ? d.market_hash_name as string : null
      }).filter(Boolean) as string[]
    )]

    const { data: prices } = await supabase
      .from('items')
      .select('id, market_hash_name, price_usd')
      .in('market_hash_name', marketNames.slice(0, 500))

    const priceMap = new Map<string, { id: string; price_usd: number | null }>()
    for (const p of (prices || [])) priceMap.set(p.market_hash_name, { id: p.id, price_usd: p.price_usd })

    const items = assets.map(asset => {
      const desc = descMap.get(`${asset.classid}_${asset.instanceid}`)
      if (!desc?.market_hash_name) return null
      const name = desc.market_hash_name as string
      const price = priceMap.get(name)
      return {
        assetid: asset.assetid,
        market_hash_name: name,
        icon_url: desc.icon_url,
        tradable: Number(desc.tradable),
        marketable: Number(desc.marketable),
        price_usd: price?.price_usd ?? null,
        item_id: price?.id ?? null,
      }
    }).filter(Boolean)

    return NextResponse.json({ items, count: items.length, steam_id: steamId })
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}