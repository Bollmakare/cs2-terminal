const CACHE_KEY = 'cs2_data_v1'
const CACHE_TTL = 6 * 60 * 60 * 1000 // 6 hours
const CDN = 'https://community.akamai.steamstatic.com/economy/image'

let memCache = null
let fetchPromise = null

function readLocalCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) return null
    return data
  } catch { return null }
}

// Returns { [market_hash_name]: { iconUrl, steamPrice, skinportPrice, buff163Price } }
export async function getCS2Data() {
  if (memCache) return memCache
  const local = readLocalCache()
  if (local) { memCache = local; return local }

  if (!fetchPromise) {
    fetchPromise = fetch('https://prices.csgotrader.app/latest/prices.json')
      .then(r => r.json())
      .then(json => {
        const map = {}
        for (const [name, d] of Object.entries(json)) {
          map[name] = {
            iconUrl: d?.icon_url ?? null,
            steamPrice: d?.steam?.last_24h ?? null,
            skinportPrice: d?.skinport?.price ?? null,
            buff163Price: d?.buff163?.price ?? null,
          }
        }
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: map })) } catch {}
        memCache = map
        return map
      })
      .catch(() => ({}))
  }
  return fetchPromise
}

export function iconUrlToCdn(iconUrl) {
  return `${CDN}/${iconUrl}/128x96`
}
