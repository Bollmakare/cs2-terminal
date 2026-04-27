import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchInventoryWithInspect } from '@/lib/api/steam'

const WEAR_CONDITIONS = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred']

function hasWearCondition(name: string): boolean {
  return WEAR_CONDITIONS.some(c => name.includes(c))
}

function isStorageUnit(name: string): boolean {
  return name === 'Storage Unit'
}

function getCategory(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('ak-47') || n.includes('m4a') || n.includes('aug') || n.includes('sg 553') || n.includes('famas') || n.includes('galil')) return 'rifle'
  if (n.includes('awp') || n.includes('ssg 08') || n.includes('g3sg1') || n.includes('scar-20')) return 'sniper'
  if (n.includes('glock') || n.includes('usp') || n.includes('p2000') || n.includes('p250') || n.includes('five-seven') || n.includes('tec-9') || n.includes('cz75') || n.includes('desert eagle') || n.includes('r8')) return 'pistol'
  if (n.includes('knife') || n.includes('karambit') || n.includes('bayonet') || n.includes('butterfly') || n.includes('falchion') || n.includes('flip') || n.includes('gut ') || n.includes('huntsman') || n.includes('m9') || n.includes('navaja') || n.includes('shadow daggers') || n.includes('stiletto') || n.includes('talon') || n.includes('ursus') || n.includes('paracord') || n.includes('survival') || n.includes('nomad') || n.includes('skeleton') || n.includes('classic knife')) return 'knife'
  if (n.includes('gloves') || n.includes('wraps')) return 'gloves'
  if (n.includes('case')) return 'case'
  return 'other'
}

export async function POST(req: NextRequest) {
  const { portfolio_id, steam_id } = await req.json()
  if (!portfolio_id || !steam_id) {
    return NextResponse.json({ error: 'portfolio_id and steam_id required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch Steam inventory
  let items: any[]
  try {
    items = await fetchInventoryWithInspect(steam_id, 730, 2)
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Failed to fetch inventory' }, { status: 502 })
  }

  if (!items.length) {
    return NextResponse.json({ error: 'Inventory empty or private' }, { status: 400 })
  }

  const skins: any[] = []
  const storageUnitItems: any[] = []
  const stackableMap = new Map<string, { item: any; qty: number }>()

  for (const item of items) {
    const name: string = item.item_name
    if (isStorageUnit(name)) {
      storageUnitItems.push(item)
    } else if (hasWearCondition(name)) {
      skins.push(item)
    } else {
      const existing = stackableMap.get(name)
      if (existing) existing.qty += (item.quantity ?? 1)
      else stackableMap.set(name, { item, qty: item.quantity ?? 1 })
    }
  }

  const rows: any[] = []

  for (const skin of skins) {
    rows.push({
      portfolio_id,
      item_name: skin.item_name,
      item_condition: skin.item_condition ?? null,
      item_category: getCategory(skin.item_name),
      quantity: 1,
      cost_basis: 0,
      is_stattrak: skin.is_stattrak ?? false,
      steam_asset_id: skin.assetid ?? skin.asset_id ?? null,
      group_label: skin.item_name,
    })
  }

  let suCount = 0
  for (const su of storageUnitItems) {
    suCount++
    rows.push({
      portfolio_id,
      item_name: 'Storage Unit',
      item_category: 'storage_unit',
      quantity: 1,
      cost_basis: 0,
      steam_asset_id: su.assetid ?? su.asset_id ?? null,
      group_label: 'Storage Unit #' + suCount,
    })
  }

  for (const [name, { item, qty }] of stackableMap) {
    rows.push({
      portfolio_id,
      item_name: name,
      item_category: getCategory(name),
      quantity: qty,
      cost_basis: 0,
      group_label: name,
    })
  }

  await supabase.from('holdings').delete().eq('portfolio_id', portfolio_id)
  const { error: insertError } = await supabase.from('holdings').insert(rows)
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    imported: rows.length,
    skins: skins.length,
    storage_units: storageUnitItems.length,
    stackables: stackableMap.size,
    floats_fetched: 0,
  })
}
