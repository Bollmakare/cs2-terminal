const BASE = 'https://api.skinstrack.com/v1'
const KEY = process.env.SKINSTRACK_API_KEY ?? ''
const TIER = process.env.SKINSTRACK_TIER ?? 'Free'

export interface SkinstrackItem {
  market_hash_name: string
  price_usd: number
  price_steam: number | null
  price_buff: number | null
  price_skinport: number | null
  price_csfloat: number | null
  price_lis_skins: number | null
  volume_24h: number | null
  arb_spread_pct: number | null
  price_7d_avg: number | null
  price_30d_avg: number | null
  price_7d_change_pct: number | null
  icon_url: string | null
}

export async function getBulkPrices(limit = 1000): Promise<SkinstrackItem[]> {
  if (!KEY) return []
  try {
    const r = await fetch(`${BASE}/prices?limit=${limit}`, {
      headers: { 'x-api-key': KEY },
      next: { revalidate: 300 },
    })
    if (!r.ok) return []
    const data = await r.json()
    return data.items ?? []
  } catch { return [] }
}

export async function getItemPrice(marketHashName: string): Promise<SkinstrackItem | null> {
  if (!KEY) return null
  try {
    const encoded = encodeURIComponent(marketHashName)
    const r = await fetch(`${BASE}/item?name=${encoded}`, {
      headers: { 'x-api-key': KEY },
      next: { revalidate: 60 },
    })
    if (!r.ok) return null
    return await r.json()
  } catch { return null }
}

export async function getPriceHistory(marketHashName: string, days = 30) {
  if (!KEY || TIER === 'Free') return []
  try {
    const encoded = encodeURIComponent(marketHashName)
    const r = await fetch(`${BASE}/history?name=${encoded}&days=${days}`, {
      headers: { 'x-api-key': KEY },
      next: { revalidate: 3600 },
    })
    if (!r.ok) return []
    const data = await r.json()
    return data.history ?? []
  } catch { return [] }
}
