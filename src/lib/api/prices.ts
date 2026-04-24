// Price aggregation utilities
export interface PriceData { item_id: string; price_usd: number | null; price_buff?: number | null; price_steam?: number | null }
export async function fetchAllPrices(apiKey: string): Promise<PriceData[]> {
  try {
    const res = await fetch('https://api.skinstrack.com/v2/items?limit=5000', { headers: { 'x-api-key': apiKey } })
    if (!res.ok) return []
    const data = await res.json()
    return data?.items ?? []
  } catch { return [] }
}
export async function fetchAllPricEmpire(_apiKey: string): Promise<Record<string, number>> {
  return {}
}
export function aggregatePrices(items: PriceData[]): PriceData[] { return items }
export function calcArbitrage(buyPrice: number, sellPrice: number, fee = 0.12): number {
  return ((sellPrice * (1 - fee)) - buyPrice) / buyPrice * 100
}
export function getApiStatus(): { ok: boolean; message: string } {
  return { ok: true, message: 'ok' }
}
