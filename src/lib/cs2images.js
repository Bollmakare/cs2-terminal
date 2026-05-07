const CACHE_KEY = 'cs2_data_v1'
const CACHE_TTL = 6 * 60 * 60 * 1000 // 6 hours
const STEAM_IMG_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days
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

export function iconUrlToCdn(iconUrl) {
  return `${CDN}/${iconUrl}/128x96`
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
      .catch(e => { console.error('[CS2] csgotrader.app fetch failed:', e.message); fetchPromise = null; return {} })
  }
  return fetchPromise
}

// Fetches icon URL from Steam market render API and caches it locally for 7 days.
// Returns a CDN URL string, or null on failure (CORS / network / item not found).
export async function fetchSteamImage(name) {
  const ck = `cs2_img_${encodeURIComponent(name)}`
  try {
    const raw = localStorage.getItem(ck)
    if (raw) {
      const { ts, url } = JSON.parse(raw)
      if (Date.now() - ts < STEAM_IMG_TTL) return url
    }
  } catch {}

  try {
    const res = await fetch(
      `https://steamcommunity.com/market/listings/730/${encodeURIComponent(name)}/render?currency=3&start=0&count=1`
    )
    if (!res.ok) return null
    const json = await res.json()
    const assets730 = json.assets?.['730']?.['2']
    if (!assets730) return null
    const iconUrl = Object.values(assets730)[0]?.icon_url
    if (!iconUrl) return null
    const cdnUrl = iconUrlToCdn(iconUrl)
    try { localStorage.setItem(ck, JSON.stringify({ ts: Date.now(), url: cdnUrl })) } catch {}
    return cdnUrl
  } catch {
    return null
  }
}
