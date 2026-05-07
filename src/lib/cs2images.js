const CACHE_KEY = 'cs2_icon_urls_v2'
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000
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

export async function getCS2IconUrls() {
  if (memCache) return memCache
  const local = readLocalCache()
  if (local) { memCache = local; return local }

  if (!fetchPromise) {
    fetchPromise = fetch('https://prices.csgotrader.app/latest/prices.json')
      .then(r => r.json())
      .then(json => {
        const map = {}
        for (const [name, d] of Object.entries(json)) {
          if (d?.icon_url) map[name] = d.icon_url
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
