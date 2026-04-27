import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const WEAR = ['Factory New','Minimal Wear','Field-Tested','Well-Worn','Battle-Scarred']

function category(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('ak-47')||n.includes('m4a')||n.includes('aug')||n.includes('sg 553')||n.includes('famas')||n.includes('galil')) return 'rifle'
  if (n.includes('awp')||n.includes('ssg 08')||n.includes('g3sg1')||n.includes('scar-20')) return 'sniper'
  if (n.includes('glock')||n.includes('usp')||n.includes('p2000')||n.includes('p250')||n.includes('five-seven')||n.includes('tec-9')||n.includes('cz75')||n.includes('deagle')||n.includes('desert eagle')||n.includes('r8')) return 'pistol'
  if (n.includes('knife')||n.includes('karambit')||n.includes('bayonet')||n.includes('butterfly')||n.includes('falchion')||n.includes('flip')||n.includes('gut ')||n.includes('huntsman')||n.includes('m9 bay')||n.includes('navaja')||n.includes('shadow daggers')||n.includes('stiletto')||n.includes('talon')||n.includes('ursus')||n.includes('paracord')||n.includes('survival')||n.includes('nomad')||n.includes('skeleton')||n.includes('classic knife')) return 'knife'
  if (n.includes('gloves')||n.includes('hand wraps')||n.includes('wraps')) return 'gloves'
  if (n.includes(' case')) return 'case'
  return 'other'
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const portfolio_id: string = body.portfolio_id
  const steam_id: string = body.steam_id
  if (!portfolio_id || !steam_id) return NextResponse.json({ error: 'missing fields' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch raw Steam inventory
  const url = 'https://steamcommunity.com/inventory/' + steam_id + '/730/2?l=english&count=5000'
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })
  if (!res.ok) return NextResponse.json({ error: 'Steam inventory fetch failed: ' + res.status }, { status: 502 })
  const inv = await res.json()
  if (!inv?.assets || !inv?.descriptions) return NextResponse.json({ error: 'Inventory empty or private' }, { status: 400 })

  // Build desc map
  const descMap = new Map<string, any>()
  for (const d of inv.descriptions) descMap.set(d.classid + '_' + d.instanceid, d)

  // Process items
  const skins: any[] = []
  const storageUnits: any[] = []
  const stackable = new Map<string, number>()

  for (const asset of inv.assets) {
    const desc = descMap.get(asset.classid + '_' + asset.instanceid)
    if (!desc || desc.tradable === 0 && desc.marketable === 0) continue
    const name: string = desc.market_hash_name ?? desc.name ?? ''
    if (!name) continue

    if (name === 'Storage Unit') {
      storageUnits.push({ name, assetid: asset.assetid })
    } else if (WEAR.some(w => name.includes(w))) {
      // Individual skin
      const isST = name.startsWith('StatTrak')
      const cond = WEAR.find(w => name.includes(w)) ?? null
      skins.push({ name, assetid: asset.assetid, isST, cond })
    } else {
      // Stackable
      stackable.set(name, (stackable.get(name) ?? 0) + parseInt(asset.amount ?? '1', 10))
    }
  }

  const rows: any[] = []

  for (const s of skins) {
    rows.push({ portfolio_id, item_name: s.name, item_condition: s.cond, item_category: category(s.name), quantity: 1, cost_basis: 0, is_stattrak: s.isST, steam_asset_id: s.assetid, group_label: s.name })
  }

  let suNum = 0
  for (const su of storageUnits) {
    suNum++
    rows.push({ portfolio_id, item_name: 'Storage Unit', item_category: 'storage_unit', quantity: 1, cost_basis: 0, steam_asset_id: su.assetid, group_label: 'Storage Unit #' + suNum })
  }

  for (const [name, qty] of stackable) {
    rows.push({ portfolio_id, item_name: name, item_category: category(name), quantity: qty, cost_basis: 0, group_label: name })
  }

  await supabase.from('holdings').delete().eq('portfolio_id', portfolio_id)
  const { error: insertError } = await supabase.from('holdings').insert(rows)
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ imported: rows.length, skins: skins.length, storage_units: storageUnits.length, stackables: stackable.size, floats_fetched: 0 })
}
