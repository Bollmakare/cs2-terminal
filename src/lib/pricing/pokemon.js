import { updateItem } from '../api.js'

const BASE_URL = 'https://api.pokemontcg.io/v2/cards'
const CACHE_TTL = 6 * 60 * 60 * 1000

function cacheKey(cardName, setName, number) {
  return `ptcg_${cardName}_${setName}_${number}`.replace(/\s+/g, '_').toLowerCase()
}

function getCached(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts < CACHE_TTL) return data
  } catch {}
  return null
}

function setCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch {}
}

function buildQuery(name, setName, number) {
  const parts = []
  if (name) parts.push(`name:"${name}"`)
  if (number) parts.push(`number:"${number}"`)
  if (setName) parts.push(`set.name:"${setName}"`)
  return parts.join(' ')
}

export function isAnyPokemonStale(items) {
  return items.some(i => {
    if (!i.last_price_fetched_at) return true
    return Date.now() - new Date(i.last_price_fetched_at).getTime() >= CACHE_TTL
  })
}

export async function fetchPokemonPrice(item) {
  const meta = item.metadata ?? {}
  if (meta.item_type && meta.item_type !== 'card') return null

  const cardName = item.name
  const setName = meta.set_name ?? ''
  const number = meta.card_number ?? ''

  const key = cacheKey(cardName, setName, number)
  const cached = getCached(key)
  if (cached) return cached

  const q = buildQuery(cardName, setName, number)
  const url = `${BASE_URL}?q=${encodeURIComponent(q)}&pageSize=5`

  let card = null
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`TCG API ${res.status}`)
    const json = await res.json()
    const cards = json.data ?? []
    card = cards[0] ?? null
  } catch (e) {
    console.warn('Pokémon price fetch error:', e.message)
    return null
  }

  if (!card) {
    setCache(key, null)
    return null
  }

  const cm = card.cardmarket?.prices?.trendPrice
    ?? card.cardmarket?.prices?.averageSellPrice
    ?? card.cardmarket?.prices?.avg30
    ?? card.cardmarket?.prices?.avg7
    ?? null

  const tcg = card.tcgplayer?.prices?.normal?.market
    ?? card.tcgplayer?.prices?.holofoil?.market
    ?? card.tcgplayer?.prices?.reverseHolofoil?.market
    ?? null

  const result = {
    cardmarket_eur: cm,
    tcgplayer_usd: tcg,
    image: card.images?.small ?? null,
    card_id: card.id,
    card_url: card.cardmarket?.url ?? card.tcgplayer?.url ?? null,
  }

  setCache(key, result)
  return result
}

export async function fetchAllPokemonPrices(items, onProgress) {
  const cards = items.filter(i => !i.metadata?.item_type || i.metadata.item_type === 'card')
  const results = {}
  let done = 0

  for (const item of cards) {
    const r = await fetchPokemonPrice(item)
    results[item.id] = r
    done++
    onProgress?.(done, cards.length)
    if (done < cards.length) await new Promise(resolve => setTimeout(resolve, 300))
  }

  return results
}

export async function applyPokemonPrices(items, priceResults) {
  const ts = new Date().toISOString()
  const tasks = items
    .filter(item => priceResults[item.id])
    .map(item => {
      if (item.metadata?.cert_value != null) return null  // graded slab — keep certified value
      const r = priceResults[item.id]
      const price = r.cardmarket_eur ?? r.tcgplayer_usd
      if (price == null) return null
      return updateItem(item.id, {
        value: price,
        last_price_fetched_at: ts,
        metadata: {
          ...item.metadata,
          ...(r.card_url ? { card_url: r.card_url } : {}),
          price_sources: {
            cardmarket_eur: r.cardmarket_eur,
            tcgplayer_usd: r.tcgplayer_usd,
          },
        },
      })
    })
    .filter(Boolean)
  await Promise.all(tasks)
}
