import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

const WEAR = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred']

function parseCondition(name: string): string | null {
  for (const w of WEAR) if (name.includes(w)) return w
  return null
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
  return name.toLowerCase().replace(/[★]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function processInventory(inv: any, portfolio_id: string, user_id: string) {
  const response = inv?.response ?? inv
  const assets: any[] = response?.assets ?? []
  const descriptions: any[] = response?.descriptions ?? []

  if (!assets.length) return null

  const descMap = new Map<string, any>()
  for (const d of descriptions) descMap.set(`${d.classid}_${d.instanceid}`, d)

  const today = new Date().toISOString().slice(0, 10)
  const rows: any[] = []
  let skinsCount = 0
  const stackableMap = new Map<string, number>()

  for (const asset of assets) {
    const desc = descMap.get(`${asset.classid}_${asset.instanceid}`)
    if (!desc || !desc.marketable) continue

    const name: string = desc.market_hash_name ?? desc.name ?? ''
    const condition = parseCondition(name)
    const cat = category(name)
    const assetId = asset.assetid ?? asset.asset_id ?? null

    if (cat === 'storage_unit') continue

    if (condition) {
      skinsCount++
      rows.push({
        portfolio_id, user_id,
        item_id: null,
        item_name: name, item_condition: condition,
        item_category: cat, is_stattrak: name.includes('StatTrak'),
        quantity: 1, cost_basis: 0, acquired_at: today,
        steam_asset_id: assetId, float_value: null, pattern_id: null,
        group_label: null, storage_unit: null,
      })
    } else {
      stackableMap.set(name, (stackableMap.get(name) ?? 0) + 1)
    }
  }

  for (const [name, count] of stackableMap.entries()) {
    rows.push({
      portfolio_id, user_id,
      item_id: null, item_name: name, item_condition: null,
      item_category: category(name), is_stattrak: name.includes('StatTrak'),
      quantity: count, cost_basis: 0, acquired_at: today,
      steam_asset_id: null, float_value: null, pattern_id: null,
      group_label: null, storage_unit: null,
    })
  }

  return { rows, skinsCount, stackablesCount: stackableMap.size }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const portfolio_id: string = body?.portfolio_id
  if (!portfolio_id) return NextResponse.json({ error: 'missing portfolio_id' }, { status: 400 })

  const { data: pf } = await supabase
    .from('portfolios').select('id')
    .eq('id', portfolio_id).eq('user_id', user.id).single()
  if (!pf) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })

  let inv: any

  if (body.steam_id) {
    // ── Mode 1: fetch directly from Steam Community (no API key needed) ──
    const steamUrl = `https://steamcommunity.com/inventory/${body.steam_id}/730/2?l=english&count=5000`
    try {
      const res = await fetch(steamUrl, {
        signal: AbortSignal.timeout(20000),
        cache: 'no-store',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://steamcommunity.com/',
        },
      })
      if (res.status === 403) return NextResponse.json({ error: 'Steam inventory is set to Private. Go to Steam → Privacy Settings → set Inventory to Public.' }, { status: 400 })
      if (res.status === 400) return NextResponse.json({ error: 'Steam blocked this request (IP restriction). Use the Paste JSON tab instead: open https://steamcommunity.com/inventory/' + body.steam_id + '/730/2?l=english&count=5000 in your browser, press Ctrl+A then Ctrl+C, then switch to the Paste JSON tab.' }, { status: 400 })
      if (!res.ok) return NextResponse.json({ error: `Steam returned ${res.status}. Try again in a moment.` }, { status: 502 })
      inv = await res.json()
      if (inv?.success === false || (!inv?.assets && !inv?.response?.assets)) {
        return NextResponse.json({ error: 'Steam inventory appears empty or private.' }, { status: 400 })
      }
    } catch (err: any) {
      return NextResponse.json({ error: `Could not reach Steam: ${err.message}` }, { status: 502 })
    }
    } else if (body.inventory_json) {
    // ── Mode 2: pasted / pre-parsed inventory JSON ──
    // Frontend always sends a parsed object now, but handle string fallback
    if (typeof body.inventory_json === 'string') {
      try { inv = JSON.parse(body.inventory_json) } catch {
        return NextResponse.json({ error: 'Invalid JSON — make sure you copied the complete inventory response' }, { status: 400 })
      }
    } else {
      inv = body.inventory_json
    }
  } else {
    return NextResponse.json({ error: 'Provide steam_id or inventory_json' }, { status: 400 })
  }

  const result = processInventory(inv, portfolio_id, user.id)
  if (!result) return NextResponse.json({ error: 'No items found. Make sure your inventory is Public.' }, { status: 400 })

  const { rows, skinsCount, stackablesCount } = result
  if (rows.length === 0) return NextResponse.json({ error: 'No marketable items found in inventory' }, { status: 400 })

  const { error: deleteErr } = await supabase
    .from('holdings').delete().eq('portfolio_id', portfolio_id).eq('user_id', user.id)
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  const { error: insertErr } = await supabase.from('holdings').insert(rows)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ imported: rows.length, skins: skinsCount, stackables: stackablesCount })
}
