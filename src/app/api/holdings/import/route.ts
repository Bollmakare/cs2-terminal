import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const CSFLOAT_API_KEY = process.env.CSFLOAT_API_KEY

// Wear conditions — items with these are individual skins (keep one row per asset for float tracking)
const WEAR_CONDITIONS = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred']

function hasWearCondition(name: string): boolean {
  return WEAR_CONDITIONS.some(c => name.includes(c))
}

// Storage Units are unique containers — keep individual rows so user can label/track each one
function isStorageUnit(name: string): boolean {
  return name === 'Storage Unit'
}

// Build a full inspect link from the template stored in Steam descriptions
function buildInspectLink(linkTemplate: string, steamId: string, assetId: string): string {
  return linkTemplate
    .replace('%owner_steamid%', steamId)
    .replace('%assetid%', assetId)
}

// Fetch float + pattern from CSFloat API for one item
async function fetchFloat(inspectLink: string): Promise<{ float_value: number | null; pattern_id: number | null }> {
  if (!CSFLOAT_API_KEY || !inspectLink) return { float_value: null, pattern_id: null }
  try {
    const url = `https://api.csgofloat.com/?url=${encodeURIComponent(inspectLink)}`
    const res = await fetch(url, {
      headers: { Authorization: CSFLOAT_API_KEY },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { float_value: null, pattern_id: null }
    const data = await res.json()
    return {
      float_value: data.iteminfo?.floatvalue ?? null,
      pattern_id: data.iteminfo?.paintseed ?? null,
    }
  } catch {
    return { float_value: null, pattern_id: null }
  }
}

async function fetchFloatsBatched(
  inspectLinks: (string | null)[],
  batchSize = 4,
  delayMs = 300
): Promise<{ float_value: number | null; pattern_id: number | null }[]> {
  const results: { float_value: number | null; pattern_id: number | null }[] = []
  for (let i = 0; i < inspectLinks.length; i += batchSize) {
    const batch = inspectLinks.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(link => link ? fetchFloat(link) : Promise.resolve({ float_value: null, pattern_id: null }))
    )
    results.push(...batchResults)
    if (i + batchSize < inspectLinks.length) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  return results
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (!portfolio) return NextResponse.json({ error: 'No portfolio found' }, { status: 400 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('steam_id')
    .eq('id', user.id)
    .single()

  const steamId: string = body.steamId ?? profile?.steam_id ?? ''

  // Parse incoming items
  type RawItem = { name: string; assetid?: string; inspectLink?: string }
  let rawItems: RawItem[] = []

  if (body.items && Array.isArray(body.items)) {
    rawItems = body.items
  } else if (body.assets && body.descriptions) {
    const descMap = new Map<string, { market_hash_name: string; inspectTemplate?: string }>()
    for (const d of body.descriptions) {
      const inspectAction = (d.actions as Array<{ link: string; name: string }> | undefined)
        ?.find(a => a.name?.includes('Inspect'))
      descMap.set(`${d.classid}_${d.instanceid}`, {
        market_hash_name: d.market_hash_name,
        inspectTemplate: inspectAction?.link,
      })
    }
    for (const asset of body.assets) {
      const key = `${asset.classid}_${asset.instanceid}`
      const desc = descMap.get(key)
      if (desc?.market_hash_name) {
        const inspectLink =
          desc.inspectTemplate && steamId && asset.assetid
            ? buildInspectLink(desc.inspectTemplate, steamId, asset.assetid)
            : undefined
        rawItems.push({ name: desc.market_hash_name, assetid: asset.assetid, inspectLink })
      }
    }
  } else if (body.names && Array.isArray(body.names)) {
    rawItems = body.names.map((name: string) => ({ name }))
  }

  if (rawItems.length === 0) {
    return NextResponse.json({ error: 'No items found in payload' }, { status: 400 })
  }

  // --- GROUPING LOGIC ---
  // Individual items: skins with wear conditions (track float per asset) + storage units (unique containers)
  // Stackable items: everything else (cases, capsules, stickers, coins…) → merge into one row per name
  const individualItems: RawItem[] = []
  const stackableMap = new Map<string, number>() // name → count

  for (const item of rawItems) {
    if (hasWearCondition(item.name) || isStorageUnit(item.name)) {
      individualItems.push(item)
    } else {
      stackableMap.set(item.name, (stackableMap.get(item.name) ?? 0) + 1)
    }
  }

  // DELETE existing Steam-imported holdings
  await supabase
    .from('holdings')
    .delete()
    .eq('portfolio_id', portfolio.id)
    .eq('user_id', user.id)
    .not('steam_asset_id', 'is', null)

  // Look up prices from items table
  const allNames = [...new Set(rawItems.map(i => i.name))]
  const { data: itemsData } = await supabase
    .from('items')
    .select('id, market_hash_name, price_usd, category, condition')
    .in('market_hash_name', allNames)
  const itemMap = new Map(itemsData?.map(i => [i.market_hash_name, i]) ?? [])

  // Fetch floats only for individual skin items (not storage units or stackables)
  const skinItems = individualItems.filter(i => hasWearCondition(i.name))
  const skinInspectLinks = skinItems.map(i => i.inspectLink ?? null)
  const hasInspectLinks = skinInspectLinks.some(l => l !== null)
  const floatData = hasInspectLinks
    ? await fetchFloatsBatched(skinInspectLinks)
    : skinInspectLinks.map(() => ({ float_value: null, pattern_id: null }))

  const rows: Record<string, unknown>[] = []

  // Add individual skin rows (one per asset, with float data)
  skinItems.forEach((item, idx) => {
    const match = itemMap.get(item.name)
    const nameLower = item.name.toLowerCase()
    const condition =
      nameLower.includes('factory new') ? 'Factory New' :
      nameLower.includes('minimal wear') ? 'Minimal Wear' :
      nameLower.includes('field-tested') ? 'Field-Tested' :
      nameLower.includes('well-worn') ? 'Well-Worn' :
      nameLower.includes('battle-scarred') ? 'Battle-Scarred' : null
    rows.push({
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
      float_value: floatData[idx]?.float_value ?? null,
      pattern_id: floatData[idx]?.pattern_id ?? null,
    })
  })

  // Add storage unit rows (one per asset, no float)
  const storageUnits = individualItems.filter(i => isStorageUnit(i.name))
  let suIndex = 1
  for (const item of storageUnits) {
    const match = itemMap.get(item.name)
    rows.push({
      portfolio_id: portfolio.id,
      user_id: user.id,
      item_id: match?.id ?? null,
      item_name: item.name,
      item_condition: null,
      item_category: 'storage_unit',
      is_stattrak: false,
      quantity: 1,
      cost_basis: 0,
      last_price: match?.price_usd ?? null,
      steam_asset_id: item.assetid ?? null,
      float_value: null,
      pattern_id: null,
      group_label: `Storage Unit #${suIndex++}`,
    })
  }

  // Add stackable rows (grouped, quantity = count)
  for (const [name, qty] of stackableMap) {
    const match = itemMap.get(name)
    rows.push({
      portfolio_id: portfolio.id,
      user_id: user.id,
      item_id: match?.id ?? null,
      item_name: name,
      item_condition: null,
      item_category: match?.category ?? null,
      is_stattrak: name.toLowerCase().includes('stattrak'),
      quantity: qty,
      cost_basis: 0,
      last_price: match?.price_usd ?? null,
      steam_asset_id: null, // grouped — no single asset_id
      float_value: null,
      pattern_id: null,
    })
  }

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
    total: rawItems.length,
    skins: skinItems.length,
    storageUnits: storageUnits.length,
    stackableGroups: stackableMap.size,
    withFloats: floatData.filter(f => f.float_value !== null).length,
  })
}
