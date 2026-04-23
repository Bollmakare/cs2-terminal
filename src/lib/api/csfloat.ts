const CSFLOAT_BASE = 'https://csfloat.com/api/v1'
const KEY = process.env.CSFLOAT_API_KEY ?? ''

export async function getListings(marketHashName: string, limit = 5) {
  if (!KEY) return []
  const params = new URLSearchParams({
    market_hash_name: marketHashName,
    sort_by: 'lowest_price',
    limit: String(limit),
  })
  const r = await fetch(`${CSFLOAT_BASE}/listings?${params}`, {
    headers: { Authorization: KEY },
    next: { revalidate: 300 },
  })
  if (!r.ok) return []
  const data = await r.json()
  return data.data ?? []
}

export async function getItemInfo(marketHashName: string) {
  if (!KEY) return null
  const params = new URLSearchParams({ market_hash_name: marketHashName, limit: '1' })
  const r = await fetch(`${CSFLOAT_BASE}/listings?${params}`, {
    headers: { Authorization: KEY },
    next: { revalidate: 3600 },
  })
  if (!r.ok) return null
  const data = await r.json()
  return data.data?.[0] ?? null
}
