import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

// ── Helpers ───────────────────────────────────────────────────────────────────

const WEAR = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred']

function parseCondition(name: string): string | null {
  for (const w of WEAR) if (name.includes(w)) return w
  return null
}

function isStatTrak(name: string) {
  return name.includes('StatTrak')
}

function category(name: string): string {
  const n = name.toLowerCase()
  if (/\b(ak-47|m4a[14]|famas|galil|aug|sg 553|m249|negev|pp-bizon|mp5|mp7|mp9|mac-10|p90|ump-45)\b/.test(n)) return 'rifle'
  if (/\b(awp|ssg 08|scar-20|g3sg1)\b/.test(n)) return 'sniper'
  if (/\b(glock|usp|p2000|p250|five-seven|cz75|tec-9|r8|desert eagle|dual)\b/.test(n)) return 'pistol'
  if (/\b(knife|karambit|butterfly|bayonet|bowie|falchion|flip|gut|huntsman|m9|navaja|shadow|stiletto|talon|ursus|classic|nomad|paracord|skeleton|survival|daggers)\b/.test(n)) return 'knife'
  if (/\bgloves\b/.test(n)) return 'gloves'
  if (/\b(case|capsule|package|souvenir)\b/.test(n)) return 'case'
  if (/\bsticker\b/.test(n)) return 'sticker'
  if (/\bstorage unit\b/.test(n)) return 'storage_unit'
  return 'other'
}

function slug(name: string) {
  return name.toLowerCase().replace(/[★™]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const portfolio_id: string = body.portfolio_id
  const steam_id: string = body.steam_id

  if (!portfolio_id || !steam_id) {
    return NextResponse.json({ error: 'missing portfolio_id or steam_id' }, { status: 400 })
  }

  // Verify portfolio belongs to user
  const { data: pf } = await supabase
    .from('portfolios')
    .select('id')
    .eq('id', portfolio_id)
    .eq('user_id', user.id)
    .single()
  if (!pf) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })

  // Use official Steam Web API — works from Vercel, no IP blocks
  const apiKey = process.env.STEAM_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'STEAM_API_KEY not configured. Add it in Vercel → Settings → Environment Variables. Get it from https://steamcommunity.com/dev/apikey' },
      { status: 500 }
    )
  }

  const steamUrl =
    `https://api.steampowered.com/IEconService/GetInventoryItemsWithDescriptions/v1/` +
    `?key=${apiKey}&steamid=${steam_id}&appid=730&contextid=2&count=5000&language=english`

  let inv: any
  try {
    const res = await fetch(steamUrl, {
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    })
    if (!res.ok) return NextResponse.json({ error: `Steam API returned ${res.status}` }, { status: 502 })
    inv = await res.json()
  } catch (err: any) {
    return NextResponse.json({ error: `Steam fetch failed: ${err.message}` }, { status: 502 })
  }

  const response = inv?.response ?? inv
  const assets: any[] = response?.assets ?? []
  const descriptions: any[] = response?.descriptions ?? []

  if (!assets.length) {
    return NextResponse.json({ error: 'Inventory is empty or private. Make sure your Steam inventory is set to Public.' }, { status: 400 })
  }

  // Build description map
  const descMap = new Map<string, any>()
  for (const d of descriptions) {
    descMap.set(`${d.classid}_${d.instanceid}`, d)
  }

  const today = new Date().toISOString().slice(0, 10)
  const rows: any[] = []
  let skinsCount = 0
  let storageUnitsCount = 0
  let stackablesCount = 0

  // Track stackables to group them
  const stackableMap = new Map<string, { count: number; desc: any }>()

  for (const asset of assets) {
    const desc = descMap.get(`${asset.classid}_${asset.instanceid}`)
    if (!desc) continue
    if (!desc.marketable) continue

    const name: string = desc.market_hash_name ?? desc.name ?? ''
    const condition = parseCondition(name)
    const cat = category(name)
    const isStat = isStatTrak(name)

    if (cat === 'storage_unit') {
      // Each storage unit is its own row
      storageUnitsCount++
      rows.push({
        portfolio_id,
        user_id: user.id,
        item_id: slug(name) + '-' + (asset.assetid ?? asset.asset_id),
        item_name: name,
        item_condition: null,
        item_category: 'storage_unit',
        is_stattrak: false,
        quantity: 1,
        cost_basis: 0,
        acquired_at: today,
        steam_asset_id: asset.assetid ?? asset.asset_id ?? null,
        float_value: null,
        pattern_id: null,
        group_label: `Storage Unit #${storageUnitsCount}`,
        storage_unit: null,
      })
    } else if (condition) {
      // Individual skin
      skinsCount++
      rows.push({
        portfolio_id,
        user_id: user.id,
        item_id: slug(name) + '-' + (asset.assetid ?? asset.asset_id),
        item_name: name,
        item_condition: condition,
        item_category: cat,
        is_stattrak: isStat,
        quantity: 1,
        cost_basis: 0,
        acquired_at: today,
        steam_asset_id: asset.assetid ?? asset.asset_id ?? null,
        float_value: null,
        pattern_id: null,
        group_label: null,
        storage_unit: null,
      })
    } else {
      // Stackable (cases, capsules, stickers, etc.)
      const existing = stackableMap.get(name)
      if (existing) {
        existing.count++
      } else {
        stackableMap.set(name, { count: 1, desc })
      }
    }
  }

  // Add stacked rows
  for (const [name, { count, desc }] of stackableMap.entries()) {
    stackablesCount++
    rows.push({
      portfolio_id,
      user_id: user.id,
      item_id: slug(name),
      item_name: name,
      item_condition: null,
      item_category: category(name),
      is_stattrak: isStatTrak(name),
      quantity: count,
      cost_basis: 0,
      acquired_at: today,
      steam_asset_id: null,
      float_value: null,
      pattern_id: null,
      group_label: null,
      storage_unit: null,
    })
  }

  // Replace holdings
  const { error: deleteErr } = await supabase
    .from('holdings')
    .delete()
    .eq('portfolio_id', portfolio_id)
    .eq('user_id', user.id)

  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No marketable items found in inventory' }, { status: 400 })
  }

  const { error: insertErr } = await supabase.from('holdings').insert(rows)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({
    imported: rows.length,
    skins: skinsCount,
    storage_units: storageUnitsCount,
    stackables: stackablesCount,
    floats_fetched: 0,
  })
}
