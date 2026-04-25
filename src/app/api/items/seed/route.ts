import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const maxDuration = 60

// One-time seed: pulls all CS2 skins from public CSGO-API repo
// GET /api/items/seed  (requires cron secret or logged-in admin)
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  const isCron = cronSecret === process.env.CRON_SECRET && !!cronSecret
  if (!isCron) {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  // Fetch all CS2 skins from ByMykel's public CSGO-API
  const [skinsRes, casesRes, agentsRes] = await Promise.allSettled([
    fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json'),
    fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json'),
    fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/agents.json'),
  ])

  const skins = skinsRes.status === 'fulfilled' && skinsRes.value.ok ? await skinsRes.value.json() : []
  const cases = casesRes.status === 'fulfilled' && casesRes.value.ok ? await casesRes.value.json() : []
  const agents = agentsRes.status === 'fulfilled' && agentsRes.value.ok ? await agentsRes.value.json() : []

  const slugify = (name: string) =>
    name.toLowerCase().replace(/[|]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)

  const parseCondition = (name: string) => {
    const m = name.match(/[(](Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)[)]$/)
    if (!m) return null
    const map: Record<string, string> = { 'Factory New': 'FN', 'Minimal Wear': 'MW', 'Field-Tested': 'FT', 'Well-Worn': 'WW', 'Battle-Scarred': 'BS' }
    return map[m[1]]
  }

  const extractIconUrl = (imageUrl: string | null) => {
    if (!imageUrl) return null
    // Steam CDN URLs look like: https://steamcommunity-a.akamaihd.net/economy/image/-9a81...
    // We want just the hash part for our icon_url field
    const match = imageUrl.match(/economy\/image\/([^/]+)/)
    return match ? match[1] : imageUrl
  }

  const rows: Record<string, unknown>[] = []
  const CONDITIONS = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred']

  // Process skins — each skin has multiple wear conditions
  for (const skin of skins) {
    if (!skin.name || !skin.weapon?.name) continue
    const skinName = skin.name // e.g. "AK-47 | Redline"
    const iconUrl = extractIconUrl(skin.image)
    const weapon = skin.weapon.name
    const isStattrak = skin.stattrak === true
    const isSouvenir = skin.souvenir === true

    // Determine which conditions this skin comes in
    const wears = skin.wears?.length ? skin.wears : CONDITIONS

    for (const wear of wears) {
      const prefix = isSouvenir ? 'Souvenir ' : isStattrak ? 'StatTrak\u2122 ' : ''
      const marketName = `${prefix}${skinName} (${wear})`
      const w = weapon.toLowerCase()
      let category = 'other'
      if (['karambit','butterfly','m9 bayonet','bayonet','gut knife','flip knife','falchion','shadow daggers','bowie','stiletto','ursus','navaja','talon','classic knife','skeleton','paracord','survival knife','nomad'].some(k => w.includes(k))) category = 'knife'
      else if (['ak-47','m4a4','m4a1-s','aug','sg 553','galil','famas'].some(k => w.includes(k))) category = 'rifle'
      else if (['awp','ssg 08','scar-20','g3sg1'].some(k => w.includes(k))) category = 'sniper'
      else if (['glock','usp','p250','desert eagle','r8','cz75','five-seven','tec-9','p2000'].some(k => w.includes(k))) category = 'pistol'
      else if (['mp5','mp7','mp9','mac-10','pp-bizon','ump','p90'].some(k => w.includes(k))) category = 'smg'
      else if (w.includes('glove') || w.includes('hand wraps')) category = 'gloves'

      rows.push({
        id: slugify(marketName),
        market_hash_name: marketName,
        weapon_type: weapon,
        skin_name: skin.description ?? skinName.split(' | ')[1] ?? '',
        condition: parseCondition(marketName),
        category,
        is_stattrak: isStattrak,
        is_souvenir: isSouvenir,
        icon_url: iconUrl,
        updated_at: new Date().toISOString(),
      })
    }
  }

  // Process cases
  for (const c of cases) {
    if (!c.name) continue
    rows.push({
      id: slugify(c.name),
      market_hash_name: c.name,
      weapon_type: 'Case',
      skin_name: c.name,
      condition: null,
      category: 'case',
      is_stattrak: false,
      is_souvenir: false,
      icon_url: extractIconUrl(c.image),
      updated_at: new Date().toISOString(),
    })
  }

  // Process agents
  for (const a of agents) {
    if (!a.name) continue
    rows.push({
      id: slugify(a.name),
      market_hash_name: a.name,
      weapon_type: 'Agent',
      skin_name: a.name,
      condition: null,
      category: 'other',
      is_stattrak: false,
      is_souvenir: false,
      icon_url: extractIconUrl(a.image),
      updated_at: new Date().toISOString(),
    })
  }

  if (!rows.length) return NextResponse.json({ error: 'No items fetched from source' }, { status: 500 })

  // Batch upsert
  const BATCH = 500
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase
      .from('items')
      .upsert(rows.slice(i, i + BATCH) as any, { onConflict: 'id', ignoreDuplicates: true })
    if (!error) inserted += Math.min(BATCH, rows.length - i)
  }

  return NextResponse.json({ success: true, total_rows: rows.length, inserted })
}