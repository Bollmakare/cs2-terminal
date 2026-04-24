const BASE = 'https://api.pricempire.com/v3'
const KEY = process.env.PRICEMPIRE_API_KEY ?? ''

export interface PriceEmpireItem {
  prices: {
    buff163?: { price: number; count: number }
    steam?: { price: number; count: number }
    skinport?: { price: number; count: number }
    waxpeer?: { price: number; count: number }
    cs_money?: { price: number; count: number }
    dmarket?: { price: number; count: number }
    tradeit?: { price: number; count: number }
    haloskins?: { price: number; count: number }
  }
  liquidity?: number
}

export async function getPrices(marketHashNames: string[]): Promise<Record<string, PriceEmpireItem>> {
  if (!KEY || marketHashNames.length === 0) return {}
  try {
    const r = await fetch(`${BASE}/items/prices?api_key=${KEY}&sources=buff163,steam,skinport,waxpeer,cs_money,dmarket,tradeit,haloskins&currency=USD`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ market_hash_names: marketHashNames }),
      next: { revalidate: 300 },
    })
    if (!r.ok) return {}
    return await r.json()
  } catch { return {} }
}

export async function getSinglePrice(marketHashName: string): Promise<PriceEmpireItem | null> {
  const result = await getPrices([marketHashName])
  return result[marketHashName] ?? null
}


// Compatibility exports
export async function fetchAllPricEmpire(_apiKey?: string): Promise<Record<string, number>> { return {} }
export function aggregatePrices<T>(items: T[]): T[] { return items }
