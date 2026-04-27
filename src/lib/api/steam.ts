/**
 * Steam Inventory Proxy
 * Server-side only — avoids CORS, rate-limits per SteamID
 */

import type { SteamInventoryItem } from '@/types/db'

export interface SteamInventoryItemWithInspect extends SteamInventoryItem {
  inspect_link: string | null
}

const STEAM_INV = 'https://steamcommunity.com/inventory'
const MIN_INTERVAL_MS = 30_000  // Steam enforces ~1 req/30s per IP per SteamID
const lastFetch = new Map<string, number>()

export async function fetchInventoryWithInspect(steamId: string, count = 500): Promise<SteamInventoryItemWithInspect[]> {
  if (!/^\d{17}$/.test(steamId)) throw new Error('Invalid SteamID64 — must be 17 digits')

  const last    = lastFetch.get(steamId) ?? 0
  const elapsed = Date.now() - last
  if (elapsed < MIN_INTERVAL_MS) {
    throw new Error(`Rate limited — wait ${Math.ceil((MIN_INTERVAL_MS - elapsed) / 1000)}s`)
  }

  const ctrl    = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 12_000)

  try {
    const res = await fetch(
      `${STEAM_INV}/${steamId}/730/2?l=english&count=${count}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CS2Terminal/0.2)' },
        signal: ctrl.signal,
      }
    )
    clearTimeout(timeout)

    if (res.status === 429) throw new Error('Steam rate limited (429). Wait 30+ seconds.')
    if (res.status === 403) throw new Error('Steam inventory is private — set to Public in Steam settings.')
    if (!res.ok) throw new Error(`Steam API ${res.status}`)

    const data = await res.json()
    if (!data.success) throw new Error('Steam returned unsuccessful — inventory may be private or empty.')

    lastFetch.set(steamId, Date.now())

    const descMap: Record<string, any> = {}
    for (const d of data.descriptions ?? []) {
      descMap[`${d.classid}_${d.instanceid}`] = d
    }

    const items: SteamInventoryItemWithInspect[] = []
    for (const asset of data.assets ?? []) {
      const desc = descMap[`${asset.classid}_${asset.instanceid}`]
      if (!desc) continue
      const parsed = parseItemWithInspect(asset, desc, steamId)
      if (parsed) items.push(parsed)
    }
    return items

  } catch (err) {
    clearTimeout(timeout)
    if ((err as Error).name === 'AbortError') throw new Error('Steam request timed out after 12s')
    throw err
  }
}

function parseItemWithInspect(asset: { assetid: string }, desc: any, steamId: string): SteamInventoryItemWithInspect | null {
  const base = parseItem(asset, desc)
  if (!base) return null

  let inspect_link: string | null = null
  for (const action of desc.actions ?? []) {
    if (action.link?.includes('csgo_econ_action_preview')) {
      inspect_link = action.link
        .replace('%owner_steamid%', steamId)
        .replace('%assetid%', asset.assetid)
      break
    }
  }

  return { ...base, inspect_link }
}

export async function fetchInventory(steamId: string, count = 500): Promise<SteamInventoryItem[]> {
  if (!/^\d{17}$/.test(steamId)) throw new Error('Invalid SteamID64 — must be 17 digits')

  const last    = lastFetch.get(steamId) ?? 0
  const elapsed = Date.now() - last
  if (elapsed < MIN_INTERVAL_MS) {
    throw new Error(`Rate limited — wait ${Math.ceil((MIN_INTERVAL_MS - elapsed) / 1000)}s`)
  }

  const ctrl    = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 12_000)

  try {
    const res = await fetch(
      `${STEAM_INV}/${steamId}/730/2?l=english&count=${count}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CS2Terminal/0.2)' },
        signal: ctrl.signal,
      }
    )
    clearTimeout(timeout)

    if (res.status === 429) throw new Error('Steam rate limited (429). Wait 30+ seconds.')
    if (res.status === 403) throw new Error('Steam inventory is private — set to Public in Steam settings.')
    if (!res.ok) throw new Error(`Steam API ${res.status}`)

    const data = await res.json()
    if (!data.success) throw new Error('Steam returned unsuccessful — inventory may be private or empty.')

    lastFetch.set(steamId, Date.now())

    const descMap: Record<string, any> = {}
    for (const d of data.descriptions ?? []) {
      descMap[`${d.classid}_${d.instanceid}`] = d
    }

    const items: SteamInventoryItem[] = []
    for (const asset of data.assets ?? []) {
      const desc = descMap[`${asset.classid}_${asset.instanceid}`]
      if (!desc) continue
      const parsed = parseItem(asset, desc)
      if (parsed) items.push(parsed)
    }
    return items

  } catch (err) {
    clearTimeout(timeout)
    if ((err as Error).name === 'AbortError') throw new Error('Steam request timed out after 12s')
    throw err
  }
}

function parseItem(asset: { assetid: string }, desc: any): SteamInventoryItem | null {
  const name: string = desc.market_hash_name
  if (!name) return null

  const condMap: Record<string, any> = {
    'Factory New': 'FN', 'Minimal Wear': 'MW',
    'Field-Tested': 'FT', 'Well-Worn': 'WW', 'Battle-Scarred': 'BS',
  }
  const condMatch = name.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)/)
  const condition = condMatch ? condMap[condMatch[1]] : null

  const is_stattrak = name.startsWith('StatTrak™')
  const is_souvenir  = name.startsWith('Souvenir')

  let category: any = 'other'
  for (const tag of desc.tags ?? []) {
    if (tag.category === 'Type') {
      const t = tag.localized_tag_name?.toLowerCase() ?? ''
      if (t.includes('rifle'))    category = 'rifle'
      else if (t.includes('sniper')) category = 'sniper'
      else if (t.includes('pistol')) category = 'pistol'
      else if (t.includes('knife') || name.startsWith('★')) category = 'knife'
      else if (t.includes('glove')) category = 'gloves'
      else if (t.includes('case'))  category = 'case'
      else if (t.includes('sticker')) category = 'sticker'
      break
    }
  }
  if (category === 'other' && name.startsWith('★')) category = 'knife'

  const item_name = name
    .replace(/^StatTrak™\s+/, '').replace(/^Souvenir\s+/, '')
    .replace(/\s*\([^)]+\)\s*$/, '').trim()

  return {
    asset_id: asset.assetid,
    market_hash_name: name,
    item_name,
    condition,
    category,
    is_stattrak,
    is_souvenir,
    icon_url: desc.icon_url
      ? `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}/256fx192f`
      : '',
    tradable:   desc.tradable   === 1,
    marketable: desc.marketable === 1,
  }
}
