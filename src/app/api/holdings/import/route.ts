import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchInventoryWithInspect } from '@/lib/api/steam'

export const maxDuration = 60

const WEAR_CONDITIONS = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred']
const CSFLOAT_BASE = 'https://api.csgofloat.com'

function hasWearCondition(name: string): boolean {
  return WEAR_CONDITIONS.some(c => name.includes(c))
}

function isStorageUnit(name: string): boolean {
  return name === 'Storage Unit'
}

interface CSFloatResult {
  iteminfo?: {
    floatvalue?: number
    paintseed?: number
  }
}

async function fetchCSFloat(inspectLink: string): Promise<CSFloatResult | null> {
  const key = process.env.CSFLOAT_API_KEY
  if (!key || !inspectLink) return null

  try {
    const url = `${CSFLOAT_BASE}/?url=${encodeURIComponent(inspectLink)}`
    const res = await fetch(url, {
      headers: { Authorization: key },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { portfolio_id } = body

  if (!portfolio_id) {
    return NextResponse.json({ error: 'portfolio_id required' }, { status: 400 })
  }

  const { data: pf } = await supabase
    .from('portfolios')
    .select('id')
    .eq('id', portfolio_id)
    .eq('user_id', user.id)
    .single()
  if (!pf) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('steam_id')
    .eq('id', user.id)
    .single()

  const steamId = body.steam_id ?? profile?.steam_id
  if (!steamId) {
    return NextResponse.json(
      { error: 'No steam_id found — pass steam_id in request body' },
      { status: 400 }
    )
  }

  let rawItems: Awaited<ReturnType<typeof fetchInventoryWithInspect>>
  try {
    rawItems = await fetchInventoryWithInspect(steamId)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }

  const marketableItems = rawItems.filter(i => i.marketable)

  type RawItem = (typeof marketableItems)[number]
  const individualItems: RawItem[] = []
  const stackableMap = new Map<string, { count: number; item: RawItem }>()

  for (const item of marketableItems) {
    if (hasWearCondition(item.market_hash_name) || isStorageUnit(item.market_hash_name)) {
      individualItems.push(item)
    } else {
      const existing = stackableMap.get(item.market_hash_name)
      if (existing) {
        existing.count++
      } else {
        stackableMap.set(item.market_hash_name, { count: 1, item })
      }
    }
  }

  const hasCsFloat = !!process.env.CSFLOAT_API_KEY
  const floatMap = new Map<string, { float_value: number | null; pattern_id: number | null }>()

  if (hasCsFloat) {
    const itemsWithLinks = individualItems.filter(i => i.inspect_link && !isStorageUnit(i.market_hash_name))
    const BATCH = 4
    for (let i = 0; i < itemsWithLinks.length; i += BATCH) {
      const batch = itemsWithLinks.slice(i, i + BATCH)
      const results = await Promise.all(batch.map(item => fetchCSFloat(item.inspect_link!)))
      for (let j = 0; j < batch.length; j++) {
        const r = results[j]
        floatMap.set(batch[j].asset_id, {
          float_value: r?.iteminfo?.floatvalue ?? null,
          pattern_id:  r?.iteminfo?.paintseed  ?? null,
        })
      }
      if (i + BATCH < itemsWithLinks.length) await sleep(500)
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const slug  = (name: string) =>
    name.toLowerCase().replace(/[★™]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  const rows: any[] = []

  let suIndex = 1
  for (const item of individualItems) {
    const floatData = floatMap.get(item.asset_id)
    const isSU = isStorageUnit(item.market_hash_name)

    rows.push({
      portfolio_id,
      user_id:        user.id,
      item_id:        slug(item.market_hash_name),
      item_name:      item.market_hash_name,
      item_condition: item.condition,
      item_category:  isSU ? 'storage_unit' : (item.category ?? 'other'),
      is_stattrak:    item.is_stattrak,
      quantity:       1,
      cost_basis:     0,
      acquired_at:    today,
      steam_asset_id: item.asset_id,
      float_value:    floatData?.float_value  ?? null,
      pattern_id:     floatData?.pattern_id   ?? null,
      group_label:    isSU ? `Storage Unit #${suIndex++}` : null,
      storage_unit:   null,
    })
  }

  for (const [name, { count, item }] of stackableMap.entries()) {
    rows.push({
      portfolio_id,
      user_id:        user.id,
      item_id:        slug(name),
      item_name:      name,
      item_condition: item.condition,
      item_category:  item.category ?? 'other',
      is_stattrak:    item.is_stattrak,
      quantity:       count,
      cost_basis:     0,
      acquired_at:    today,
      steam_asset_id: null,
      float_value:    null,
      pattern_id:     null,
      group_label:    null,
      storage_unit:   null,
    })
  }

  const { error: deleteErr } = await supabase
    .from('holdings')
    .delete()
    .eq('portfolio_id', portfolio_id)
    .eq('user_id', user.id)

  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  const { data: inserted, error: insertErr } = await supabase
    .from('holdings')
    .insert(rows)
    .select('id')

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  const floatsFetched = floatMap.size
  const storageUnits  = rows.filter(r => r.item_category === 'storage_unit').length
  const stackables    = stackableMap.size
  const skins         = individualItems.length - storageUnits

  return NextResponse.json({
    imported:      inserted?.length ?? 0,
    skins,
    storage_units: storageUnits,
    stackables,
    floats_fetched: floatsFetched,
  })
}
