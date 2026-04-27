import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // Get user's default portfolio
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (!portfolio) return NextResponse.json({ error: 'No portfolio found' }, { status: 400 })

  // Accept three formats:
  // 1. Bookmarklet format: { items: [{name, assetid}] }
  // 2. Raw Steam inventory JSON: { assets: [...], descriptions: [...] }
  // 3. Simple name list: { names: string[] }

  let items: { name: string; assetid?: string }[] = []

  if (body.items && Array.isArray(body.items)) {
    items = body.items
  } else if (body.assets && body.descriptions) {
    // Raw Steam inventory JSON — merge assets + descriptions
    const descMap = new Map<string, { market_hash_name: string }>()
    for (const d of body.descriptions) {
      descMap.set(`${d.classid}_${d.instanceid}`, d)
    }
    for (const asset of body.assets) {
      const key = `${asset.classid}_${asset.instanceid}`
      const desc = descMap.get(key)
      if (desc?.market_hash_name) {
        items.push({ name: desc.market_hash_name, assetid: asset.assetid })
      }
    }
  } else if (body.names && Array.isArray(body.names)) {
    items = body.names.map((name: string) => ({ name }))
  }

  if (items.length === 0) {
    return NextResponse.json({ error: 'No items found in payload' }, { status: 400 })
  }

  // DELETE existing Steam-imported holdings for this portfolio
  // (keeps manually added items which have no steam_asset_id)
  await supabase
    .from('holdings')
    .delete()
    .eq('portfolio_id', portfolio.id)
    .eq('user_id', user.id)
    .not('steam_asset_id', 'is', null)

  // Look up prices from items table
  const names = items.map(i => i.name)
  const { data: itemsData } = await supabase
    .from('items')
    .select('id, market_hash_name, price_usd, category, condition')
    .in('market_hash_name', names)

  const itemMap = new Map(itemsData?.map(i => [i.market_hash_name, i]) ?? [])

  // Build holdings rows
  const rows = items.map(item => {
    const match = itemMap.get(item.name)
    const nameLower = item.name.toLowerCase()
    const condition = nameLower.includes('factory new') ? 'Factory New'
      : nameLower.includes('minimal wear') ? 'Minimal Wear'
      : nameLower.includes('field-tested') ? 'Field-Tested'
      : nameLower.includes('well-worn') ? 'Well-Worn'
      : nameLower.includes('battle-scarred') ? 'Battle-Scarred'
      : null
    return {
      portfolio_id: portfolio.id,
      user_id: user.id,
      item_id: match?.id ?? null,
      item_name: item.name,
      item_condition: condition,
      item_category: match?.category ?? null,
      is_stattrak: item.name.toLowerCase().includes('stattrak'),
      quantity: 1,
      cost_basis: 0,
      last_price: match?.price_usd ?? null,
      steam_asset_id: item.assetid ?? null,
    }
  })

  const { data: inserted, error } = await supabase
    .from('holdings')
    .insert(rows)
    .select('id')

  if (error) {
    console.error('Import error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    imported: inserted?.length ?? 0,
    total: items.length,
  })
}
