import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // Get user's portfolio
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (!portfolio) return NextResponse.json({ error: 'No portfolio found' }, { status: 400 })

  // Accept two formats:
  // 1. Our bookmarklet format: { items: [{name, assetid}] }
  // 2. Raw Steam inventory JSON: { assets: [...], descriptions: [...] }
  // 3. Simple name list: { names: string[] }

  let items: { name: string; assetid?: string }[] = []

  if (body.items && Array.isArray(body.items)) {
    // Bookmarklet format
    items = body.items
  } else if (body.assets && body.descriptions) {
    // Raw Steam inventory JSON — merge assets + descriptions
    const descMap = new Map<string, Record<string, unknown>>()
    for (const d of (body.descriptions as Record<string, unknown>[])) {
      descMap.set(`${d.classid}_${d.instanceid}`, d)
    }
    for (const a of (body.assets as Record<string, string>[])) {
      const d = descMap.get(`${a.classid}_${a.instanceid}`)
      if (d?.marketable && d.market_hash_name) {
        items.push({ name: d.market_hash_name as string, assetid: a.assetid })
      }
    }
  }

  if (!items.length) return NextResponse.json({ error: 'No items found in payload', imported: 0 }, { status: 400 })

  // Look up prices from our items table
  const names = [...new Set(items.map(i => i.name))]
  const { data: priceRows } = await supabase
    .from('items')
    .select('id, market_hash_name, price_usd, condition')
    .in('market_hash_name', names.slice(0, 500))

  const priceMap = new Map<string, { id: string; price_usd: number | null; condition: string | null }>()
  for (const p of (priceRows || [])) priceMap.set(p.market_hash_name, { id: p.id, price_usd: p.price_usd, condition: p.condition })

  // Upsert holdings
  let imported = 0
  for (const item of items) {
    const price = priceMap.get(item.name)
    const condMatch = item.name.match(/[(](Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)[)]/)
    const condition = condMatch ? condMatch[1] : null
    const baseName = item.name.replace(/ [(][^)]+[)]$/, '')

    const { error } = await supabase.from('holdings').insert({
      portfolio_id: portfolio.id,
      user_id: user.id,
      item_id: price?.id ?? null,
      item_name: item.name,
      item_condition: condition,
      quantity: 1,
      cost_basis: price?.price_usd ?? 0,
      steam_asset_id: item.assetid ?? null,
    })
    if (!error) imported++
  }

  return NextResponse.json({ success: true, imported, total: items.length })
}